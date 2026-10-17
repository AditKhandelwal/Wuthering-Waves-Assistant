// Renders the real Build Card image for /build (see discord.md). A plain
// Node.js serverless function -- NOT Edge (no `export const config = {
// runtime: "edge" }` here, which is what makes a Vercel api/ file Edge;
// omitting it defaults to Node). satori + @resvg/resvg-js need real Node
// APIs that an earlier Edge-runtime attempt for /builds's grid image
// found Edge doesn't provide (WASM/module-resolution fights documented in
// discord.md) -- running this as a normal Node function sidesteps all of
// that via plain npm package resolution.
//
// Uses VercelRequest/VercelResponse (the classic Node-function signature),
// NOT the Fetch API Request/Response interactions.ts (Edge) uses --
// confirmed via a real deploy failure that Vercel's Node.js function
// runtime invokes the handler Express-style, not Fetch-style, even though
// nothing in the Vercel docs flagged this as mandatory up front
// (`TypeError: req.headers.get is not a function`). Edge and Node
// functions are NOT interchangeable in handler shape on this platform.
//
// Never called directly by Discord. interactions.ts's handleBuild()
// triggers this with a fire-and-forget internal fetch after deferring the
// Discord response, since the DB reads + image render can't reliably fit
// Discord's 3-second initial-response budget. Protected by a shared
// secret header (X-Internal-Secret / DISCORD_INTERNAL_SECRET) -- Discord
// user ids aren't secret, so without this check anyone could hit this
// route directly and either burn compute or read another linked user's
// build data, bypassing Discord's own interaction signature entirely.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getServiceClient, editOriginalText, editOriginalWithImage } from "./_shared.js";
import { renderBuildCard, type BuildCardData, type ForteColumnNodes } from "./_buildCardImage.js";
import {
  computeEchoStatTotals,
  computeEchoSlotBreakdown,
  computeActiveSetBonuses,
  computeFinalStats,
  computeForteBonusTotals,
  computeSequenceBonusTotals,
  computeWeaponAtk,
  computeWeaponSecondaryStat,
  computeWeaponPassiveBonusTotals,
  normalizeEchoName,
  FORTE_COLUMN_ORDER,
  type StatCurveData,
  type WeaponStatCurves,
  type WeaponPassiveBonuses,
  type EchoStatCurves,
  type EchoCatalogEntry,
  type EchoSet,
  type SavedEchoSlot,
} from "./stats.js";
// Real Node ESM (unlike Edge's esbuild-bundled functions, which pre-inline
// JSON at build time and actively reject this syntax -- see interactions.ts's
// comment) enforces import attributes on JSON imports at actual runtime,
// confirmed via a real deploy failure: `ERR_IMPORT_ATTRIBUTE_MISSING:
// Module ".../characters.json" needs an import attribute of "type: json"`.
// Opposite requirement from the Edge function -- do NOT remove this here,
// and do NOT add it in interactions.ts.
import characters from "./characters.json" with { type: "json" };
import weaponNames from "./weapon_names.json" with { type: "json" };
import weaponCatalogRaw from "./weapon_catalog.json" with { type: "json" };
import talentDataRaw from "./talent_data.json" with { type: "json" };
import statIconsRaw from "./stat_icons.json" with { type: "json" };
import characterStatCurvesRaw from "./character_stat_curves.json" with { type: "json" };
import weaponStatCurvesRaw from "./weapon_stat_curves.json" with { type: "json" };
import weaponPassiveBonusesRaw from "./weapon_passive_bonuses.json" with { type: "json" };
import echoCatalogRaw from "./echo_catalog.json" with { type: "json" };
import echoStatCurvesRaw from "./echo_stat_curves.json" with { type: "json" };
import echoSetsRaw from "./echo_sets.json" with { type: "json" };
import sequenceStatNodesRaw from "./sequence_stat_nodes.json" with { type: "json" };
import sequenceNodeStatBonusesRaw from "./sequence_node_stat_bonuses.json" with { type: "json" };

const characterStatCurves = characterStatCurvesRaw as unknown as StatCurveData;
const weaponStatCurves = weaponStatCurvesRaw as unknown as WeaponStatCurves;
const weaponPassiveBonuses = weaponPassiveBonusesRaw as unknown as WeaponPassiveBonuses;
const weaponCatalog = weaponCatalogRaw as Record<string, { name: string; pictureUrl: string | null }>;
const statIcons = statIconsRaw as Record<string, string>;
interface TalentDataEntry {
  talents: { skillType: string; name: string; pictureUrl: string | null }[];
  inherentSkills: { name: string; pictureUrl: string | null }[];
  keynoteSkills: { skillType: string; name: string; pictureUrl: string | null }[];
  sequenceNodes: { sequence: number; name: string; pictureUrl: string | null }[];
}
const talentData = talentDataRaw as Record<string, TalentDataEntry>;
const echoStatCurves = echoStatCurvesRaw as unknown as EchoStatCurves;
const echoSets = (echoSetsRaw as { sets: EchoSet[] }).sets;
// iconUrl isn't part of stats.ts's EchoSet type (the agent doesn't render
// images, same reasoning as echoPictureByNormalizedName below) -- a
// separate local lookup for the small sonata-set badge on each echo tile.
const echoSetIconByName = new Map<string, string>();
for (const s of (echoSetsRaw as { sets: (EchoSet & { iconUrl: string })[] }).sets) {
  echoSetIconByName.set(s.name, s.iconUrl);
}
const sequenceStatNodes = (
  sequenceStatNodesRaw as unknown as {
    nodes: Record<string, Record<string, [{ stat: string; value: number }, { stat: string; value: number }]>>;
  }
).nodes;
const sequenceNodeStatBonuses = (
  sequenceNodeStatBonusesRaw as { bonuses: Record<string, { sequence: number; stat: string; value: number }[]> }
).bonuses;

// Keyed by normalizeEchoName so a saved echoName (sourced from Kuro's
// guide API at save time) reliably matches this catalog's punctuation --
// same tolerance as findEchoByName in frontend/src/lib/echoes.ts and the
// agent's own echoByNormalizedName.
const SITE_URL = "https://wuthering-waves-assistant.vercel.app";

// Unlike character portraits and weapon icons (absolute Kuro/dotgg CDN
// URLs), echo images are self-hosted under frontend/public/echo-images/
// (download_echo_images.py -- avoids CORS issues with their original
// game8.co source), so echo_catalog.json's pictureUrl is a site-RELATIVE
// path like "/echo-images/....png". Satori has no "current page" to
// resolve a relative URL against and hard-fails on one ("Image source
// must be an absolute URL") -- confirmed via a real deploy failure, the
// echo tile row silently never appeared at all (not even empty tiles) on
// the first live /build test. Must prepend SITE_URL before handing a
// pictureUrl to satori.
function absoluteUrl(url: string | null): string | null {
  if (!url) return null;
  return url.startsWith("/") ? `${SITE_URL}${url}` : url;
}

const echoByNormalizedName = new Map<string, EchoCatalogEntry>();
// pictureUrl isn't part of stats.ts's EchoCatalogEntry type (the agent
// doesn't render images, so it was never added there, and stats.ts must
// stay byte-identical to supabase/functions/agent/stats.ts -- see that
// file's header) -- kept as a separate local lookup instead of extending
// the shared type for a Discord-only need.
const echoPictureByNormalizedName = new Map<string, string>();
for (const e of (echoCatalogRaw as { echoes: (EchoCatalogEntry & { pictureUrl: string })[] }).echoes) {
  echoByNormalizedName.set(normalizeEchoName(e.name), e);
  echoPictureByNormalizedName.set(normalizeEchoName(e.name), e.pictureUrl);
}

interface RenderBody {
  userId: string;
  roleGbId: string;
  applicationId: string;
  interactionToken: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  const secret = req.headers["x-internal-secret"];
  if (!secret || secret !== process.env.DISCORD_INTERNAL_SECRET) {
    res.status(401).send("Unauthorized");
    return;
  }

  // Vercel's Node function runtime auto-parses a JSON body (matching
  // Content-Type) into req.body -- interactions.ts always sends that
  // header on this internal call.
  const { userId, roleGbId, applicationId, interactionToken } = req.body as RenderBody;

  const supabase = getServiceClient();
  if (!supabase) {
    await editOriginalText(applicationId, interactionToken, "Something's misconfigured -- try again later.");
    res.status(200).send("ok");
    return;
  }

  const charInfo = (
    characters as Record<
      string,
      {
        name: string;
        element: string | null;
        cardPictureUrl: string | null;
        illustrationPictureUrl: string | null;
        elementIconUrl: string | null;
      }
    >
  )[roleGbId];
  const charName = charInfo?.name ?? roleGbId;

  const { data: build, error } = await supabase
    .from("user_characters")
    .select(
      "character_level, weapon_gb_id, weapon_level, weapon_rank, resonance_level, talent_levels, inherent_active, forte_node_active, echoes",
    )
    .eq("user_id", userId)
    .eq("role_gb_id", roleGbId)
    .maybeSingle();

  if (error) {
    await editOriginalText(applicationId, interactionToken, "Couldn't load that build -- try again later.");
    res.status(200).send("ok");
    return;
  }
  if (!build) {
    await editOriginalText(applicationId, interactionToken, `You haven't saved a build for **${charName}** yet.`);
    res.status(200).send("ok");
    return;
  }

  const echoSlots = (build.echoes ?? []) as SavedEchoSlot[];
  const echoTotals = computeEchoStatTotals(echoSlots, echoByNormalizedName, echoStatCurves);
  const activeEchoSets = computeActiveSetBonuses(echoSlots, echoSets);
  const echoSlotBreakdown = computeEchoSlotBreakdown(echoSlots, echoByNormalizedName, echoStatCurves);
  const echoes = echoSlotBreakdown.map((slot) => ({
    pictureUrl: slot.echoName ? absoluteUrl(echoPictureByNormalizedName.get(normalizeEchoName(slot.echoName)) ?? null) : null,
    echoName: slot.echoName,
    cost: slot.cost,
    setName: slot.setName,
    setIconUrl: slot.setName ? (echoSetIconByName.get(slot.setName) ?? null) : null,
    mainStats: slot.mainStats,
    substats: slot.substats,
  }));
  const forteBonusTotals = computeForteBonusTotals(
    (build.forte_node_active ?? []) as boolean[],
    sequenceStatNodes[roleGbId],
  );
  const sequenceBonusTotals = computeSequenceBonusTotals(
    sequenceNodeStatBonuses[roleGbId],
    (build.resonance_level ?? 0) as number,
  );
  const finalStats = computeFinalStats({
    roleGbId,
    element: charInfo?.element ?? null,
    level: build.character_level,
    curves: characterStatCurves,
    weaponGbId: build.weapon_gb_id,
    weaponLevel: build.weapon_level,
    weaponRank: build.weapon_rank,
    weaponCurves: weaponStatCurves,
    weaponPassiveBonuses,
    echoTotals,
    forteBonusTotals,
    sequenceBonusTotals,
  });

  // basicAttackDmgBonus/heavyAttackDmgBonus/skillDmgBonus/liberationDmgBonus
  // aren't part of stats.ts's FinalStats (the agent doesn't need them, and
  // stats.ts must stay byte-identical to the agent's copy -- see that
  // file's header), so these are computed locally here, replicating
  // frontend/src/lib/finalStats.ts's own formula exactly: echo totals +
  // the weapon's unconditional passive bonus, nothing else contributes to
  // these four. computeWeaponPassiveBonusTotals is already exported by
  // stats.ts (computeFinalStats calls it internally too; calling it a
  // second time here is cheap and pure, not worth threading the result
  // back out of that function instead).
  const weaponPassiveTotals = build.weapon_gb_id
    ? computeWeaponPassiveBonusTotals(weaponPassiveBonuses, build.weapon_gb_id, build.weapon_rank)
    : new Map<string, number>();
  const extraDmgBonuses = {
    basicAttackDmgBonus: (echoTotals.get("Basic Attack DMG Bonus") ?? 0) + (weaponPassiveTotals.get("Basic Attack DMG Bonus") ?? 0),
    heavyAttackDmgBonus: (echoTotals.get("Heavy Attack DMG Bonus") ?? 0) + (weaponPassiveTotals.get("Heavy Attack DMG Bonus") ?? 0),
    skillDmgBonus:
      (echoTotals.get("Resonance Skill DMG Bonus") ?? 0) + (weaponPassiveTotals.get("Resonance Skill DMG Bonus") ?? 0),
    liberationDmgBonus:
      (echoTotals.get("Resonance Liberation DMG Bonus") ?? 0) +
      (weaponPassiveTotals.get("Resonance Liberation DMG Bonus") ?? 0),
  };

  const names: Record<string, string> = weaponNames;
  const weaponAtk = build.weapon_gb_id ? computeWeaponAtk(weaponStatCurves, build.weapon_gb_id, build.weapon_level) : null;
  const weaponSecondaryStat = build.weapon_gb_id
    ? computeWeaponSecondaryStat(weaponStatCurves, build.weapon_gb_id, build.weapon_level)
    : null;

  const talentInfo = talentData[roleGbId];
  const talentLevels = (build.talent_levels ?? []) as number[];
  const talents = (talentInfo?.talents ?? []).map((t, i) => ({ ...t, level: talentLevels[i] ?? 1 }));

  const inherentActiveArr = (build.inherent_active ?? []) as boolean[];
  const inherentSkills = (talentInfo?.inherentSkills ?? []).map((s, i) => ({
    ...s,
    active: inherentActiveArr[i] ?? true,
  }));

  const forteNodeActiveArr = (build.forte_node_active ?? []) as boolean[];
  const forteNodeData = sequenceStatNodes[roleGbId];
  const forteColumns: Record<string, ForteColumnNodes> = {};
  FORTE_COLUMN_ORDER.forEach((col, colIdx) => {
    const nodes = forteNodeData?.[col];
    if (!nodes) return;
    forteColumns[col] = {
      nodes,
      active: [forteNodeActiveArr[colIdx * 2] ?? false, forteNodeActiveArr[colIdx * 2 + 1] ?? false],
    };
  });

  const cardData: BuildCardData = {
    name: charName,
    element: charInfo?.element ?? null,
    elementIconUrl: charInfo?.elementIconUrl ?? null,
    illustrationPictureUrl: charInfo?.illustrationPictureUrl ?? null,
    level: build.character_level,
    weaponName: build.weapon_gb_id ? (names[build.weapon_gb_id] ?? `Unknown (${build.weapon_gb_id})`) : null,
    weaponPictureUrl: build.weapon_gb_id ? (weaponCatalog[build.weapon_gb_id]?.pictureUrl ?? null) : null,
    weaponLevel: build.weapon_level,
    weaponRank: build.weapon_rank,
    weaponAtk,
    weaponSecondaryStat,
    resonanceLevel: build.resonance_level,
    finalStats,
    extraDmgBonuses,
    activeEchoSets: activeEchoSets.map((s) => ({ setName: s.setName, count: s.count })),
    talents,
    inherentSkills,
    keynoteSkills: talentInfo?.keynoteSkills ?? [],
    sequenceNodes: talentInfo?.sequenceNodes ?? [],
    forteColumns,
    statIcons,
    echoes,
  };

  // No title/text here -- the card image itself already shows name, level,
  // weapon, and stats. Sent as a plain attached image, not an embed (a
  // user asked for it as its own message rather than boxed in an embed).
  const imageBytes = await renderBuildCard(cardData);
  await editOriginalWithImage(applicationId, interactionToken, imageBytes, "build-card.png");

  res.status(200).send("ok");
}

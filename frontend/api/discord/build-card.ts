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
import { renderBuildCard, type BuildCardData } from "./_buildCardImage.js";
import {
  computeEchoStatTotals,
  computeActiveSetBonuses,
  computeFinalStats,
  computeForteBonusTotals,
  computeSequenceBonusTotals,
  normalizeEchoName,
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
const echoStatCurves = echoStatCurvesRaw as unknown as EchoStatCurves;
const echoSets = (echoSetsRaw as { sets: EchoSet[] }).sets;
const sequenceStatNodes = (
  sequenceStatNodesRaw as { nodes: Record<string, Record<string, { stat: string; value: number }[]>> }
).nodes;
const sequenceNodeStatBonuses = (
  sequenceNodeStatBonusesRaw as { bonuses: Record<string, { sequence: number; stat: string; value: number }[]> }
).bonuses;

// Keyed by normalizeEchoName so a saved echoName (sourced from Kuro's
// guide API at save time) reliably matches this catalog's punctuation --
// same tolerance as findEchoByName in frontend/src/lib/echoes.ts and the
// agent's own echoByNormalizedName.
const echoByNormalizedName = new Map<string, EchoCatalogEntry>();
for (const e of (echoCatalogRaw as { echoes: EchoCatalogEntry[] }).echoes) {
  echoByNormalizedName.set(normalizeEchoName(e.name), e);
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

  const charInfo = (characters as Record<string, { name: string; element: string | null; cardPictureUrl: string | null }>)[
    roleGbId
  ];
  const charName = charInfo?.name ?? roleGbId;

  const { data: build, error } = await supabase
    .from("user_characters")
    .select(
      "character_level, weapon_gb_id, weapon_level, weapon_rank, resonance_level, forte_node_active, echoes",
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

  const names: Record<string, string> = weaponNames;
  const cardData: BuildCardData = {
    name: charName,
    element: charInfo?.element ?? null,
    pictureUrl: charInfo?.cardPictureUrl ?? null,
    level: build.character_level,
    weaponName: build.weapon_gb_id ? (names[build.weapon_gb_id] ?? `Unknown (${build.weapon_gb_id})`) : null,
    weaponLevel: build.weapon_level,
    weaponRank: build.weapon_rank,
    resonanceLevel: build.resonance_level,
    finalStats,
    activeEchoSets: activeEchoSets.map((s) => ({ setName: s.setName, count: s.count })),
  };

  // No title/text here -- the card image itself already shows name, level,
  // weapon, and stats; a duplicate embed title would just repeat it.
  const imageBytes = await renderBuildCard(cardData);
  await editOriginalWithImage(applicationId, interactionToken, imageBytes, "build-card.png", { color: 0xc9a24b });

  res.status(200).send("ok");
}

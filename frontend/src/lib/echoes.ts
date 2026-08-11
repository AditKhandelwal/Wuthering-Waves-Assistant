import type {
  ActiveSetBonus,
  EchoCatalogEntry,
  EchoMainStatOption,
  EchoSet,
  EchoStatCurves,
  EquippedEcho,
  SubStatOption,
} from "../types/echo";
import type { ComputedStats } from "../types/stats";

// Stats that render as a flat number rather than a percentage. Everything
// else in this app's echo/weapon stat names is a percent -- same convention
// as computeWeaponSecondaryStat in weapons.ts (only ATK is flat there).
const FLAT_STAT_NAMES = new Set(["HP", "ATK", "DEF"]);

export function isFlatStat(statName: string): boolean {
  return FLAT_STAT_NAMES.has(statName);
}

export function formatStatValue(value: number, statName: string): string {
  return isFlatStat(statName) ? String(Math.round(value)) : `${value.toFixed(1)}%`;
}

// Cost tier has no in-game color convention sourced from this app's data --
// UI-only design choice (gold = rarest/highest cost), not a game data claim.
// Spelled out literally per Tailwind v4's dynamic-class-string gotcha (see
// .claude/rules/frontend.md) -- shared by EchoPicker, EchoSlotCard, and
// EchoCardTile so the convention stays in one place.
export const COST_DISC_CLASS: Record<1 | 3 | 4, string> = {
  4: "border-gold text-gold-soft",
  3: "border-gold-soft/60 text-text",
  1: "border-border text-text-muted",
};

interface RawEchoCatalog {
  echoes: {
    name: string;
    cost: 1 | 3 | 4;
    category: EchoCatalogEntry["category"];
    setNames: string[];
    kuroGbId: string | null;
    pictureUrl: string | null;
  }[];
}

interface RawEchoSets {
  sets: EchoSet[];
}

interface RawEchoStatCurves {
  mainStatOptionsByCost: Record<string, EchoMainStatOption[]>;
  staticMainStatByCost: Record<string, EchoMainStatOption>;
  subStatOptions: SubStatOption[];
}

export interface EchoCatalog {
  byCost: Record<1 | 3 | 4, EchoCatalogEntry[]>;
  bySetName: Record<string, EchoCatalogEntry[]>;
}

// Temporary static data source standing in for a future backend endpoint,
// same pattern as lib/characters.ts.
export async function loadEchoCatalog(): Promise<EchoCatalog> {
  const res = await fetch("/data/echo_catalog.json");
  const raw: RawEchoCatalog = await res.json();

  const byCost = { 1: [], 3: [], 4: [] } as Record<1 | 3 | 4, EchoCatalogEntry[]>;
  const bySetName: Record<string, EchoCatalogEntry[]> = {};

  for (const e of raw.echoes) {
    const entry: EchoCatalogEntry = {
      name: e.name,
      cost: e.cost,
      category: e.category,
      setNames: e.setNames,
      kuroGbId: e.kuroGbId,
      pictureUrl: e.pictureUrl,
    };
    byCost[e.cost].push(entry);
    for (const setName of e.setNames) {
      (bySetName[setName] ??= []).push(entry);
    }
  }

  for (const list of Object.values(byCost)) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  return { byCost, bySetName };
}

// Kuro's guide API and the game8.co-sourced catalog punctuate the same echo
// name differently often enough to matter -- e.g. Kuro's "Reminiscence -
// Nightmare: Adam Smasher" vs the catalog's "Reminiscence: Nightmare Adam
// Smasher" (dash/colon swapped), or "Twin Nova: Nebulous Cannon" vs "Twin
// Nova - Nebulous Cannon". Strip punctuation and collapse whitespace before
// comparing so a signature-echo lookup isn't silently defeated by this.
function normalizeEchoName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Finds a catalog entry by name across all cost tiers (a character's
// signature echo isn't always cost 4), tolerant of the punctuation
// mismatches above.
export function findEchoByName(catalog: EchoCatalog, name: string): EchoCatalogEntry | null {
  const target = normalizeEchoName(name);
  for (const list of Object.values(catalog.byCost)) {
    const match = list.find((e) => normalizeEchoName(e.name) === target);
    if (match) return match;
  }
  return null;
}

export async function loadEchoSets(): Promise<EchoSet[]> {
  const res = await fetch("/data/echo_sets.json");
  const raw: RawEchoSets = await res.json();
  return raw.sets;
}

export async function loadEchoStatCurves(): Promise<EchoStatCurves> {
  const res = await fetch("/data/echo_stat_curves.json");
  const raw: RawEchoStatCurves = await res.json();
  return {
    mainStatOptionsByCost: {
      1: raw.mainStatOptionsByCost["1"] ?? [],
      3: raw.mainStatOptionsByCost["3"] ?? [],
      4: raw.mainStatOptionsByCost["4"] ?? [],
    },
    staticMainStatByCost: {
      1: raw.staticMainStatByCost["1"],
      3: raw.staticMainStatByCost["3"],
      4: raw.staticMainStatByCost["4"],
    },
    subStatOptions: raw.subStatOptions,
  };
}

export function computeEchoMainStatValue(option: EchoMainStatOption, level: number): number | null {
  return option.valuesByLevel[level] ?? null;
}

export function computeActiveSetBonuses(
  equipped: EquippedEcho[],
  sets: EchoSet[],
): ActiveSetBonus[] {
  const countBySetName = new Map<string, number>();
  for (const e of equipped) {
    if (!e.chosenSetName) continue;
    countBySetName.set(e.chosenSetName, (countBySetName.get(e.chosenSetName) ?? 0) + 1);
  }

  const results: ActiveSetBonus[] = [];
  for (const [setName, count] of countBySetName) {
    const set = sets.find((s) => s.name === setName);
    if (!set) continue;
    const activeEffects = set.effects.filter((eff) => count >= eff.pieceCount);
    results.push({ setName, count, activeEffects });
  }
  return results.sort((a, b) => b.count - a.count);
}

export interface EchoStatTotal {
  statName: string;
  value: number;
}

// Sums every equipped echo's main stats (both the fixed static one -- flat
// ATK for cost 3/4, flat HP for cost 1 -- and the player-chosen variable one)
// plus rolled substats, by exact stat name. Raw/unfiltered -- includes every
// stat name that can appear (elemental DMG bonus, Healing Bonus, etc), not
// just the 6 shown in computeEchoStatSummary below. Shared by
// computeEchoStatSummary (edit-view panel) and computeFinalStats
// (final-stats aggregation).
export function computeEchoStatTotals(
  equipped: EquippedEcho[],
  curves: EchoStatCurves,
): Map<string, number> {
  const totals = new Map<string, number>();
  const add = (statName: string, value: number) => {
    totals.set(statName, (totals.get(statName) ?? 0) + value);
  };

  for (const slot of equipped) {
    if (!slot.echo) continue;

    const staticOption = curves.staticMainStatByCost[slot.echo.cost];
    const staticValue = computeEchoMainStatValue(staticOption, slot.level);
    if (staticValue !== null) add(staticOption.statName, staticValue);

    const variableOption = curves.mainStatOptionsByCost[slot.echo.cost].find(
      (o) => o.propId === slot.mainStatPropId,
    );
    if (variableOption) {
      const value = computeEchoMainStatValue(variableOption, slot.level);
      if (value !== null) add(variableOption.statName, value);
    }

    for (const sub of slot.substats) {
      if (sub.statName && sub.value !== null) add(sub.statName, sub.value);
    }
  }

  return totals;
}

// The 6 stats shown in the edit-view "Echo Stat Summary" panel. HP/ATK/DEF
// merge their flat and % contributions into a single "amount gained" number
// (using the character's own base stat to convert the % share into the same
// units as the flat share) -- Energy Regen/Crit Rate/Crit DMG are already
// percent-only, nothing to merge. Hides any stat that comes out to 0.
export function computeEchoStatSummary(
  equipped: EquippedEcho[],
  curves: EchoStatCurves,
  baseStats: ComputedStats | null,
): EchoStatTotal[] {
  const totals = computeEchoStatTotals(equipped, curves);
  const get = (statName: string) => totals.get(statName) ?? 0;

  const hpGain = (baseStats?.hp ?? 0) * (get("HP%") / 100) + get("HP");
  const atkGain = (baseStats?.atk ?? 0) * (get("ATK%") / 100) + get("ATK");
  const defGain = (baseStats?.def ?? 0) * (get("DEF%") / 100) + get("DEF");

  return [
    { statName: "HP", value: hpGain },
    { statName: "ATK", value: atkGain },
    { statName: "DEF", value: defGain },
    { statName: "Energy Regen", value: get("Energy Regen") },
    { statName: "Crit. Rate", value: get("Crit. Rate") },
    { statName: "Crit. DMG", value: get("Crit. DMG") },
  ].filter((t) => t.value !== 0);
}

// Real game rule: a given echo's 5 substats can't repeat a stat among
// themselves. They CAN duplicate that echo's own main stat -- confirmed by a
// real echo card (Nightmare: Kelpie, main stat Crit. Rate 22.0%, substats
// including a second independent Crit. Rate 7.5% roll).
export function availableSubStatNames(
  curves: EchoStatCurves,
  equippedEcho: EquippedEcho,
  slotIndex: number,
): SubStatOption[] {
  const usedNames = new Set(
    equippedEcho.substats
      .filter((_, i) => i !== slotIndex)
      .map((s) => s.statName)
      .filter((n): n is string => n !== null),
  );

  return curves.subStatOptions.filter((o) => !usedNames.has(o.statName));
}

interface RawCharacterEchoRecommendation {
  echo?: {
    main?: {
      echoProps?: { texts?: { language: string; name: string }[] };
      echoSetEffects?: { texts?: { language: string; name: string }[] }[];
    };
  };
  echoTexts?: { language: string; recommendDescription?: string }[];
}

export interface EchoRecommendation {
  signatureEchoName: string | null;
  recommendedSetNames: string[];
  recommendDescriptionHtml: string | null;
}

// Reads the character's own Kuro-recommended echo build straight out of
// wuwa_characters.json (not the new echo_catalog.json) -- used only to seed
// sensible defaults (slot 0's echo, the picker's default set filter), not
// as a source of full catalog data.
export async function loadEchoRecommendation(characterId: string): Promise<EchoRecommendation> {
  const res = await fetch("/data/wuwa_characters.json");
  const raw: Record<string, RawCharacterEchoRecommendation> = await res.json();
  const character = raw[characterId];

  const signatureEchoTexts = character?.echo?.main?.echoProps?.texts ?? [];
  const signatureEchoName = signatureEchoTexts.find((t) => t.language === "en")?.name ?? null;

  const setEffects = character?.echo?.main?.echoSetEffects ?? [];
  const recommendedSetNames = [
    ...new Set(
      setEffects
        .map((eff) => eff.texts?.find((t) => t.language === "en")?.name)
        .filter((n): n is string => !!n),
    ),
  ];

  const recommendDescriptionHtml =
    character?.echoTexts?.find((t) => t.language === "en")?.recommendDescription ?? null;

  return { signatureEchoName, recommendedSetNames, recommendDescriptionHtml };
}

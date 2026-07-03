import type {
  ActiveSetBonus,
  EchoCatalogEntry,
  EchoMainStatOption,
  EchoSet,
  EchoStatCurves,
  EquippedEcho,
  SubStatOption,
} from "../types/echo";

// Stats that render as a flat number rather than a percentage. Everything
// else in this app's echo/weapon stat names is a percent -- same convention
// as computeWeaponSecondaryStat in weapons.ts (only ATK is flat there).
const FLAT_STAT_NAMES = new Set(["HP", "ATK", "DEF"]);

export function isFlatStat(statName: string): boolean {
  return FLAT_STAT_NAMES.has(statName);
}

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

// Requested display order. Flat and % variants of the same base stat (e.g.
// "HP" and "HP%") are kept as separate rows -- they're different units and
// can't be summed together -- but placed adjacent so they read as one group.
const SUMMARY_STAT_ORDER = [
  "HP",
  "HP%",
  "ATK",
  "ATK%",
  "DEF",
  "DEF%",
  "Energy Regen",
  "Crit. Rate",
  "Crit. DMG",
];

// Sums every equipped echo's main stat + rolled substats by exact stat name,
// then returns only the non-zero totals in SUMMARY_STAT_ORDER.
export function computeEchoStatSummary(
  equipped: EquippedEcho[],
  curves: EchoStatCurves,
): EchoStatTotal[] {
  const totals = new Map<string, number>();
  const add = (statName: string, value: number) => {
    totals.set(statName, (totals.get(statName) ?? 0) + value);
  };

  for (const slot of equipped) {
    if (!slot.echo) continue;
    const mainOption = curves.mainStatOptionsByCost[slot.echo.cost].find(
      (o) => o.propId === slot.mainStatPropId,
    );
    if (mainOption) {
      const value = computeEchoMainStatValue(mainOption, slot.level);
      if (value !== null) add(mainOption.statName, value);
    }
    for (const sub of slot.substats) {
      if (sub.statName && sub.value !== null) add(sub.statName, sub.value);
    }
  }

  return SUMMARY_STAT_ORDER.map((statName) => ({ statName, value: totals.get(statName) ?? 0 })).filter(
    (t) => t.value !== 0,
  );
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

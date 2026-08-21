// Final-stat aggregation for the agent's get_character_build tool -- a
// deliberate, minimal port of frontend/src/lib/{stats,weapons,echoes,
// finalStats}.ts's pure computation functions (not the fetch()-based
// loaders, which don't apply here -- this function reads its own bundled
// copies of the same data/*.json files instead, copied in alongside
// character_guides.json).
//
// Why this exists: an earlier version of get_character_build returned the
// user's build as raw stored fields (weapon_gb_id, a talent_levels array,
// raw echo substats). The LLM had no way to turn that into "your crit rate
// is 65%, recommended is 70%" -- it can't reliably do the HP/ATK/DEF/crit
// aggregation math itself from scattered percent/flat contributions, so it
// fell back to comparing raw fields directly (echo *names* instead of echo
// *sets*, a numeric weapon ID it couldn't map to the recommended weapon
// *names* list, and fabricated "recommended talent levels" that don't
// exist anywhere in this app's data). Computing the real numbers
// server-side and handing them to the model directly fixes all of that at
// the root, rather than trying to prompt around it.

export interface GrowthCurvePoint {
  level: number;
  breachLevel: number;
  lifeMaxRatio: number;
  atkRatio: number;
  defRatio: number;
}
export interface StatCurveData {
  baseStats: Record<string, { lifeMax: number; atk: number; def: number }>;
  growthCurve: GrowthCurvePoint[];
}
export interface ComputedStats {
  hp: number;
  atk: number;
  def: number;
}

export function computeStats(curves: StatCurveData, roleGbId: string, level: number): ComputedStats | null {
  const base = curves.baseStats[roleGbId];
  const point = curves.growthCurve
    .filter((g) => g.level === level)
    .sort((a, b) => b.breachLevel - a.breachLevel)[0];
  if (!base || !point) return null;
  return {
    hp: Math.round((base.lifeMax * point.lifeMaxRatio) / 10000),
    atk: Math.round((base.atk * point.atkRatio) / 10000),
    def: Math.round((base.def * point.defRatio) / 10000),
  };
}

export interface WeaponStatCurves {
  baseAtk: Record<string, number>;
  atkCurve: { level: number; breachLevel: number; ratio: number }[];
  secondaryStat: Record<string, { propId: number; value: number; isRatio: boolean }>;
  secondaryCurve: { level: number; breachLevel: number; ratio: number }[];
}
export interface ComputedSecondaryStat {
  name: string;
  value: number;
}

// The always-on stat-bonus component of a weapon's passive ability text --
// see scripts/build_weapon_passive_bonuses.py for how this is extracted and
// why only the unconditional part is ever included. Deno-side mirror of
// frontend/src/lib/weapons.ts's computeWeaponPassiveBonusTotals.
export interface WeaponPassiveBonus {
  stat: string;
  valuesByRank: number[]; // index 0 = Rank 1, index 4 = Rank 5
}
export type WeaponPassiveBonuses = Record<string, WeaponPassiveBonus[]>;

export function computeWeaponPassiveBonusTotals(
  bonuses: WeaponPassiveBonuses,
  weaponGbId: string,
  rank: number,
): Map<string, number> {
  const totals = new Map<string, number>();
  const entries = bonuses[weaponGbId];
  if (!entries) return totals;
  for (const entry of entries) {
    const value = entry.valuesByRank[rank - 1];
    if (value === undefined) continue;
    totals.set(entry.stat, (totals.get(entry.stat) ?? 0) + value);
  }
  return totals;
}

// See weapons.ts for how these prop IDs were resolved/verified.
const WEAPON_STAT_NAME_BY_PROP_ID: Record<number, string> = {
  7: "ATK",
  8: "Crit. Rate",
  9: "Crit. DMG",
  11: "Energy Regen",
  10007: "ATK%",
  10002: "HP%",
  10010: "DEF%",
};

export function computeWeaponAtk(curves: WeaponStatCurves, weaponGbId: string, level: number): number {
  const base = curves.baseAtk[weaponGbId];
  const point = curves.atkCurve.filter((c) => c.level === level).sort((a, b) => b.breachLevel - a.breachLevel)[0];
  if (base === undefined || !point) return 0;
  return Math.round((base * point.ratio) / 10000);
}

export function computeWeaponSecondaryStat(
  curves: WeaponStatCurves,
  weaponGbId: string,
  level: number,
): ComputedSecondaryStat | null {
  const stat = curves.secondaryStat[weaponGbId];
  const name = stat && WEAPON_STAT_NAME_BY_PROP_ID[stat.propId];
  if (!stat || !name) return null;
  const point = curves.secondaryCurve
    .filter((c) => c.level === level)
    .sort((a, b) => b.breachLevel - a.breachLevel)[0];
  if (!point) return null;
  const scaled = (stat.value * point.ratio) / 10000;
  const value = name === "ATK" ? Math.round(scaled) : stat.isRatio ? scaled * 100 : scaled / 100;
  return { name, value };
}

export interface EchoMainStatOption {
  propId: number;
  statName: string;
  valuesByLevel: Record<number, number>;
}
export interface EchoStatCurves {
  mainStatOptionsByCost: Record<1 | 3 | 4, EchoMainStatOption[]>;
  staticMainStatByCost: Record<1 | 3 | 4, EchoMainStatOption>;
}
export interface SavedEchoSlot {
  echoName: string | null;
  chosenSetName: string | null;
  mainStatPropId: number | null;
  level: number;
  substats: { statName: string | null; value: number | null }[];
}
export interface EchoCatalogEntry {
  name: string;
  cost: 1 | 3 | 4;
  setNames: string[];
}

// Same summation as echoes.ts's computeEchoStatTotals, but reading directly
// off the saved-row echo slots (with cost resolved via an echo-name ->
// catalog lookup, since the DB row only stores the name) instead of the
// frontend's live EquippedEcho[] shape.
export function computeEchoStatTotals(
  slots: SavedEchoSlot[],
  echoByName: Map<string, EchoCatalogEntry>,
  curves: EchoStatCurves,
): Map<string, number> {
  const totals = new Map<string, number>();
  const add = (statName: string, value: number) => totals.set(statName, (totals.get(statName) ?? 0) + value);

  for (const slot of slots) {
    if (!slot.echoName) continue;
    const echo = echoByName.get(normalizeEchoName(slot.echoName));
    if (!echo) continue;

    const staticOption = curves.staticMainStatByCost[echo.cost];
    const staticValue = staticOption?.valuesByLevel[slot.level];
    if (staticValue !== undefined) add(staticOption.statName, staticValue);

    const variableOption = curves.mainStatOptionsByCost[echo.cost]?.find((o) => o.propId === slot.mainStatPropId);
    const variableValue = variableOption?.valuesByLevel[slot.level];
    if (variableOption && variableValue !== undefined) add(variableOption.statName, variableValue);

    for (const sub of slot.substats) {
      if (sub.statName && sub.value !== null) add(sub.statName, sub.value);
    }
  }
  return totals;
}

// Same normalization as findEchoByName in echoes.ts -- Kuro's guide API and
// the game8.co-sourced catalog punctuate the same echo name differently
// often enough to matter.
export function normalizeEchoName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export interface EchoSetEffect {
  pieceCount: number;
  description: string;
}
export interface EchoSet {
  name: string;
  effects: EchoSetEffect[];
}
export interface ActiveSetBonus {
  setName: string;
  count: number;
  activeEffects: EchoSetEffect[];
}

export interface EchoSlotBreakdown {
  slot: number; // 1-5. WuWa echo slots have no body-part names (unlike some
  // other games' artifact/relic systems) -- just 5 generic numbered slots.
  cost: 1 | 3 | 4 | null; // null only if echoName is unresolved -- see costNote
  costNote?: string;
  echoName: string | null;
  echoNameNote?: string;
  setName: string | null;
  level: number;
  mainStats: { statName: string; value: number }[];
  substats: { statName: string | null; value: number | null }[];
}

// Per-slot detail (as opposed to computeEchoStatTotals' summed totals) --
// needed to answer questions like "which echo is worth replacing," which
// require comparing individual echoes against each other, not just the
// build's aggregate stat totals.
export function computeEchoSlotBreakdown(
  slots: SavedEchoSlot[],
  echoByName: Map<string, EchoCatalogEntry>,
  curves: EchoStatCurves,
): EchoSlotBreakdown[] {
  return slots.map((slot, i) => {
    const echo = slot.echoName ? echoByName.get(normalizeEchoName(slot.echoName)) : undefined;
    const mainStats: { statName: string; value: number }[] = [];
    if (echo) {
      const staticOption = curves.staticMainStatByCost[echo.cost];
      const staticValue = staticOption?.valuesByLevel[slot.level];
      if (staticValue !== undefined) mainStats.push({ statName: staticOption.statName, value: staticValue });

      const variableOption = curves.mainStatOptionsByCost[echo.cost]?.find((o) => o.propId === slot.mainStatPropId);
      const variableValue = variableOption?.valuesByLevel[slot.level];
      if (variableOption && variableValue !== undefined) {
        mainStats.push({ statName: variableOption.statName, value: variableValue });
      }
    }
    return {
      slot: i + 1,
      cost: echo?.cost ?? null,
      costNote: echo
        ? undefined
        : "Cost is unresolved because the echo name didn't match this app's catalog -- do not guess a cost tier for this slot.",
      echoName: slot.echoName,
      echoNameNote: slot.echoName
        ? undefined
        : "This slot has no recorded echo name in the saved build -- say so plainly rather than describing this slot by an invented item or position name.",
      setName: slot.chosenSetName,
      level: slot.level,
      mainStats,
      substats: slot.substats,
    };
  });
}

export function computeActiveSetBonuses(slots: SavedEchoSlot[], sets: EchoSet[]): ActiveSetBonus[] {
  const countBySetName = new Map<string, number>();
  for (const s of slots) {
    if (!s.chosenSetName) continue;
    countBySetName.set(s.chosenSetName, (countBySetName.get(s.chosenSetName) ?? 0) + 1);
  }
  const results: ActiveSetBonus[] = [];
  for (const [setName, count] of countBySetName) {
    const set = sets.find((s) => s.name === setName);
    if (!set) continue;
    results.push({ setName, count, activeEffects: set.effects.filter((e) => count >= e.pieceCount) });
  }
  return results.sort((a, b) => b.count - a.count);
}

export const BASE_CRIT_RATE = 5;
export const BASE_CRIT_DMG = 150;
export const BASE_ENERGY_REGEN = 100;

export interface FinalStats {
  hp: number;
  atk: number;
  def: number;
  energyRegen: number;
  critRate: number;
  critDmg: number;
  healingBonus: number;
  elementalDmgBonusName: string;
  elementalDmgBonus: number;
}

export function computeFinalStats(args: {
  roleGbId: string;
  element: string | null;
  level: number;
  curves: StatCurveData;
  weaponGbId: string | null;
  weaponLevel: number;
  weaponRank: number;
  weaponCurves: WeaponStatCurves;
  weaponPassiveBonuses: WeaponPassiveBonuses;
  echoTotals: Map<string, number>;
  forteBonusTotals: Map<string, number>;
  // Summed unlocked sequence-node stat bonuses -- see
  // computeSequenceBonusTotals below and sequence_node_stat_bonuses.json's
  // _note for why this is hand-curated and partial, unlike forteBonusTotals.
  sequenceBonusTotals?: Map<string, number>;
}): FinalStats | null {
  const base = computeStats(args.curves, args.roleGbId, args.level);
  if (!base) return null;

  const echo = (statName: string) => args.echoTotals.get(statName) ?? 0;
  const forte = (statName: string) => args.forteBonusTotals.get(statName) ?? 0;
  const sequence = (statName: string) => args.sequenceBonusTotals?.get(statName) ?? 0;

  const elementalDmgBonusName = args.element ? `${args.element} DMG Bonus` : "Elemental DMG Bonus";
  // "ELEMENTAL" is build_weapon_passive_bonuses.py's placeholder for a
  // passive phrased as "Attribute DMG Bonus" -- resolved here, same as the
  // frontend port in finalStats.ts.
  const weaponPassiveTotals = args.weaponGbId
    ? computeWeaponPassiveBonusTotals(args.weaponPassiveBonuses, args.weaponGbId, args.weaponRank)
    : new Map<string, number>();
  const weaponPassive = (statName: string) =>
    weaponPassiveTotals.get(statName === elementalDmgBonusName ? "ELEMENTAL" : statName) ?? 0;

  const weaponAtk = args.weaponGbId ? computeWeaponAtk(args.weaponCurves, args.weaponGbId, args.weaponLevel) : 0;
  const weaponSecondary = args.weaponGbId
    ? computeWeaponSecondaryStat(args.weaponCurves, args.weaponGbId, args.weaponLevel)
    : null;
  const weaponStat = (statName: string) => (weaponSecondary?.name === statName ? weaponSecondary.value : 0);

  const hpPercent = echo("HP%") + weaponStat("HP%") + forte("HP") + sequence("HP") + weaponPassive("HP%");
  const atkPercent = echo("ATK%") + weaponStat("ATK%") + forte("ATK") + sequence("ATK") + weaponPassive("ATK%");
  const defPercent = echo("DEF%") + weaponStat("DEF%") + forte("DEF") + sequence("DEF") + weaponPassive("DEF%");

  return {
    hp: Math.round((base.hp * (100 + hpPercent)) / 100 + echo("HP")),
    atk: Math.round(((base.atk + weaponAtk) * (100 + atkPercent)) / 100 + echo("ATK")),
    def: Math.round((base.def * (100 + defPercent)) / 100 + echo("DEF")),
    energyRegen:
      BASE_ENERGY_REGEN +
      echo("Energy Regen") +
      weaponStat("Energy Regen") +
      sequence("Energy Regen") +
      weaponPassive("Energy Regen"),
    critRate:
      BASE_CRIT_RATE +
      echo("Crit. Rate") +
      weaponStat("Crit. Rate") +
      forte("Crit. Rate") +
      sequence("Crit. Rate") +
      weaponPassive("Crit. Rate"),
    critDmg:
      BASE_CRIT_DMG +
      echo("Crit. DMG") +
      weaponStat("Crit. DMG") +
      forte("Crit. DMG") +
      sequence("Crit. DMG") +
      weaponPassive("Crit. DMG"),
    healingBonus: echo("Healing Bonus") + forte("Healing Bonus") + sequence("Healing Bonus") + weaponPassive("Healing Bonus"),
    elementalDmgBonusName,
    elementalDmgBonus:
      echo(elementalDmgBonusName) +
      forte(elementalDmgBonusName) +
      sequence(elementalDmgBonusName) +
      weaponPassive(elementalDmgBonusName),
  };
}

// Sequence-node effects are cumulative once unlocked (unlike forte nodes,
// which are independently toggled) -- sums every bonus whose sequence is at
// or below the currently-unlocked count. Mirrors
// frontend/src/lib/sequenceNodes.ts's computeSequenceBonusTotals.
export function computeSequenceBonusTotals(
  bonuses: { sequence: number; stat: string; value: number }[] | undefined,
  unlockedCount: number,
): Map<string, number> {
  const totals = new Map<string, number>();
  if (!bonuses) return totals;
  for (const bonus of bonuses) {
    if (bonus.sequence <= unlockedCount) {
      totals.set(bonus.stat, (totals.get(bonus.stat) ?? 0) + bonus.value);
    }
  }
  return totals;
}

// Matches FORTE_COLUMN_ORDER in TalentGrid.tsx / the flat-index convention
// documented in .claude/rules/api.md and frontend.md: flat index =
// colIndex*2 + tierIndex (tier 0 = lower, tier 1 = upper).
export const FORTE_COLUMN_ORDER = ["normal_attack", "resonance_skill", "resonance_liberation", "intro_skill"] as const;

export function computeForteBonusTotals(
  forteNodeActive: boolean[],
  nodeData: Record<string, { stat: string; value: number }[]> | undefined,
): Map<string, number> {
  const totals = new Map<string, number>();
  if (!nodeData) return totals;
  for (let i = 0; i < forteNodeActive.length; i++) {
    if (!forteNodeActive[i]) continue;
    const colIndex = Math.floor(i / 2);
    const tierIndex = i % 2;
    const column = FORTE_COLUMN_ORDER[colIndex];
    const node = nodeData[column]?.[tierIndex];
    if (!node) continue;
    totals.set(node.stat, (totals.get(node.stat) ?? 0) + node.value);
  }
  return totals;
}

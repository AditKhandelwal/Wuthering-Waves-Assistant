import type { ComputedStats, StatCurveData } from "../types/stats";

// Ascension ("breach") level caps, confirmed against the raw datamined
// rolebreach.json — universal across every character, not per-character.
export const ASCENSION_BREAKPOINTS = [20, 40, 50, 60, 70, 80, 90] as const;

// Temporary static data source standing in for a future backend endpoint,
// same pattern as lib/characters.ts. Sourced from Arikatsu/WutheringWaves_Data
// (property/baseproperty.json + property/rolepropertygrowth.json) since
// wuwa_characters.json has no base HP/ATK/DEF or level-scaling data.
export async function loadStatCurves(): Promise<StatCurveData> {
  const res = await fetch("/data/character_stat_curves.json");
  return res.json();
}

export function maxLevelForBreach(breachLevel: number): number {
  return ASCENSION_BREAKPOINTS[breachLevel];
}

export function computeStats(
  curves: StatCurveData,
  roleGbId: string,
  level: number,
  breachLevel: number,
): ComputedStats | null {
  const base = curves.baseStats[roleGbId];
  const point = curves.growthCurve.find(
    (g) => g.level === level && g.breachLevel === breachLevel,
  );
  if (!base || !point) return null;

  return {
    hp: Math.round((base.lifeMax * point.lifeMaxRatio) / 10000),
    atk: Math.round((base.atk * point.atkRatio) / 10000),
    def: Math.round((base.def * point.defRatio) / 10000),
  };
}

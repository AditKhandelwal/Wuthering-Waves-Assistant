import type { ComputedStats, StatCurveData } from "../types/stats";

// Temporary static data source standing in for a future backend endpoint,
// same pattern as lib/characters.ts. Sourced from Arikatsu/WutheringWaves_Data
// (property/baseproperty.json + property/rolepropertygrowth.json) since
// wuwa_characters.json has no base HP/ATK/DEF or level-scaling data.
export async function loadStatCurves(): Promise<StatCurveData> {
  const res = await fetch("/data/character_stat_curves.json");
  return res.json();
}

// Ascension breakpoint levels (20/40/50/60/70/80) each have two growth-curve
// entries (pre- and post-ascend). Always use the higher (ascended) one, since
// there's no separate ascend step in this UI.
export function computeStats(
  curves: StatCurveData,
  roleGbId: string,
  level: number,
): ComputedStats | null {
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

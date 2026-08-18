import type { WeaponTypeName } from "./character";

export interface WeaponCatalogEntry {
  gbId: string;
  name: string;
  pictureUrl: string;
  star: number;
  weaponType: WeaponTypeName;
  effectName: string;
  effectDescription: string;
}

export interface WeaponSecondaryStat {
  propId: number;
  value: number;
  isRatio: boolean;
}

export interface WeaponStatCurves {
  baseAtk: Record<string, number>;
  rankValues: Record<string, string[]>;
  atkCurve: { level: number; breachLevel: number; ratio: number }[];
  secondaryStat: Record<string, WeaponSecondaryStat>;
  secondaryCurve: { level: number; breachLevel: number; ratio: number }[];
}

export interface ComputedSecondaryStat {
  name: string;
  // Raw numeric value, percentage-scale for percent stats (e.g. 22.5 means
  // 22.5%) or a plain number for flat ATK -- same convention as echo stat
  // values, so it can feed final-stat aggregation math directly.
  value: number;
  displayValue: string;
}

// The always-on stat-bonus component of a weapon's passive ability text
// (built by scripts/build_weapon_passive_bonuses.py -- see that script's
// docstring for why only the unconditional part is extracted). "ELEMENTAL"
// is a placeholder stat name resolved at compute time against whichever
// character wields it, mirroring elementalDmgBonusName in finalStats.ts.
export interface WeaponPassiveBonus {
  stat: string;
  valuesByRank: number[]; // index 0 = Rank 1, index 4 = Rank 5
}
export type WeaponPassiveBonuses = Record<string, WeaponPassiveBonus[]>;

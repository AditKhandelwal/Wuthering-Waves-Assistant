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

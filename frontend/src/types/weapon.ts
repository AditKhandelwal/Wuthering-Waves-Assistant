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
  displayValue: string;
}

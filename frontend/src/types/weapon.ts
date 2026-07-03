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

export interface WeaponStatCurves {
  baseAtk: Record<string, number>;
  rankValues: Record<string, string[]>;
  atkCurve: { level: number; breachLevel: number; ratio: number }[];
}

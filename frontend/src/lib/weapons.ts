import { WEAPON_TYPE_BY_GB_ID } from "./characters";
import { formatStatValue } from "./echoes";
import type { WeaponTypeName } from "../types/character";
import type { ComputedSecondaryStat, WeaponCatalogEntry, WeaponStatCurves } from "../types/weapon";

// Resolved by cross-referencing weaponconf.json's SecondPropId.Id against
// wuwa_characters.json's roleAttribute gbId prefixes (e.g. "8-2" -> Crit.
// Rate), then confirmed exactly against a known reference value (Spectral
// Trigger's Crit. DMG computes to exactly 48.6% at level 90, matching a
// value seen in-game). 10007/10002/10010 have no resolvable text-map source
// -- inferred from prevalence (10007 appears on 48/118 weapons, matching
// ATK% being the most common weapon secondary stat in the real game; 10002
// and 10010 are far rarer, matching HP%/DEF%). Flag if these ever look wrong.
const STAT_NAME_BY_PROP_ID: Record<number, string> = {
  7: "ATK",
  8: "Crit. Rate",
  9: "Crit. DMG",
  11: "Energy Regen",
  10007: "ATK%",
  10002: "HP%",
  10010: "DEF%",
};

interface RawText {
  language: string;
  name: string;
  effectName?: string;
  effectDescription?: string;
}

interface RawWeaponItem {
  gbId: string;
  pictureUrl: string;
  star: number;
  weaponType: { gbId: string };
  texts: RawText[];
}

interface RawCharacterWeaponEntry {
  weapon: { items: RawWeaponItem[] };
}

type RawWeaponMap = Record<string, RawCharacterWeaponEntry>;

export interface WeaponCatalog {
  // Every distinct weapon seen across all characters' recommendations,
  // grouped by weapon type. Not the true full ~118-weapon catalog -- only
  // weapons that appear as a recommendation for at least one of our 54
  // characters have a real name/picture available (see
  // docs/DATA_REQUIREMENTS.md, Section 3).
  byType: Record<WeaponTypeName, WeaponCatalogEntry[]>;
  // Which weapon gbIds are recommended for a given character (their own
  // weapon.items[]), used to pin recommendations to the top of the picker.
  recommendedByCharacter: Record<string, string[]>;
}

// Temporary static data source standing in for a future backend endpoint,
// same pattern as lib/characters.ts.
export async function loadWeaponCatalog(): Promise<WeaponCatalog> {
  const res = await fetch("/data/wuwa_characters.json");
  const raw: RawWeaponMap = await res.json();

  const byId = new Map<string, WeaponCatalogEntry>();
  const recommendedByCharacter: Record<string, string[]> = {};

  for (const [characterId, entry] of Object.entries(raw)) {
    const recommended: string[] = [];
    for (const w of entry.weapon.items) {
      recommended.push(w.gbId);

      const existing = byId.get(w.gbId);
      if (existing && existing.name !== "Unknown") continue;

      const en = w.texts.find((t) => t.language === "en");
      byId.set(w.gbId, {
        gbId: w.gbId,
        name: en?.name ?? "Unknown",
        pictureUrl: w.pictureUrl,
        star: w.star,
        weaponType: WEAPON_TYPE_BY_GB_ID[w.weaponType.gbId] ?? "Sword",
        effectName: en?.effectName ?? "",
        effectDescription: en?.effectDescription ?? "",
      });
    }
    recommendedByCharacter[characterId] = recommended;
  }

  const byType = {} as Record<WeaponTypeName, WeaponCatalogEntry[]>;
  for (const weapon of byId.values()) {
    (byType[weapon.weaponType] ??= []).push(weapon);
  }
  for (const list of Object.values(byType)) {
    list.sort((a, b) => b.star - a.star || a.name.localeCompare(b.name));
  }

  return { byType, recommendedByCharacter };
}

export async function loadWeaponStatCurves(): Promise<WeaponStatCurves> {
  const res = await fetch("/data/weapon_stat_curves.json");
  return res.json();
}

export function computeWeaponAtk(
  curves: WeaponStatCurves,
  weaponGbId: string,
  level: number,
): number | null {
  const base = curves.baseAtk[weaponGbId];
  const point = curves.atkCurve
    .filter((c) => c.level === level)
    .sort((a, b) => b.breachLevel - a.breachLevel)[0];
  if (base === undefined || !point) return null;
  return Math.round((base * point.ratio) / 10000);
}

export function computeWeaponSecondaryStat(
  curves: WeaponStatCurves,
  weaponGbId: string,
  level: number,
): ComputedSecondaryStat | null {
  const stat = curves.secondaryStat[weaponGbId];
  const name = stat && STAT_NAME_BY_PROP_ID[stat.propId];
  if (!stat || !name) return null;

  const point = curves.secondaryCurve
    .filter((c) => c.level === level)
    .sort((a, b) => b.breachLevel - a.breachLevel)[0];
  if (!point) return null;

  const scaled = (stat.value * point.ratio) / 10000;

  // Crit Rate/DMG/Energy Regen (isRatio=false) store the base value as a
  // percent times 100 (540 -> 5.4%); ATK%/HP%/DEF% (isRatio=true) store it
  // as a raw fraction (0.081 -> 8.1%). Flat ATK just needs rounding.
  const value = name === "ATK" ? Math.round(scaled) : stat.isRatio ? scaled * 100 : scaled / 100;
  return { name, value, displayValue: formatStatValue(value, name) };
}

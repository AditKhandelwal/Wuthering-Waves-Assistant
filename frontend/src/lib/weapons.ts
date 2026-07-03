import { WEAPON_TYPE_BY_GB_ID } from "./characters";
import type { WeaponTypeName } from "../types/character";
import type { WeaponCatalogEntry, WeaponStatCurves } from "../types/weapon";

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

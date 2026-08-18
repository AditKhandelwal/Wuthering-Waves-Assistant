import { WEAPON_TYPE_BY_GB_ID } from "./characters";
import { formatStatValue } from "./echoes";
import type { WeaponTypeName } from "../types/character";
import type {
  ComputedSecondaryStat,
  WeaponCatalogEntry,
  WeaponPassiveBonuses,
  WeaponStatCurves,
} from "../types/weapon";

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
  // Every weapon with a real stat curve (data/weapon_stat_curves.json),
  // grouped by weapon type. Display data (name/icon/passive text) comes
  // from two sources: Kuro's guide API where a weapon is recommended for
  // at least one character (authoritative, exact in-game wording), filled
  // in from the dotgg.gg full catalog (scripts/fetch_weapon_catalog.py ->
  // data/weapon_catalog.json) for everything else. 117 of 118 weapons have
  // display data as of 2026-08-07; 3 gbIds have neither source (see that
  // script's docstring) and are omitted entirely rather than guessed.
  byType: Record<WeaponTypeName, WeaponCatalogEntry[]>;
  // Which weapon gbIds are recommended for a given character (their own
  // weapon.items[]), used to pin recommendations to the top of the picker.
  recommendedByCharacter: Record<string, string[]>;
}

// Temporary static data source standing in for a future backend endpoint,
// same pattern as lib/characters.ts.
export async function loadWeaponCatalog(): Promise<WeaponCatalog> {
  const [charsRes, catalogRes] = await Promise.all([
    fetch("/data/wuwa_characters.json"),
    fetch("/data/weapon_catalog.json"),
  ]);
  const raw: RawWeaponMap = await charsRes.json();
  const fullCatalog: Record<string, WeaponCatalogEntry> = await catalogRes.json();

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

  for (const w of Object.values(fullCatalog)) {
    // Some character guide entries only have zh-Hans text for a given
    // weapon (no "en" texts array entry at all), leaving a placeholder
    // "Unknown" name from the loop above -- prefer the dotgg catalog's
    // real name/icon/effect text over that placeholder when available.
    const existing = byId.get(w.gbId);
    if (!existing || existing.name === "Unknown") byId.set(w.gbId, w);
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

export async function loadWeaponPassiveBonuses(): Promise<WeaponPassiveBonuses> {
  const res = await fetch("/data/weapon_passive_bonuses.json");
  return res.json();
}

// Resolves a weapon's extracted unconditional passive bonus(es) at a given
// rank into a stat-name -> total-value map, ready to feed into
// computeFinalStats the same way forte/echo totals already do. The
// "ELEMENTAL" placeholder key (weapons whose bonus is phrased as whichever
// element the wielder is, e.g. "Grants 12% Attribute DMG Bonus") is left
// unresolved here and handled inside computeFinalStats, which is where
// elementalDmgBonusName already gets built from character.element -- keeps
// this function ignorant of that convention.
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

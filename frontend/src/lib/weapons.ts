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

// Weapons that exist in the game but aren't recommended for any character in
// Kuro's guide API — discovered via the dotgg.gg weapon catalog (2026-07-04).
// Stats (baseAtk / secondaryStat) are already present in weapon_stat_curves.json
// so only catalog-display fields need supplementing here.
const SUPPLEMENTAL_WEAPONS: WeaponCatalogEntry[] = [
  {
    gbId: "21010064",
    name: "Helios Cleaver",
    pictureUrl: "https://static.dotgg.gg/wuthering-waves/weapons/helios-cleaver-icon.webp",
    star: 4,
    weaponType: "Broadblade",
    effectName: "",
    effectDescription: "Within 12s after Resonance Skill is cast, increases ATK by 3%/3.75%/4.5%/5.25%/6% every 2s, stacking up to 4 times. This effect can be triggered once every 12s. When stacks reach 4, all stacks reset within 6s.",
  },
  {
    gbId: "21010084",
    name: "Waning Redshift",
    pictureUrl: "https://static.dotgg.gg/wuthering-waves/weapons/waning-redshift-icon.webp",
    star: 4,
    weaponType: "Broadblade",
    effectName: "",
    effectDescription: "Casting the Resonance Skill grants 6/7/8/9/10 Resonance Energy and increases ATK by 10%/12.5%/15%/17.5%/20% for 16s. This effect can be triggered once every 20s.",
  },
  {
    gbId: "21010094",
    name: "Meditations on Mercy",
    pictureUrl: "https://static.dotgg.gg/wuthering-waves/weapons/meditations-on-mercy-icon.webp",
    star: 4,
    weaponType: "Broadblade",
    effectName: "",
    effectDescription: "Dealing DMG to enemies with Negative Statuses increases ATK by 4%/5%/6%/7%/8% for 10s. Triggered once per second, stackable up to 4 times.",
  },
  {
    gbId: "21020064",
    name: "Lunar Cutter",
    pictureUrl: "https://static.dotgg.gg/wuthering-waves/weapons/lunar-cutter-icon.webp",
    star: 4,
    weaponType: "Sword",
    effectName: "",
    effectDescription: "Gains 6 stacks of Oath on entering the battlefield. Each stack increases ATK by 2%/2.5%/3%/3.5%/4%, up to 6 stacks. Loses 1 stack every 2s; gains 6 stacks upon defeating an enemy. Triggers once every 12s.",
  },
  {
    gbId: "21030084",
    name: "Relativistic Jet",
    pictureUrl: "https://static.dotgg.gg/wuthering-waves/weapons/relativistic-jet-icon.webp",
    star: 4,
    weaponType: "Pistols",
    effectName: "",
    effectDescription: "Casting the Resonance Skill grants 6/7/8/9/10 Resonance Energy and increases ATK by 10%/12.5%/15%/17.5%/20% for 16s. This effect can be triggered once every 20s.",
  },
  {
    gbId: "21040064",
    name: "Hollow Mirage",
    pictureUrl: "https://static.dotgg.gg/wuthering-waves/weapons/hollow-mirage-icon.webp",
    star: 4,
    weaponType: "Gauntlets",
    effectName: "",
    effectDescription: "When Resonance Liberation is cast, grants 3 stacks of Iron Armor. Each stack increases ATK and DEF by 3%/3.5%/4%/4.5%/5%, up to 3 stacks. Reduces stacks by 1 when the Resonator takes damage.",
  },
  {
    gbId: "21050027",
    name: "Ocean's Gift",
    pictureUrl: "https://static.dotgg.gg/wuthering-waves/weapons/ocean-s-gift-icon.webp",
    star: 4,
    weaponType: "Rectifier",
    effectName: "",
    effectDescription: "Dealing DMG to enemies with Spectro Frazzle increases Spectro DMG by 6%/7%/8%/9%/10%, gaining 1 stack per second for 6s, up to 4 stacks.",
  },
  {
    gbId: "21050044",
    name: "Jinzhou Keeper",
    pictureUrl: "https://static.dotgg.gg/wuthering-waves/weapons/jinzhou-keeper-icon.webp",
    star: 4,
    weaponType: "Rectifier",
    effectName: "",
    effectDescription: "Casting Intro Skill increases ATK by 8%/10%/12%/14%/16% and HP by 10%/12.5%/15%/17.5%/20% for 15s.",
  },
  {
    gbId: "21050064",
    name: "Comet Flare",
    pictureUrl: "https://static.dotgg.gg/wuthering-waves/weapons/comet-flare-icon.webp",
    star: 4,
    weaponType: "Rectifier",
    effectName: "",
    effectDescription: "When dealing Basic Attack or Heavy Attack DMG, increases Healing Bonus by 3%/3.75%/4.5%/5.25%/6%, up to 3 stacks for 8s. Triggers once every 0.6s.",
  },
  {
    gbId: "21050084",
    name: "Fusion Accretion",
    pictureUrl: "https://static.dotgg.gg/wuthering-waves/weapons/fusion-accretion-icon.webp",
    star: 4,
    weaponType: "Rectifier",
    effectName: "",
    effectDescription: "Casting the Resonance Skill grants 6/7/8/9/10 Resonance Energy and increases ATK by 10%/12.5%/15%/17.5%/20% for 16s. This effect can be triggered once every 20s.",
  },
  {
    gbId: "21050094",
    name: "Waltz in Masquerade",
    pictureUrl: "https://static.dotgg.gg/wuthering-waves/weapons/waltz-in-masquerade-icon.webp",
    star: 4,
    weaponType: "Rectifier",
    effectName: "",
    effectDescription: "Dealing DMG to enemies with Negative Statuses increases ATK by 4%/5%/6%/7%/8% for 10s. Triggered once per second, stackable up to 4 times.",
  },
  {
    gbId: "21050104",
    name: "Radiant Dawn",
    pictureUrl: "https://static.dotgg.gg/wuthering-waves/weapons/radiant-dawn-icon.webp",
    star: 4,
    weaponType: "Rectifier",
    effectName: "",
    effectDescription: "Casting Resonance Skill increases ATK by 9%/13.9%/18.9%/23.8%/28.8% and grants 9%/13.9%/18.9%/23.8%/28.8% Basic Attack DMG Bonus for 10s.",
  },
];

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

  for (const w of SUPPLEMENTAL_WEAPONS) {
    if (!byId.has(w.gbId)) byId.set(w.gbId, w);
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

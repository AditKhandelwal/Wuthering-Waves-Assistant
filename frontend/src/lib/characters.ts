import {
  ELEMENT_BY_GB_ID,
  type Character,
  type ElementName,
  type RosterData,
  type WeaponTypeName,
} from "../types/character";

interface RawText {
  language: string;
  name: string;
}

interface RawWeaponType {
  gbId: string;
  pictureUrl: string;
  texts: RawText[];
}

interface RawCharacterEntry {
  role: {
    roleGbId: string;
    star: number;
    cardPictureUrl: string;
    illustrationPictureUrl: string;
    texts: RawText[];
    element: { gbId: string; pictureUrl: string };
  };
  weapon: {
    items: { weaponType: RawWeaponType }[];
  };
}

type RawCharacterMap = Record<string, RawCharacterEntry>;

export const WEAPON_TYPE_BY_GB_ID: Record<string, WeaponTypeName> = {
  "1": "Broadblade",
  "2": "Sword",
  "3": "Pistols",
  "4": "Gauntlets",
  "5": "Rectifier",
};

// Kuro's guide API returns byte-identical content (including portrait) for
// both IDs in each Rover gender pair (1406/1408 Aero, 1501/1502 Spectro,
// 1604/1605 Havoc) — no way to tell them apart or get gender-specific art.
// Rather than show two identical-looking cards, collapse each pair down to
// one entry using the shared portrait (which already depicts both genders).
const ROVER_DUPLICATE_IDS_TO_DROP = new Set(["1408", "1502", "1604"]);

// Temporary static data source standing in for a future `/api/characters`
// backend endpoint (see docs/DATA_REQUIREMENTS.md) — swap the fetch URL
// there instead of touching callers of loadRoster().
export async function loadRoster(): Promise<RosterData> {
  const res = await fetch("/data/wuwa_characters.json");
  const raw: RawCharacterMap = await res.json();

  const elementIcons = {} as Record<ElementName, string>;
  const weaponTypeIcons = {} as Record<WeaponTypeName, string>;

  const characters = Object.entries(raw)
    .filter(([outerKey]) => !ROVER_DUPLICATE_IDS_TO_DROP.has(outerKey))
    .map(([outerKey, entry]) => {
      const en = entry.role.texts.find((t) => t.language === "en");
      const name = en?.name ?? "Unknown";
      const element = ELEMENT_BY_GB_ID[entry.role.element.gbId] ?? "Spectro";
      elementIcons[element] ??= entry.role.element.pictureUrl;

      // A character can only equip their own weapon type, so the top
      // recommended weapon's type is the character's weapon type.
      const rawWeaponType = entry.weapon.items[0]?.weaponType;
      const weaponType = rawWeaponType
        ? (WEAPON_TYPE_BY_GB_ID[rawWeaponType.gbId] ?? "Sword")
        : "Sword";
      if (rawWeaponType) {
        weaponTypeIcons[weaponType] ??= rawWeaponType.pictureUrl;
      }

      return {
        // The outer object key is the only guaranteed-unique identifier —
        // entry.role.roleGbId has been observed out of sync with it before.
        roleGbId: outerKey,
        name,
        star: entry.role.star,
        element,
        weaponType,
        cardPictureUrl: entry.role.cardPictureUrl,
        illustrationPictureUrl: entry.role.illustrationPictureUrl,
      } satisfies Character;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return { characters, elementIcons, weaponTypeIcons };
}

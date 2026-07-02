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

const WEAPON_TYPE_BY_GB_ID: Record<string, WeaponTypeName> = {
  "1": "Broadblade",
  "2": "Sword",
  "3": "Pistols",
  "4": "Gauntlets",
  "5": "Rectifier",
};

// Kuro's guide API returns byte-identical content (including portrait) for
// both IDs in each Rover gender pair — it doesn't expose which is which, or
// the gender-specific art. Confirmed via the raw datamined RoleInfo.json's
// `RoleBody` field (MaleM/FemaleM), not derivable from wuwa_characters.json.
const ROVER_GENDER_BY_ID: Record<string, "M" | "F"> = {
  "1406": "M",
  "1408": "F",
  "1501": "M",
  "1502": "F",
  "1604": "F",
  "1605": "M",
};

// Temporary static data source standing in for a future `/api/characters`
// backend endpoint (see docs/DATA_REQUIREMENTS.md) — swap the fetch URL
// there instead of touching callers of loadRoster().
export async function loadRoster(): Promise<RosterData> {
  const res = await fetch("/data/wuwa_characters.json");
  const raw: RawCharacterMap = await res.json();

  const elementIcons = {} as Record<ElementName, string>;
  const weaponTypeIcons = {} as Record<WeaponTypeName, string>;

  const characters = Object.entries(raw)
    .map(([outerKey, entry]) => {
      const en = entry.role.texts.find((t) => t.language === "en");
      const baseName = en?.name ?? "Unknown";
      const gender = ROVER_GENDER_BY_ID[outerKey];
      const name = gender ? `${baseName} (${gender})` : baseName;
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

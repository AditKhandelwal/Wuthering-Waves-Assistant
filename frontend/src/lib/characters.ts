import {
  ELEMENT_BY_GB_ID,
  type Character,
  type ElementName,
  type RosterData,
  type WeaponTypeName,
} from "../types/character";

// box-shadow-based rings/glows don't follow clip-path -- they'd render as a
// plain rectangle around the angular clipped corners, so `border` +
// `filter: drop-shadow` is used instead. BUT: `filter` and `clip-path` on
// the *same* element don't work either -- confirmed by isolated test
// (2026-07-03), clip-path clips the filter's rendered output too, so a
// drop-shadow glow on a clip-path'd element barely shows at all (this
// contradicted what an earlier comment here claimed). The fix: put the glow
// animation on an outer wrapper that has NO clip-path, with the actual
// clipped/bordered box nested inside it -- the wrapper's filter then glows
// around the composited (already-clipped) shape instead of being clipped
// itself. ELEMENT_PORTRAIT_BORDER_CLASS goes on the inner clipped element,
// ELEMENT_PORTRAIT_GLOW_CLASS goes on the outer wrapper. Each class string is
// spelled out fully (not built via template-literal interpolation) because
// Tailwind statically scans source text for complete class names -- a
// dynamically-assembled string never generates any CSS.
export const ELEMENT_PORTRAIT_BORDER_CLASS: Record<ElementName, string> = {
  Glacio: "[border-color:var(--color-element-glacio)]",
  Fusion: "[border-color:var(--color-element-fusion)]",
  Electro: "[border-color:var(--color-element-electro)]",
  Aero: "[border-color:var(--color-element-aero)]",
  Spectro: "[border-color:var(--color-element-spectro)]",
  Havoc: "[border-color:var(--color-element-havoc)]",
};

// Uses the glow-portrait-* keyframes (not the stronger glow-* ones used by
// CharacterCard's ring).
export const ELEMENT_PORTRAIT_GLOW_CLASS: Record<ElementName, string> = {
  Glacio: "[animation:glow-portrait-glacio_2.4s_ease-in-out_infinite]",
  Fusion: "[animation:glow-portrait-fusion_2.4s_ease-in-out_infinite]",
  Electro: "[animation:glow-portrait-electro_2.4s_ease-in-out_infinite]",
  Aero: "[animation:glow-portrait-aero_2.4s_ease-in-out_infinite]",
  Spectro: "[animation:glow-portrait-spectro_2.4s_ease-in-out_infinite]",
  Havoc: "[animation:glow-portrait-havoc_2.4s_ease-in-out_infinite]",
};

// Just the pulsing-glow animation (no border-color), for elements that get
// their color from something other than `border` -- e.g. CharacterCard's
// ring, which is already colored via ELEMENT_RING_CLASS below.
export const ELEMENT_GLOW_ANIMATION_CLASS: Record<ElementName, string> = {
  Glacio: "[animation:glow-glacio_2.4s_ease-in-out_infinite]",
  Fusion: "[animation:glow-fusion_2.4s_ease-in-out_infinite]",
  Electro: "[animation:glow-electro_2.4s_ease-in-out_infinite]",
  Aero: "[animation:glow-aero_2.4s_ease-in-out_infinite]",
  Spectro: "[animation:glow-spectro_2.4s_ease-in-out_infinite]",
  Havoc: "[animation:glow-havoc_2.4s_ease-in-out_infinite]",
};

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

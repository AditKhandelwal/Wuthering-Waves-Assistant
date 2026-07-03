import {
  ELEMENT_BY_GB_ID,
  type Character,
  type ElementName,
  type RosterData,
  type WeaponTypeName,
} from "../types/character";

// box-shadow-based rings/glows don't follow clip-path -- they'd render as a
// plain rectangle around the angular clipped corners. `border` and
// `filter: drop-shadow` both respect clip-path, so use those instead to get
// a border+glow that actually hugs the clipped shape. Each class string is
// spelled out fully (not built via template-literal interpolation) because
// Tailwind statically scans source text for complete class names -- a
// dynamically-assembled string never generates any CSS. Shared by
// BuildScreenPage and BuildCard so the portrait glow stays consistent. The
// glow itself pulses (see the glow-* keyframes in index.css) rather than
// sitting at one static intensity, to read as an actual glow instead of a
// flat colored outline.
export const ELEMENT_PORTRAIT_CLASS: Record<ElementName, string> = {
  Glacio: "[border-color:var(--color-element-glacio)] [animation:glow-glacio_2.4s_ease-in-out_infinite]",
  Fusion: "[border-color:var(--color-element-fusion)] [animation:glow-fusion_2.4s_ease-in-out_infinite]",
  Electro: "[border-color:var(--color-element-electro)] [animation:glow-electro_2.4s_ease-in-out_infinite]",
  Aero: "[border-color:var(--color-element-aero)] [animation:glow-aero_2.4s_ease-in-out_infinite]",
  Spectro: "[border-color:var(--color-element-spectro)] [animation:glow-spectro_2.4s_ease-in-out_infinite]",
  Havoc: "[border-color:var(--color-element-havoc)] [animation:glow-havoc_2.4s_ease-in-out_infinite]",
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

// Subtle radial tint behind the build card, reflecting the character's own
// element color -- a UI-only design choice (not a game-data claim), same
// dynamic-class-string caveat as above (each value fully spelled out).
export const ELEMENT_CARD_BG_CLASS: Record<ElementName, string> = {
  Glacio:
    "bg-[radial-gradient(ellipse_120%_100%_at_15%_0%,color-mix(in_srgb,var(--color-element-glacio)_16%,transparent),transparent_65%),var(--color-panel)]",
  Fusion:
    "bg-[radial-gradient(ellipse_120%_100%_at_15%_0%,color-mix(in_srgb,var(--color-element-fusion)_16%,transparent),transparent_65%),var(--color-panel)]",
  Electro:
    "bg-[radial-gradient(ellipse_120%_100%_at_15%_0%,color-mix(in_srgb,var(--color-element-electro)_16%,transparent),transparent_65%),var(--color-panel)]",
  Aero: "bg-[radial-gradient(ellipse_120%_100%_at_15%_0%,color-mix(in_srgb,var(--color-element-aero)_16%,transparent),transparent_65%),var(--color-panel)]",
  Spectro:
    "bg-[radial-gradient(ellipse_120%_100%_at_15%_0%,color-mix(in_srgb,var(--color-element-spectro)_16%,transparent),transparent_65%),var(--color-panel)]",
  Havoc:
    "bg-[radial-gradient(ellipse_120%_100%_at_15%_0%,color-mix(in_srgb,var(--color-element-havoc)_16%,transparent),transparent_65%),var(--color-panel)]",
};

// Same idea as ELEMENT_CARD_BG_CLASS but centered and tighter, for the small
// square tile behind each character-select portrait rather than a big
// rectangular card -- gives the roster grid some color/life instead of every
// tile floating on the same flat page background.
export const ELEMENT_TILE_BG_CLASS: Record<ElementName, string> = {
  Glacio:
    "bg-[radial-gradient(circle_at_50%_35%,color-mix(in_srgb,var(--color-element-glacio)_32%,transparent),transparent_72%),var(--color-panel)]",
  Fusion:
    "bg-[radial-gradient(circle_at_50%_35%,color-mix(in_srgb,var(--color-element-fusion)_32%,transparent),transparent_72%),var(--color-panel)]",
  Electro:
    "bg-[radial-gradient(circle_at_50%_35%,color-mix(in_srgb,var(--color-element-electro)_32%,transparent),transparent_72%),var(--color-panel)]",
  Aero: "bg-[radial-gradient(circle_at_50%_35%,color-mix(in_srgb,var(--color-element-aero)_32%,transparent),transparent_72%),var(--color-panel)]",
  Spectro:
    "bg-[radial-gradient(circle_at_50%_35%,color-mix(in_srgb,var(--color-element-spectro)_32%,transparent),transparent_72%),var(--color-panel)]",
  Havoc:
    "bg-[radial-gradient(circle_at_50%_35%,color-mix(in_srgb,var(--color-element-havoc)_32%,transparent),transparent_72%),var(--color-panel)]",
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

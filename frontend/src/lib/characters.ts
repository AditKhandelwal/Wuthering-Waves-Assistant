import { ELEMENT_BY_GB_ID, type Character } from "../types/character";

interface RawText {
  language: string;
  name: string;
}

interface RawCharacterEntry {
  role: {
    roleGbId: string;
    star: number;
    cardPictureUrl: string;
    illustrationPictureUrl: string;
    texts: RawText[];
    element: { gbId: string };
  };
}

type RawCharacterMap = Record<string, RawCharacterEntry>;

// Temporary static data source standing in for a future `/api/characters`
// backend endpoint (see docs/DATA_REQUIREMENTS.md) — swap the fetch URL
// there instead of touching callers of getCharacters().
export async function getCharacters(): Promise<Character[]> {
  const res = await fetch("/data/wuwa_characters.json");
  const raw: RawCharacterMap = await res.json();

  return Object.entries(raw)
    .map(([outerKey, entry]) => {
      const en = entry.role.texts.find((t) => t.language === "en");
      return {
        // The outer object key is the only guaranteed-unique identifier —
        // entry.role.roleGbId has been observed out of sync with it before.
        roleGbId: outerKey,
        name: en?.name ?? "Unknown",
        star: entry.role.star,
        element: ELEMENT_BY_GB_ID[entry.role.element.gbId] ?? "Spectro",
        cardPictureUrl: entry.role.cardPictureUrl,
        illustrationPictureUrl: entry.role.illustrationPictureUrl,
      } satisfies Character;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

import type { SequenceNode } from "../types/sequenceNode";

interface RawText {
  language: string;
  name: string;
  description?: string;
}

interface RawResonanceItem {
  pictureUrl: string;
  resonanceSequence: number;
  texts: RawText[];
}

type RawMap = Record<string, { roleResonance?: { items: RawResonanceItem[] } }>;

// Temporary static data source standing in for a future backend endpoint,
// same pattern as lib/characters.ts.
export async function loadSequenceNodes(characterId: string): Promise<SequenceNode[]> {
  const res = await fetch("/data/wuwa_characters.json");
  const raw: RawMap = await res.json();
  const items = raw[characterId]?.roleResonance?.items ?? [];

  return items
    .map((item) => {
      const en = item.texts.find((t) => t.language === "en");
      return {
        sequence: item.resonanceSequence,
        name: en?.name ?? "Unknown",
        description: en?.description ?? "",
        pictureUrl: item.pictureUrl,
      } satisfies SequenceNode;
    })
    .sort((a, b) => a.sequence - b.sequence);
}

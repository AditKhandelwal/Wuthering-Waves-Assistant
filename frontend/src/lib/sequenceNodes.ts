import type { SequenceNode, SequenceStatBonus } from "../types/sequenceNode";

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

type RawBonusFile = { bonuses: Record<string, SequenceStatBonus[]> };

// See sequence_node_stat_bonuses.json's _note -- hand-curated and
// intentionally partial, unlike loadForteNodes' fully-sourced data.
export async function loadSequenceStatBonuses(characterId: string): Promise<SequenceStatBonus[]> {
  const res = await fetch("/data/sequence_node_stat_bonuses.json");
  const raw: RawBonusFile = await res.json();
  return raw.bonuses[characterId] ?? [];
}

// Sequence-node effects are cumulative once unlocked (unlike forte nodes,
// which are independently toggled) -- sums every bonus whose sequence is at
// or below the currently-unlocked count.
export function computeSequenceBonusTotals(
  bonuses: SequenceStatBonus[],
  unlockedCount: number,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const bonus of bonuses) {
    if (bonus.sequence <= unlockedCount) {
      totals.set(bonus.stat, (totals.get(bonus.stat) ?? 0) + bonus.value);
    }
  }
  return totals;
}

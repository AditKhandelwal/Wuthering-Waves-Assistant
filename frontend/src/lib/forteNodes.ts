import type { CharacterForteNodes } from "../types/forteNode";

type RawFile = {
  nodes: Record<string, CharacterForteNodes>;
};

export async function loadForteNodes(
  characterId: string,
): Promise<CharacterForteNodes | null> {
  const res = await fetch("/data/sequence_stat_nodes.json");
  const raw: RawFile = await res.json();
  return raw.nodes[characterId] ?? null;
}

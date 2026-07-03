import type { SequenceStatNodes } from "../types/sequenceStatNode";

// Source: user-provided data (community-compiled, not sourced from Kuro's
// guide API or the datamined game files like everything else in this app).
// Could not be independently verified against an authoritative source --
// Fandom/Prydwen are blocked for direct fetching, and tracing the values
// through the raw game files leads into an undecoded buff-reference chain.
// Treat as provisional; the UI should carry a visible "unverified" note.
export async function loadSequenceStatNodes(
  characterId: string,
): Promise<SequenceStatNodes | null> {
  const res = await fetch("/data/sequence_stat_nodes.json");
  const data: { nodes: Record<string, SequenceStatNodes> } = await res.json();
  return data.nodes[characterId] ?? null;
}

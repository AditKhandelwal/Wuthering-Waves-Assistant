export interface SequenceNode {
  sequence: number;
  name: string;
  description: string;
  pictureUrl: string;
}

// A hand-verified flat stat bonus a sequence node grants once unlocked --
// see sequence_node_stat_bonuses.json's _note for why this is a separate,
// manually-curated dataset rather than something parsed from SequenceNode's
// free-text description.
export interface SequenceStatBonus {
  sequence: number;
  stat: string;
  value: number;
}

export interface ForteNode {
  stat: string;
  value: number;
}

// 4 columns × 2 tiers each. Index [0] = lower tier (closer to skill, unlocks first),
// index [1] = upper tier (further from skill, unlocks second).
export interface CharacterForteNodes {
  normal_attack: [ForteNode, ForteNode];
  resonance_skill: [ForteNode, ForteNode];
  resonance_liberation: [ForteNode, ForteNode];
  intro_skill: [ForteNode, ForteNode];
}

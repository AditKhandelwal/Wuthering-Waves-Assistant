export interface StatNodeEntry {
  stat: string;
  value: number;
}

export interface SequenceStatNodes {
  left: StatNodeEntry | null;
  leftMid: StatNodeEntry | null;
  rightMid: StatNodeEntry | null;
  right: StatNodeEntry | null;
}

export type StatNodePosition = keyof SequenceStatNodes;

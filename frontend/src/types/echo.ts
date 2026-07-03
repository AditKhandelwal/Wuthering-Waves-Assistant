export interface EchoMainStatOption {
  propId: number;
  statName: string;
  addType: 1 | 2; // 1 flat, 2 percent
  valuesByLevel: Record<number, number>; // 0-25
}

export type EchoCategory = "Calamity" | "Overlord" | "Elite" | "Common";

export interface EchoCatalogEntry {
  name: string;
  cost: 1 | 3 | 4;
  category: EchoCategory;
  setNames: string[];
  kuroGbId: string | null;
  pictureUrl: string | null;
}

export interface EchoSetEffect {
  pieceCount: number;
  description: string;
}

export interface EchoSet {
  name: string;
  effects: EchoSetEffect[];
}

export interface SubStatOption {
  statName: string;
  addType: 1 | 2; // 1 flat, 2 percent
  values: number[]; // discrete roll ladder, 8 or 4 entries
  chances: number[]; // parallel to values
}

export interface EchoStatCurves {
  mainStatOptionsByCost: Record<1 | 3 | 4, EchoMainStatOption[]>;
  subStatOptions: SubStatOption[];
}

export interface SubStatSlot {
  statName: string | null;
  value: number | null;
}

export interface EquippedEcho {
  slotIndex: number;
  echo: EchoCatalogEntry | null;
  chosenSetName: string | null;
  mainStatPropId: number | null;
  level: number; // 0-25
  substats: SubStatSlot[]; // 5 entries
}

export interface ActiveSetBonus {
  setName: string;
  count: number;
  activeEffects: EchoSetEffect[];
}

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
  // Real icon: Kuro's own CDN where a recommended-build character references
  // this set (27/34), game8.co's icon as fallback for the rest -- see
  // extract_kuro_set_icons in scripts/fetch_echo_data.py.
  iconUrl: string | null;
}

export interface SubStatOption {
  statName: string;
  addType: 1 | 2; // 1 flat, 2 percent
  values: number[]; // discrete roll ladder, 8 or 4 entries
  chances: number[]; // parallel to values
}

export interface EchoStatCurves {
  // The player-selectable main stat per cost tier (excludes the static one).
  mainStatOptionsByCost: Record<1 | 3 | 4, EchoMainStatOption[]>;
  // Every echo's second, fixed/non-selectable main stat: flat ATK for cost
  // 3/4, flat HP for cost 1 -- always present regardless of the variable
  // pick, confirmed against a real echo card (see docs/DATA_REQUIREMENTS.md).
  staticMainStatByCost: Record<1 | 3 | 4, EchoMainStatOption>;
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

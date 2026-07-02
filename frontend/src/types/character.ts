export type ElementName =
  | "Glacio"
  | "Fusion"
  | "Electro"
  | "Aero"
  | "Spectro"
  | "Havoc";

// Confirmed empirically against data/wuwa_characters.json role descriptions
// (gbId 6 / Havoc has no textual match in-dataset but is the only remaining slot).
export const ELEMENT_BY_GB_ID: Record<string, ElementName> = {
  "1": "Glacio",
  "2": "Fusion",
  "3": "Electro",
  "4": "Aero",
  "5": "Spectro",
  "6": "Havoc",
};

export interface Character {
  roleGbId: string;
  name: string;
  star: number;
  element: ElementName;
  cardPictureUrl: string;
  illustrationPictureUrl: string;
}

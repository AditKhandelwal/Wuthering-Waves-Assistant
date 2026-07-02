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

export type WeaponTypeName =
  | "Broadblade"
  | "Sword"
  | "Pistols"
  | "Gauntlets"
  | "Rectifier";

export interface Character {
  roleGbId: string;
  name: string;
  star: number;
  element: ElementName;
  weaponType: WeaponTypeName;
  cardPictureUrl: string;
  illustrationPictureUrl: string;
}

export interface RosterData {
  characters: Character[];
  elementIcons: Record<ElementName, string>;
  weaponTypeIcons: Record<WeaponTypeName, string>;
}

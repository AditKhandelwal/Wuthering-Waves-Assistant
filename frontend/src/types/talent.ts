export interface Talent {
  skillType: string;
  name: string;
  description: string;
  pictureUrl: string;
  recommendLevel: number;
}

export interface InherentSkill {
  name: string;
  description: string;
  pictureUrl: string;
}

// roleSkill.keynoteSkills[] -- Outro Skill and Tune Break, real distinct
// skill categories (skillType.texts[].name), not leveled and not the same
// as Inherent Skills (fixedSkills). See lib/talents.ts loadKeynoteSkills.
export interface KeynoteSkill {
  skillType: string;
  name: string;
  description: string;
  pictureUrl: string;
}

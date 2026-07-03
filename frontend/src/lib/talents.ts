import type { InherentSkill, KeynoteSkill, Talent } from "../types/talent";

interface RawText {
  language: string;
  name: string;
  description?: string;
}

interface RawTalentItem {
  pictureUrl: string;
  recommendLevel: number;
  texts: RawText[];
  skillType: { texts: RawText[] };
}

interface RawFixedSkillItem {
  pictureUrl: string;
  texts: RawText[];
}

interface RawKeynoteSkillItem {
  pictureUrl: string;
  texts: RawText[];
  skillType: { texts: RawText[] };
}

type RawMap = Record<
  string,
  {
    roleSkill?: {
      addPointTarget?: RawTalentItem[];
      fixedSkills?: RawFixedSkillItem[];
      keynoteSkills?: RawKeynoteSkillItem[];
    };
  }
>;

// Temporary static data source standing in for a future backend endpoint,
// same pattern as lib/characters.ts.
export async function loadTalents(characterId: string): Promise<Talent[]> {
  const res = await fetch("/data/wuwa_characters.json");
  const raw: RawMap = await res.json();
  const items = raw[characterId]?.roleSkill?.addPointTarget ?? [];

  return items.map((item) => {
    const en = item.texts.find((t) => t.language === "en");
    const skillType = item.skillType.texts.find((t) => t.language === "en");
    return {
      skillType: skillType?.name ?? "Skill",
      name: en?.name ?? "Unknown",
      description: en?.description ?? "",
      pictureUrl: item.pictureUrl,
      recommendLevel: item.recommendLevel,
    } satisfies Talent;
  });
}

// roleSkill.fixedSkills[] -- explicitly labeled "Inherent Skill" in the
// source data (skillType.texts[].name), always-active passive bonuses (not
// leveled, unlike addPointTarget). Exactly 2 per character.
export async function loadInherentSkills(characterId: string): Promise<InherentSkill[]> {
  const res = await fetch("/data/wuwa_characters.json");
  const raw: RawMap = await res.json();
  const items = raw[characterId]?.roleSkill?.fixedSkills ?? [];

  return items.map((item) => {
    const en = item.texts.find((t) => t.language === "en");
    return {
      name: en?.name ?? "Unknown",
      description: en?.description ?? "",
      pictureUrl: item.pictureUrl,
    } satisfies InherentSkill;
  });
}

// roleSkill.keynoteSkills[] -- Outro Skill and Tune Break, real distinct
// skill categories (skillType.texts[].name: "Outro Skill" / "Tune Break"),
// confirmed 2026-07-03 against a real in-game Forte-tree screenshot that
// showed them as their own row below the 5-column talent tree. Not leveled
// (no recommendLevel), not the same as Inherent Skills (fixedSkills).
export async function loadKeynoteSkills(characterId: string): Promise<KeynoteSkill[]> {
  const res = await fetch("/data/wuwa_characters.json");
  const raw: RawMap = await res.json();
  const items = raw[characterId]?.roleSkill?.keynoteSkills ?? [];

  return items.map((item) => {
    const en = item.texts.find((t) => t.language === "en");
    const skillType = item.skillType.texts.find((t) => t.language === "en");
    return {
      skillType: skillType?.name ?? "Skill",
      name: en?.name ?? "Unknown",
      description: en?.description ?? "",
      pictureUrl: item.pictureUrl,
    } satisfies KeynoteSkill;
  });
}

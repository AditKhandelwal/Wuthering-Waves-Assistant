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

// addPointTarget's order is always Normal Attack/Resonance Skill/Forte
// Circuit/Resonance Liberation/Intro Skill (see .claude/rules/database.md,
// .claude/rules/api.md) -- a fixed positional convention, not something
// that varies per character. Used as a fallback when a character's guide
// entry has no "en" skillType text at all (found 2026-08-08: Lingyang's
// addPointTarget is zh-Hans-only for every skillType), since falling back
// to a generic "Skill" label for all 5 made them indistinguishable to
// SKILL_TO_FORTE_COLUMN in TalentGrid.tsx -- every forte stat-bonus node
// silently lost its column match and rendered as an empty placeholder,
// even though the underlying node data was correct.
const POSITIONAL_SKILL_TYPES = [
  "Normal Attack",
  "Resonance Skill",
  "Forte Circuit",
  "Resonance Liberation",
  "Intro Skill",
];

// Temporary static data source standing in for a future backend endpoint,
// same pattern as lib/characters.ts.
export async function loadTalents(characterId: string): Promise<Talent[]> {
  const res = await fetch("/data/wuwa_characters.json");
  const raw: RawMap = await res.json();
  const items = raw[characterId]?.roleSkill?.addPointTarget ?? [];

  return items.map((item, i) => {
    const en = item.texts.find((t) => t.language === "en");
    const skillType = item.skillType.texts.find((t) => t.language === "en");
    return {
      skillType: skillType?.name ?? POSITIONAL_SKILL_TYPES[i] ?? "Skill",
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
// Fixed order, same reasoning as POSITIONAL_SKILL_TYPES above.
const POSITIONAL_KEYNOTE_SKILL_TYPES = ["Outro Skill", "Tune Break"];

export async function loadKeynoteSkills(characterId: string): Promise<KeynoteSkill[]> {
  const res = await fetch("/data/wuwa_characters.json");
  const raw: RawMap = await res.json();
  const items = raw[characterId]?.roleSkill?.keynoteSkills ?? [];

  return items.map((item, i) => {
    const en = item.texts.find((t) => t.language === "en");
    const skillType = item.skillType.texts.find((t) => t.language === "en");
    return {
      skillType: skillType?.name ?? POSITIONAL_KEYNOTE_SKILL_TYPES[i] ?? "Skill",
      name: en?.name ?? "Unknown",
      description: en?.description ?? "",
      pictureUrl: item.pictureUrl,
    } satisfies KeynoteSkill;
  });
}

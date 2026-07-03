import type { Talent } from "../types/talent";

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

type RawMap = Record<string, { roleSkill?: { addPointTarget?: RawTalentItem[] } }>;

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

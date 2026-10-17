"""
Build a lean per-character talent/inherent-skill/keynote-skill/sequence-node
icon extract for the Discord bot's /build card
(frontend/api/discord/build-card.ts), which needs real icons/names/levels
to draw a Forte tree + resonance chain row closely matching the real
site's BuildCard.tsx -- without bundling the full 4.6MB
data/wuwa_characters.json into that function. Mirrors the exact field
extraction + fallback logic in frontend/src/lib/talents.ts's
loadTalents()/loadInherentSkills()/loadKeynoteSkills() and
frontend/src/lib/sequenceNodes.ts's loadSequenceNodes() (see talents.ts's
comments for why the positional fallback exists -- some characters'
skillType text is zh-Hans-only).

Output is bundled directly into frontend/api/discord/ as a static JSON
import (no runtime fetch). Rerun whenever data/wuwa_characters.json
changes, then redeploy the frontend.
"""

import json

CHARS_PATH = "data/wuwa_characters.json"
OUT_PATH = "data/discord_talent_data.json"
FUNCTION_COPY_PATH = "frontend/api/discord/talent_data.json"

POSITIONAL_SKILL_TYPES = [
    "Normal Attack",
    "Resonance Skill",
    "Forte Circuit",
    "Resonance Liberation",
    "Intro Skill",
]
POSITIONAL_KEYNOTE_SKILL_TYPES = ["Outro Skill", "Tune Break"]


def en_text(texts, key="name"):
    en = next((t for t in texts if t.get("language") == "en"), None)
    return en.get(key) if en else None


def main():
    with open(CHARS_PATH, encoding="utf-8") as f:
        chars = json.load(f)

    out = {}
    for role_gb_id, entry in chars.items():
        role_skill = entry.get("roleSkill", {})
        role_resonance = entry.get("roleResonance", {})

        talents = []
        for i, item in enumerate(role_skill.get("addPointTarget", [])):
            skill_type = en_text(item.get("skillType", {}).get("texts", []))
            talents.append(
                {
                    "skillType": skill_type or (POSITIONAL_SKILL_TYPES[i] if i < len(POSITIONAL_SKILL_TYPES) else "Skill"),
                    "name": en_text(item.get("texts", [])) or "Unknown",
                    "pictureUrl": item.get("pictureUrl"),
                }
            )

        inherent_skills = [
            {"name": en_text(item.get("texts", [])) or "Unknown", "pictureUrl": item.get("pictureUrl")}
            for item in role_skill.get("fixedSkills", [])
        ]

        keynote_skills = []
        for i, item in enumerate(role_skill.get("keynoteSkills", [])):
            skill_type = en_text(item.get("skillType", {}).get("texts", []))
            keynote_skills.append(
                {
                    "skillType": skill_type
                    or (POSITIONAL_KEYNOTE_SKILL_TYPES[i] if i < len(POSITIONAL_KEYNOTE_SKILL_TYPES) else "Skill"),
                    "name": en_text(item.get("texts", [])) or "Unknown",
                    "pictureUrl": item.get("pictureUrl"),
                }
            )

        sequence_nodes = sorted(
            (
                {
                    "sequence": item.get("resonanceSequence"),
                    "name": en_text(item.get("texts", [])) or "Unknown",
                    "pictureUrl": item.get("pictureUrl"),
                }
                for item in role_resonance.get("items", [])
            ),
            key=lambda n: n["sequence"],
        )

        if talents or inherent_skills or keynote_skills or sequence_nodes:
            out[role_gb_id] = {
                "talents": talents,
                "inherentSkills": inherent_skills,
                "keynoteSkills": keynote_skills,
                "sequenceNodes": sequence_nodes,
            }

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    with open(FUNCTION_COPY_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)

    print(f"Extracted talent/inherent/keynote/sequence-node data for {len(out)} characters")
    print(f"Wrote {OUT_PATH} and {FUNCTION_COPY_PATH}")


if __name__ == "__main__":
    main()

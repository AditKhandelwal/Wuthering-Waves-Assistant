"""
Build a lean, agent-purpose-built extract of wuwa_characters.json for the
Supabase Edge Function's get_character_guide/get_team_comps tools.

Why a separate file instead of having the function read wuwa_characters.json
directly: that file is 4.6MB of raw Kuro guide response (every language,
every image URL, engagement counters, full nested weapon/echo objects) --
fine for the frontend to fetch as a static asset once, wasteful to bundle
into an Edge Function deploy for the maybe 5% of fields two tools actually
need. This extracts just: stat thresholds, recommended echo + set,
recommended weapons (ranked), rotation/playstyle notes (HTML stripped), and
teammate recommendations -- English only.

Output is copied into supabase/functions/agent/ so the function can bundle
it directly (no runtime fetch, no extra network hop per tool call). Rerun
this whenever data/wuwa_characters.json changes and redeploy the function.
"""

import json
import re
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

CHARS_PATH = "data/wuwa_characters.json"
OUT_PATH = "data/agent_character_guides.json"
FUNCTION_COPY_PATH = "supabase/functions/agent/character_guides.json"

ELEMENT_BY_GB_ID = {
    "1": "Glacio",
    "2": "Fusion",
    "3": "Electro",
    "4": "Aero",
    "5": "Spectro",
    "6": "Havoc",
}

HTML_TAG_RE = re.compile(r"<[^>]+>")


def en_text(texts, key=None):
    en = next((t for t in texts if t.get("language") == "en"), None)
    if not en:
        return None
    return en.get(key) if key else en


def strip_html(html):
    if not html:
        return ""
    text = html.replace("<br>", "\n").replace("<br/>", "\n").replace("</p>", "\n")
    text = HTML_TAG_RE.sub("", text)
    return re.sub(r"\n{2,}", "\n", text).strip()


def main():
    with open(CHARS_PATH, encoding="utf-8") as f:
        chars = json.load(f)

    guides = {}
    for role_id, entry in chars.items():
        role = entry.get("role", {})
        name = en_text(role.get("texts", []), "name")
        if not name:
            continue
        element = ELEMENT_BY_GB_ID.get(role.get("element", {}).get("gbId"))

        stat_thresholds = []
        for item in entry.get("roleAttribute", {}).get("items", []):
            stat_name = en_text(item.get("texts", []), "name")
            if stat_name and item.get("recommendAmount"):
                stat_thresholds.append({"stat": stat_name, "target": item["recommendAmount"]})

        echo_main = entry.get("echo", {}).get("main", {}) or {}
        echo_props = echo_main.get("echoProps") or {}
        recommended_echo_name = en_text(echo_props.get("texts", []), "name") if echo_props else None
        # echoSetEffects has one entry per piece-count threshold (2pc, 5pc,
        # ...) of the SAME set, not one entry per distinct set -- dedupe
        # while preserving order.
        recommended_sets = list(dict.fromkeys(
            n for eff in (echo_main.get("echoSetEffects") or [])
            if (n := en_text(eff.get("texts", []), "name"))
        ))

        recommended_weapons = [
            n for w in entry.get("weapon", {}).get("items", [])
            if (n := en_text(w.get("texts", []), "name"))
        ]

        # roleSkill.addPointSequence -- the priority ORDER Kuro recommends
        # spending level-up materials in (first entry = level first),
        # each with its own target level. Missed entirely in the first
        # version of this extract, which led the agent to falsely claim
        # (both in a tool response and its own system prompt) that no
        # per-skill recommendation existed anywhere in this app's data --
        # caught 2026-08-10 when a user pushed back on that exact claim.
        talent_priority = [
            {
                "skill": en_text(s.get("skillType", {}).get("texts", []), "name"),
                "recommendLevel": s.get("recommendLevel"),
            }
            for s in entry.get("roleSkill", {}).get("addPointSequence", [])
            if en_text(s.get("skillType", {}).get("texts", []), "name")
        ]

        base_text = en_text(entry.get("baseTexts", []))
        rotation_notes = strip_html(base_text.get("roleDescription")) if base_text else ""

        team_comps = []
        for item in entry.get("teammate", {}).get("items", []):
            main_name = en_text(item.get("main", {}).get("texts", []), "name")
            if not main_name:
                continue
            spare_names = [
                n for s in item.get("spares", [])
                if (n := en_text(s.get("texts", []), "name"))
            ]
            team_comps.append({"main": main_name, "spares": spare_names})

        guides[role_id] = {
            "name": name,
            "element": element,
            "statThresholds": stat_thresholds,
            "recommendedEcho": {"name": recommended_echo_name, "sets": recommended_sets},
            "recommendedWeapons": recommended_weapons,
            "talentPriority": talent_priority,
            "rotationNotes": rotation_notes,
            "teamComps": team_comps,
        }

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(guides, f, ensure_ascii=False, indent=2)
    with open(FUNCTION_COPY_PATH, "w", encoding="utf-8") as f:
        json.dump(guides, f, ensure_ascii=False)  # no indent -- smaller deploy bundle

    import os
    raw_size = os.path.getsize(CHARS_PATH)
    out_size = os.path.getsize(OUT_PATH)
    print(f"Built guides for {len(guides)} characters")
    print(f"{CHARS_PATH}: {raw_size:,} bytes -> {OUT_PATH}: {out_size:,} bytes ({out_size/raw_size:.1%})")
    print(f"Copied to {FUNCTION_COPY_PATH}")


if __name__ == "__main__":
    main()

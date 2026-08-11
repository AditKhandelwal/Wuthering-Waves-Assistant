"""
Build a lean gbId -> weapon name map for the Supabase Edge Function's
get_character_build tool (resolving a saved build's weapon_gb_id to a real
display name for the agent to compare against get_character_guide's
recommendedWeapons list).

Why not just bundle data/weapon_catalog.json directly (as the function did
until now): that file is dotgg.gg-only and covers just 100 of 118 weapon
gbIds. The frontend's loadWeaponCatalog() (frontend/src/lib/weapons.ts)
fills the remaining gap from wuwa_characters.json's per-character
recommended-weapon texts (Kuro's own guide data) -- this script does the
same merge, but as a tiny extract instead of bundling all 4.6MB of
wuwa_characters.json. Confirmed real-world impact: weapon 21020076
("Everbright Polestar") is Kuro-only, not in dotgg's catalog at all -- a
user's real build showed as "Unknown (id 21020076)" in an agent response
until this existed.

Output is copied into supabase/functions/agent/ so the function can bundle
it directly (no runtime fetch). Rerun this whenever data/weapon_catalog.json
or data/wuwa_characters.json changes, then redeploy the function.
"""

import json
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

WEAPON_CATALOG_PATH = "data/weapon_catalog.json"
CHARS_PATH = "data/wuwa_characters.json"
OUT_PATH = "data/agent_weapon_names.json"
FUNCTION_COPY_PATH = "supabase/functions/agent/weapon_names.json"


def en_text(texts, key):
    en = next((t for t in texts if t.get("language") == "en"), None)
    return en.get(key) if en else None


def main():
    with open(WEAPON_CATALOG_PATH, encoding="utf-8") as f:
        weapon_catalog = json.load(f)
    with open(CHARS_PATH, encoding="utf-8") as f:
        chars = json.load(f)

    names = {}
    for gb_id, w in weapon_catalog.items():
        name = w.get("name")
        if name and name != "Unknown":
            names[gb_id] = name

    added_from_kuro = 0
    for entry in chars.values():
        for w in entry.get("weapon", {}).get("items", []):
            gb_id = w.get("gbId")
            if not gb_id or gb_id in names:
                continue
            name = en_text(w.get("texts", []), "name")
            if name:
                names[gb_id] = name
                added_from_kuro += 1

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(names, f, ensure_ascii=False, indent=2)
    with open(FUNCTION_COPY_PATH, "w", encoding="utf-8") as f:
        json.dump(names, f, ensure_ascii=False)  # no indent -- smaller deploy bundle

    print(f"Resolved {len(names)} weapon names ({added_from_kuro} from Kuro data beyond dotgg's catalog)")
    print(f"Wrote {OUT_PATH} and {FUNCTION_COPY_PATH}")


if __name__ == "__main__":
    main()

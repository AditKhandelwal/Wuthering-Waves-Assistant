"""
Build a lean roleGbId -> {name, element, cardPictureUrl,
illustrationPictureUrl, elementIconUrl} character map for the Discord
bot's /builds and /stats commands (frontend/api/discord/interactions.ts),
which run in a Vercel Edge Function with no filesystem access at runtime
(no fs module) and a 3-second response budget -- nowhere near enough to
fetch or parse the 4.6MB data/wuwa_characters.json. name/element come from
data/agent_character_guides.json (already a lean, committed extract built
by build_agent_character_guides.py) -- same reasoning as
build_agent_weapon_names.py, just one more consumer of the same pattern.
All three picture URLs are pulled straight from data/wuwa_characters.json
(this script runs locally at build time, not in the Edge runtime, so
reading the 4.6MB file here is fine -- only what gets bundled into the
function needs to stay lean, and a few dozen short URL strings cost
nothing). Same fields the frontend's own CharacterCard.tsx/BuildCard.tsx
already use (cardPictureUrl for the roster grid, illustrationPictureUrl
for the larger build-card portrait, role.element.pictureUrl for the
element glyph shown next to the name -- see ElementIcon.tsx/
frontend/src/lib/characters.ts's elementIcons map), so Discord's images
match the site's own. Element is included so /stats's card can be
element-accent-themed.

Output is bundled directly into frontend/api/discord/ as a static JSON
import (no runtime fetch -- the Vercel bundler inlines it at build time).
Rerun whenever data/agent_character_guides.json or data/wuwa_characters.json
changes, then redeploy the frontend (git push -- Vercel auto-deploys).
"""

import json

GUIDES_PATH = "data/agent_character_guides.json"
CHARS_PATH = "data/wuwa_characters.json"
OUT_PATH = "data/discord_characters.json"
FUNCTION_COPY_PATH = "frontend/api/discord/characters.json"


def main():
    with open(GUIDES_PATH, encoding="utf-8") as f:
        guides = json.load(f)
    with open(CHARS_PATH, encoding="utf-8") as f:
        full_chars = json.load(f)

    chars = {}
    for role_gb_id, entry in guides.items():
        role = full_chars.get(role_gb_id, {}).get("role", {})
        chars[role_gb_id] = {
            "name": entry["name"],
            "element": entry.get("element"),
            "cardPictureUrl": role.get("cardPictureUrl"),
            "illustrationPictureUrl": role.get("illustrationPictureUrl"),
            "elementIconUrl": role.get("element", {}).get("pictureUrl"),
        }

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(chars, f, ensure_ascii=False, indent=2)
    with open(FUNCTION_COPY_PATH, "w", encoding="utf-8") as f:
        json.dump(chars, f, ensure_ascii=False)

    missing_pictures = [rid for rid, c in chars.items() if not c["cardPictureUrl"]]
    print(f"Resolved {len(chars)} characters (name + element + cardPictureUrl)")
    if missing_pictures:
        print(f"Missing cardPictureUrl for: {missing_pictures}")
    print(f"Wrote {OUT_PATH} and {FUNCTION_COPY_PATH}")


if __name__ == "__main__":
    main()

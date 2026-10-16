"""
Build a lean roleGbId -> character name map for the Discord bot's /builds
and /build commands (frontend/api/discord/interactions.ts), which run in a
Vercel Edge Function with no filesystem access at runtime (no fs module)
and a 3-second response budget -- nowhere near enough to fetch or parse
the 4.6MB data/wuwa_characters.json. Extracted from
data/agent_character_guides.json (already a lean, committed extract built
by build_agent_character_guides.py) rather than wuwa_characters.json
directly -- same reasoning as build_agent_weapon_names.py, just one more
consumer of the same pattern.

Output is bundled directly into frontend/api/discord/ as a static JSON
import (no runtime fetch -- the Vercel bundler inlines it at build time).
Rerun whenever data/agent_character_guides.json changes (i.e. whenever
build_agent_character_guides.py gets rerun for a new character), then
redeploy the frontend (git push -- Vercel auto-deploys).
"""

import json

GUIDES_PATH = "data/agent_character_guides.json"
OUT_PATH = "data/discord_character_names.json"
FUNCTION_COPY_PATH = "frontend/api/discord/character_names.json"


def main():
    with open(GUIDES_PATH, encoding="utf-8") as f:
        guides = json.load(f)

    names = {role_gb_id: entry["name"] for role_gb_id, entry in guides.items()}

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(names, f, ensure_ascii=False, indent=2)
    with open(FUNCTION_COPY_PATH, "w", encoding="utf-8") as f:
        json.dump(names, f, ensure_ascii=False)

    print(f"Resolved {len(names)} character names")
    print(f"Wrote {OUT_PATH} and {FUNCTION_COPY_PATH}")


if __name__ == "__main__":
    main()

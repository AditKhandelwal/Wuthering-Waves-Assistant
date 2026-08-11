"""
Fetch the full weapon catalog (name, icon, rarity, passive text) from the
dotgg.gg API and write data/weapon_catalog.json, keyed by weapon gbId.

Why this exists: `data/weapon_stat_curves.json` already has real ATK/
secondary-stat curves for all 118 weapons (see docs/DATA_REQUIREMENTS.md),
but display data (name/icon/passive) previously only came from whichever
weapons happen to be *recommended* for at least one of our characters in
`wuwa_characters.json` (~72 of 118), plus a 12-entry hardcoded list in
frontend/src/lib/weapons.ts. This script replaces that hardcoded list with
a real fetched catalog covering the rest.

Endpoint: GET https://api.dotgg.gg/cgfw/getgacha?game=wuthering-waves&type=weapons
Returns ~105 weapons. Each has `skill.params`: a list of 5 rank arrays
(one per refinement rank), each containing the values for the numbered
placeholders ({0}, {1}, ...) in `skill.description`. E.g. for
"Increases ATK by {0}." with params [["4%"],["5%"],...,["8%"]], the 5 ranks'
values for placeholder {0} are joined "4%/5%/6%/7%/8%" -- same rank-scaled
text format Kuro's own guide API uses (see the character-recommended
weapon texts already in wuwa_characters.json).

Only IDs also present in weapon_stat_curves.json's `baseAtk` are kept --
a display entry with no computable ATK/secondary-stat would be broken in
the build screen, not useful. As of 2026-08-07 this leaves 3 of 118 IDs
(21010045/21020045/21050045) with no display data from either source --
logged, not guessed.
"""

import json
import re
import sys
import io
import urllib.request

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

DOTGG_URL = "https://api.dotgg.gg/cgfw/getgacha?game=wuthering-waves&type=weapons"
CURVES_PATH = "data/weapon_stat_curves.json"
OUT_PATH = "data/weapon_catalog.json"
FRONTEND_COPY_PATH = "frontend/public/data/weapon_catalog.json"
ICON_BASE = "https://static.dotgg.gg/wuthering-waves/"

HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Referer": "https://wutheringwaves.gg/",
}


def fetch_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def format_description(skill):
    """Expand dotgg's {0}/{1}/... placeholders into rank-scaled "a/b/c/d/e" text."""
    if not skill:
        return ""
    description = skill.get("description") or ""
    params = skill.get("params") or []
    if not description or not params:
        return description

    num_placeholders = len(params[0]) if params else 0
    for i in range(num_placeholders):
        values = [str(rank[i]) if i < len(rank) and rank[i] is not None else "?" for rank in params]
        description = description.replace(f"{{{i}}}", "/".join(values))
    return description


def main():
    print("Loading weapon_stat_curves.json...")
    with open(CURVES_PATH, encoding="utf-8") as f:
        curves = json.load(f)
    base_atk_ids = set(curves["baseAtk"].keys())
    print(f"  {len(base_atk_ids)} weapons with real ATK/stat curves")

    print("Fetching dotgg weapon list...")
    dotgg_weapons = fetch_json(DOTGG_URL)
    print(f"  {len(dotgg_weapons)} weapons from dotgg API")

    catalog = {}
    skipped_no_curve = []
    for w in dotgg_weapons:
        gb_id = w.get("id")
        if gb_id not in base_atk_ids:
            skipped_no_curve.append(f"{w.get('name')} ({gb_id})")
            continue

        icon = w.get("icon") or ""
        catalog[gb_id] = {
            "gbId": gb_id,
            "name": w.get("name", "Unknown"),
            "pictureUrl": ICON_BASE + icon if icon else "",
            "star": int(w.get("rarity", 0)),
            "weaponType": w.get("type", "Sword"),
            "effectName": "",
            "effectDescription": format_description(w.get("skill")),
        }

    missing = base_atk_ids - catalog.keys()
    print(f"\nBuilt catalog entries for {len(catalog)} weapons")
    if skipped_no_curve:
        print(f"Skipped {len(skipped_no_curve)} dotgg weapons with no matching stat curve:")
        for s in skipped_no_curve:
            print(f"  - {s}")
    if missing:
        print(f"\n{len(missing)} weapon(s) still have NO display data (no dotgg match either):")
        for m in sorted(missing):
            print(f"  - {m}")

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, indent=2)
    with open(FRONTEND_COPY_PATH, "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, indent=2)

    print(f"\nWrote {OUT_PATH} and {FRONTEND_COPY_PATH}")


if __name__ == "__main__":
    main()

"""
Fetch per-character level-1 base HP/ATK/DEF and the universal level-scaling
growth curve, writing data/character_stat_curves.json.

wuwa_characters.json (Kuro's guide API) has no base-stat or level-curve data
at all -- this comes entirely from Arikatsu/WutheringWaves_Data, a raw
datamine repo that tracks the live game client and renames its default
branch to the current game version (e.g. "3.5") on every patch. Resolve the
branch dynamically via the GitHub API rather than hardcoding it, or this
script silently goes stale next patch.

Source files (BinData/ prefix -- this repo reorganized at some point; an
earlier version of this data lived under a bare property/ path, see git
history of docs/DATA_REQUIREMENTS.md):
  BinData/role/roleinfo.json          -- role Id -> PropertyId mapping
  BinData/property/baseproperty.json  -- (Id, Lv) -> LifeMax/Atk/Def, keyed
                                          by PropertyId (2740 rows: every
                                          character AND monster/NPC, so this
                                          must be filtered to known role Ids)
  BinData/property/rolepropertygrowth.json -- universal (Level, BreachLevel)
                                          -> ratio table, same for every
                                          character; not filtered by role Id
                                          at all

Confirmed against existing data 2026-08-08: Carlotta (1107) Lv1 gives
LifeMax=996/Atk=37/Def=98, exact match to the previously-hand-built
data/character_stat_curves.json -- so this is the real original source,
just not previously captured as a rerunnable script.
"""

import json
import sys
import io
import urllib.request

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

REPO = "Arikatsu/WutheringWaves_Data"
CHARS_PATH = "data/wuwa_characters.json"
OUT_PATH = "data/character_stat_curves.json"
FRONTEND_COPY_PATH = "frontend/public/data/character_stat_curves.json"

HEADERS = {"User-Agent": "Mozilla/5.0"}


def fetch_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def get_default_branch():
    info = fetch_json(f"https://api.github.com/repos/{REPO}")
    return info["default_branch"]


def raw_url(branch, path):
    return f"https://raw.githubusercontent.com/{REPO}/{branch}/{path}"


def main():
    print("Resolving Arikatsu/WutheringWaves_Data's current default branch...")
    branch = get_default_branch()
    print(f"  branch: {branch}")

    with open(CHARS_PATH, encoding="utf-8") as f:
        chars = json.load(f)
    role_ids = {int(rid) for rid in chars.keys()}
    print(f"Loaded {len(role_ids)} character role IDs from {CHARS_PATH}")

    print("Fetching roleinfo.json (role Id -> PropertyId)...")
    roleinfo = fetch_json(raw_url(branch, "BinData/role/roleinfo.json"))
    property_id_by_role = {r["Id"]: r["PropertyId"] for r in roleinfo}

    print("Fetching baseproperty.json (this is a few MB, all characters + monsters)...")
    baseproperty = fetch_json(raw_url(branch, "BinData/property/baseproperty.json"))
    base_by_id_lv1 = {
        row["Id"]: row for row in baseproperty if row["Lv"] == 1
    }

    print("Fetching rolepropertygrowth.json (universal growth curve)...")
    growth_raw = fetch_json(raw_url(branch, "BinData/property/rolepropertygrowth.json"))
    growth_curve = [
        {
            "level": row["Level"],
            "breachLevel": row["BreachLevel"],
            "lifeMaxRatio": row["LifeMaxRatio"],
            "atkRatio": row["AtkRatio"],
            "defRatio": row["DefRatio"],
        }
        for row in growth_raw
    ]

    base_stats = {}
    missing = []
    for role_id in sorted(role_ids):
        property_id = property_id_by_role.get(role_id, role_id)
        row = base_by_id_lv1.get(property_id)
        if not row:
            missing.append(role_id)
            continue
        base_stats[str(role_id)] = {
            "lifeMax": row["LifeMax"],
            "atk": row["Atk"],
            "def": row["Def"],
        }

    print(f"\nBuilt base stats for {len(base_stats)}/{len(role_ids)} characters")
    if missing:
        print(f"Missing (no roleinfo/baseproperty match): {missing}")

    out = {"baseStats": base_stats, "growthCurve": growth_curve}

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    with open(FRONTEND_COPY_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print(f"Wrote {OUT_PATH} and {FRONTEND_COPY_PATH}")


if __name__ == "__main__":
    main()

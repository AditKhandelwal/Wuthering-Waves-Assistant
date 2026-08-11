"""
Fetch Forte Circuit stat bonus nodes (the 8 togglable %stat nodes per
character) directly from Arikatsu/WutheringWaves_Data's raw skill-tree
datamine, replacing the earlier dotgg.gg + wutheringlab.com hybrid.

Why the switch (2026-08-08): dotgg.gg was missing 12+ characters and every
one of the 2026-08 patch's new characters (Suisui, Rover: Electro,
Yangyang: Xuanling); the wutheringlab fallback used for those 12 was a
hand-derived approximation from a published aggregate total, not a
verified per-node value -- and one of those approximations turned out to
be wrong (Mornye's Healing Bonus: guessed 1.25%/3.75% vs the real
1.80%/4.20% standard tier, caught by cross-checking against this source).
This datamine has real per-node values for every character, tracks the
live game client, and renames its default branch to the current game
version (e.g. "3.5") each patch -- resolved dynamically via the GitHub API
rather than hardcoded, same pattern as fetch_character_stat_curves.py.

Source: BinData/skillTree/skilltree.json, a flat list of ~950 nodes
covering every character's full skill tree (talents, inherent skills, AND
the 8 forte stat-bonus nodes) keyed by `NodeGroup` == roleGbId. `NodeType`
4 = the stat-bonus nodes specifically. Each stat-bonus node's
`ParentNodes[0]` points to another node's `NodeIndex` -- walk that chain
up until hitting a `NodeType` 2 node (one of the 4 outer talent columns:
Normal Attack/Resonance Skill/Resonance Liberation/Intro Skill, always
exactly 4 per character, distinguished by `Coordinate` 1-4 in that fixed
order) to determine which of our 4 columns a given stat node belongs to.
Forte Circuit itself is `NodeType` 1 (not 2) and has no stat-bonus
children of its own, matching this app's existing "Forte Circuit uses
Inherent Skills instead" design (see TalentGrid.tsx). A stat-bonus node's
own `Coordinate` (1 or 2) gives its tier: 1=lower, 2=upper.

Property Id -> stat name mapping (found by cross-checking against known-
correct values already in data/sequence_stat_nodes.json for characters
spanning all 6 elements plus 3 known healers -- Aemeath, Sanhua/Yangyang/
Mortefi/Encore/Verina/Taoqi one per element, Mornye/Verina/Shorekeeper for
Healing Bonus):
    8 = Crit. Rate      9 = Crit. DMG       35 = Healing Bonus
    10002 = HP%         10007 = ATK%        10010 = DEF%
    22 = Glacio DMG Bonus     23 = Fusion DMG Bonus   24 = Electro DMG Bonus
    25 = Aero DMG Bonus       26 = Spectro DMG Bonus  27 = Havoc DMG Bonus
Value conversion matches the existing convention elsewhere in this codebase
(see STAT_NAME_BY_PROP_ID in frontend/src/lib/weapons.ts): `IsRatio: true`
values are raw fractions (0.018 -> 1.8%, multiply by 100); `IsRatio: false`
values are already *100 basis points (180 -> 1.80%, divide by 100).
"""

import json
import sys
import io
import urllib.request

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

REPO = "Arikatsu/WutheringWaves_Data"
CHARS_PATH = "data/wuwa_characters.json"
OUT_PATH = "data/sequence_stat_nodes.json"
FRONTEND_COPY_PATH = "frontend/public/data/sequence_stat_nodes.json"

HEADERS = {"User-Agent": "Mozilla/5.0"}

STAT_NAME_BY_PROPERTY_ID = {
    8: "Crit. Rate",
    9: "Crit. DMG",
    35: "Healing Bonus",
    # NOT "HP%"/"ATK%"/"DEF%" -- this app's existing convention (see
    # .claude/rules/api.md and frontend/src/lib/finalStats.ts's
    # forte("ATK")/forte("HP")/forte("DEF") lookups) stores these bare,
    # even though they're percentage multipliers under the hood. Got this
    # wrong on the first pass of this script (used "ATK%" etc, matching the
    # echo/weapon stat-name convention instead) -- would have silently
    # zeroed out every character's ATK/HP/DEF forte contribution, caught
    # before shipping by checking against frontend/src/lib/finalStats.ts.
    10002: "HP",
    10007: "ATK",
    10010: "DEF",
    22: "Glacio DMG Bonus",
    23: "Fusion DMG Bonus",
    24: "Electro DMG Bonus",
    25: "Aero DMG Bonus",
    26: "Spectro DMG Bonus",
    27: "Havoc DMG Bonus",
}

# roleGbId of the gender-variant partner that shares data 1:1 -- not present
# as its own NodeGroup in skilltree.json (same "one entry serves both"
# pattern as the Kuro guide API itself, see .claude/rules/api.md).
ROVER_DUPLICATE_OF = {
    "1310": "1309",
    "1408": "1406",
    "1502": "1501",
    "1605": "1604",
}

COLUMN_ORDER = ["normal_attack", "resonance_skill", "resonance_liberation", "intro_skill"]


def fetch_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def get_default_branch():
    info = fetch_json(f"https://api.github.com/repos/{REPO}")
    return info["default_branch"]


def raw_url(branch, path):
    return f"https://raw.githubusercontent.com/{REPO}/{branch}/{path}"


def resolve_column(node, by_index, col_by_node_index):
    cur = node
    while cur["NodeIndex"] not in col_by_node_index:
        if not cur["ParentNodes"]:
            return None
        cur = by_index[cur["ParentNodes"][0]]
    return col_by_node_index[cur["NodeIndex"]]


def extract_character_nodes(nodes):
    by_index = {n["NodeIndex"]: n for n in nodes}
    talents = sorted((n for n in nodes if n["NodeType"] == 2), key=lambda n: n["Coordinate"])
    if len(talents) != 4:
        return None
    col_by_node_index = {n["NodeIndex"]: COLUMN_ORDER[i] for i, n in enumerate(talents)}

    result = {col: [None, None] for col in COLUMN_ORDER}
    for n in nodes:
        if n["NodeType"] != 4:
            continue
        col = resolve_column(n, by_index, col_by_node_index)
        if col is None or not n["Property"]:
            continue
        prop = n["Property"][0]
        stat_name = STAT_NAME_BY_PROPERTY_ID.get(prop["Id"])
        if stat_name is None:
            continue
        raw_value = prop["Value"]
        value = round(raw_value * 100 if prop["IsRatio"] else raw_value / 100, 4)
        tier_index = n["Coordinate"] - 1
        if tier_index not in (0, 1):
            continue
        result[col][tier_index] = {"stat": stat_name, "value": value}

    if any(v is None for col in result.values() for v in col):
        return None
    return result


def main():
    print("Resolving Arikatsu/WutheringWaves_Data's current default branch...")
    branch = get_default_branch()
    print(f"  branch: {branch}")

    with open(CHARS_PATH, encoding="utf-8") as f:
        chars = json.load(f)
    role_ids = set(chars.keys())
    print(f"Loaded {len(role_ids)} character role IDs from {CHARS_PATH}")

    print("Fetching skilltree.json...")
    skilltree = fetch_json(raw_url(branch, "BinData/skillTree/skilltree.json"))

    by_group = {}
    for n in skilltree:
        by_group.setdefault(n["NodeGroup"], []).append(n)

    nodes_by_id = {}
    missing = []
    for role_id in sorted(role_ids, key=int):
        if role_id in ROVER_DUPLICATE_OF:
            continue  # filled in below from its sibling
        group_nodes = by_group.get(int(role_id))
        if not group_nodes:
            missing.append(role_id)
            continue
        extracted = extract_character_nodes(group_nodes)
        if extracted is None:
            missing.append(role_id)
            continue
        nodes_by_id[role_id] = extracted

    for dup_id, source_id in ROVER_DUPLICATE_OF.items():
        if dup_id in role_ids and source_id in nodes_by_id:
            nodes_by_id[dup_id] = nodes_by_id[source_id]

    print(f"\nBuilt forte nodes for {len(nodes_by_id)}/{len(role_ids)} characters")
    if missing:
        print(f"Missing: {missing}")

    out = {
        "_note": (
            "Forte Circuit stat bonus nodes. Source: Arikatsu/WutheringWaves_Data "
            "raw skill-tree datamine (BinData/skillTree/skilltree.json), replacing "
            "the earlier dotgg.gg + wutheringlab.com hybrid (2026-08-08) -- see "
            "this script's docstring for the extraction method and property-Id "
            "mapping. 8 nodes per character: 2 per non-Forte-Circuit column "
            "(lower tier, upper tier). Values are percentages. Columns: "
            "normal_attack, resonance_skill, resonance_liberation, intro_skill. "
            "Array index [0]=lower tier (closer to skill), [1]=upper tier "
            "(further from skill, unlocks after lower)."
        ),
        "nodes": nodes_by_id,
    }

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    with open(FRONTEND_COPY_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print(f"Wrote {OUT_PATH} and {FRONTEND_COPY_PATH}")


if __name__ == "__main__":
    main()

"""
Fetch character forte_bonuses (stat bonus nodes) from the dotgg.gg API
and merge them into data/sequence_stat_nodes.json, keyed by roleGbId.

The dotgg API returns 8 forte_bonuses per character. Sorted by id:
  [0] lower-tier outer-left  (Normal Attack column, lower node)
  [1] lower-tier inner-left  (Resonance Skill column, lower node)
  [2] lower-tier inner-right (Resonance Liberation column, lower node)
  [3] lower-tier outer-right (Intro Skill column, lower node)
  [4] higher-tier outer-left
  [5] higher-tier inner-left
  [6] higher-tier inner-right
  [7] higher-tier outer-right

Each has a "name" like "Crit. Rate+2.80%" or "ATK+4.20%".
"""

import json
import re
import sys
import io
import urllib.request

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

DOTGG_URL = "https://api.dotgg.gg/cgfw/getgacha?game=wuthering-waves&type=characters"
CHARS_PATH = "data/wuwa_characters.json"
OUT_PATH = "data/sequence_stat_nodes.json"

HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Referer": "https://wutheringwaves.gg/",
}


def fetch_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def parse_bonus(name_str):
    """Parse "Crit. Rate+2.80%" or "Crit. Rate Up2.80%" → {"stat": "Crit. Rate", "value": 2.8}"""
    m = re.match(r"^(.+?)(?:\+| Up)([0-9.]+)%$", name_str)
    if not m:
        return None
    return {"stat": m.group(1).rstrip(), "value": round(float(m.group(2)), 4)}


def main():
    print("Loading wuwa_characters.json...")
    with open(CHARS_PATH, encoding="utf-8") as f:
        chars = json.load(f)

    # Build name → roleGbId map (English names only)
    name_to_id = {}
    for role_id, entry in chars.items():
        texts = entry.get("role", {}).get("texts", [])
        en = next((t for t in texts if t.get("language") == "en"), None)
        if en and en.get("name"):
            name_to_id[en["name"].strip()] = role_id

    # Manual overrides for characters missing from wuwa_characters.json
    # (initial fetch missed their ID block; dotgg knows them by name)
    MANUAL_IDS = {
        "Youhu":    "1106",
        "Yangyang": "1402",
    }
    name_to_id.update(MANUAL_IDS)

    print(f"  {len(name_to_id)} characters in wuwa_characters.json (+{len(MANUAL_IDS)} manual)")

    print("Fetching dotgg character list...")
    dotgg_chars = fetch_json(DOTGG_URL)
    print(f"  {len(dotgg_chars)} characters from dotgg API")

    nodes_by_id = {}
    unmatched = []

    for dc in dotgg_chars:
        dotgg_name = dc.get("name", "").strip()
        bonuses = dc.get("forte_bonuses") or []
        if not bonuses:
            unmatched.append(f"{dotgg_name} (no forte_bonuses)")
            continue

        # Sort by id to get canonical order
        bonuses_sorted = sorted(bonuses, key=lambda b: b["id"])
        if len(bonuses_sorted) != 8:
            print(f"  WARNING: {dotgg_name} has {len(bonuses_sorted)} bonuses (expected 8)")

        # Parse each bonus
        parsed = [parse_bonus(b["name"]) for b in bonuses_sorted]

        # Rover gender pairs share the same forte data — map one dotgg entry to both IDs.
        # key: dotgg name → list of our roleGbIds.
        # IMPORTANT: "Rover (Male)"/"Rover (Female)" are Spectro (1501/1502), NOT Aero.
        # "Rover: Aero" is only used for 1406/1408. Do not conflate by element.
        ROVER_PAIRS = {
            "Rover: Aero":           ["1406", "1408"],
            "Rover: Spectro":        ["1501", "1502"],
            "Rover (Spectro)":       ["1501", "1502"],
            "Rover (Male)":          ["1501", "1502"],
            "Rover (Female)":        ["1501", "1502"],
            "Rover: Havoc":          ["1604", "1605"],
            "Rover (Havoc)":         ["1604", "1605"],
            "Rover (Havoc) (Female)":["1604", "1605"],
            "Rover (Havoc) (Male)":  ["1604", "1605"],
        }

        # Positions: sorted[0-3] = lower tier, sorted[4-7] = higher tier
        # Each column gets 2 nodes: lower and upper
        # Columns: normal_attack(0), resonance_skill(1), resonance_liberation(2), intro_skill(3)
        entry = {
            "normal_attack":         [parsed[0], parsed[4]],  # lower, upper
            "resonance_skill":       [parsed[1], parsed[5]],
            "resonance_liberation":  [parsed[2], parsed[6]],
            "intro_skill":           [parsed[3], parsed[7]],
        }

        # Try Rover pair match first
        rover_ids = None
        for rover_name, ids in ROVER_PAIRS.items():
            if rover_name.lower() in dotgg_name.lower() or dotgg_name.lower() in rover_name.lower():
                rover_ids = ids
                break

        if rover_ids:
            for rid in rover_ids:
                nodes_by_id[rid] = entry
            print(f"  ✓ {dotgg_name} → {', '.join(rover_ids)} (Rover pair)")
            continue

        # Match to roleGbId by exact name
        role_id = name_to_id.get(dotgg_name)

        # Fallback: case-insensitive
        if not role_id:
            for our_name, rid in name_to_id.items():
                if our_name.lower() == dotgg_name.lower():
                    role_id = rid
                    break

        if not role_id:
            unmatched.append(f"{dotgg_name} (no ID match)")
            continue

        nodes_by_id[role_id] = entry
        print(f"  ✓ {dotgg_name} → {role_id}")

    # Fallback data for characters not yet in dotgg, derived from wutheringlab.com
    # aggregate totals (2026-07-04). Format: same 4-column × 2-tier structure.
    # Standard tiers: Crit.Rate 1.20/2.80, Crit.DMG 2.40/5.60, ATK 1.80/4.20,
    # HP 1.80/4.20, Healing Bonus 1.80/4.20, DEF 2.28/5.32.
    # Non-standard noted inline. Source column ordering inferred from character role.
    def col(stat, lo, hi):
        return [{"stat": stat, "value": lo}, {"stat": stat, "value": hi}]

    crit_rate = col("Crit. Rate", 1.2, 2.8)
    atk       = col("ATK", 1.8, 4.2)
    crit_dmg  = col("Crit. DMG", 2.4, 5.6)

    WUTHERINGLAB_FALLBACK = {
        # Crit Rate 8% (outer) + ATK 12% (inner) — standard DPS template
        "1108": {"normal_attack": crit_rate, "resonance_skill": atk,      "resonance_liberation": atk,      "intro_skill": crit_rate},  # Hiyuki
        "1109": {"normal_attack": crit_rate, "resonance_skill": atk,      "resonance_liberation": atk,      "intro_skill": crit_rate},  # Lucilla
        "1210": {"normal_attack": crit_rate, "resonance_skill": atk,      "resonance_liberation": atk,      "intro_skill": crit_rate},  # Aemeath
        "1307": {"normal_attack": crit_rate, "resonance_skill": atk,      "resonance_liberation": atk,      "intro_skill": crit_rate},  # Buling
        "1308": {"normal_attack": crit_rate, "resonance_skill": atk,      "resonance_liberation": atk,      "intro_skill": crit_rate},  # Rebecca
        "1411": {"normal_attack": crit_rate, "resonance_skill": atk,      "resonance_liberation": atk,      "intro_skill": crit_rate},  # Qiuyuan
        "1412": {"normal_attack": crit_rate, "resonance_skill": atk,      "resonance_liberation": atk,      "intro_skill": crit_rate},  # Sigrika
        "1509": {"normal_attack": crit_rate, "resonance_skill": atk,      "resonance_liberation": atk,      "intro_skill": crit_rate},  # Lynae
        "1510": {"normal_attack": crit_rate, "resonance_skill": atk,      "resonance_liberation": atk,      "intro_skill": crit_rate},  # Luuk Herssen
        "1511": {"normal_attack": crit_rate, "resonance_skill": atk,      "resonance_liberation": atk,      "intro_skill": crit_rate},  # Lucy
        "1508": {"normal_attack": crit_rate, "resonance_skill": atk,      "resonance_liberation": atk,      "intro_skill": crit_rate},  # Chisa

        # Crit DMG 16% (outer) + ATK 12% (inner) — standard Crit DMG DPS template
        "1211": {"normal_attack": crit_dmg,  "resonance_skill": atk,      "resonance_liberation": atk,      "intro_skill": crit_dmg},   # Denia

        # Crit DMG 8% (outer) — non-standard tier (1.20/2.80) derived from wutheringlab total
        "1208": {"normal_attack": col("Crit. DMG", 1.2, 2.8), "resonance_skill": atk, "resonance_liberation": atk, "intro_skill": col("Crit. DMG", 1.2, 2.8)},  # Galbrena

        # Healer/support: DEF 15% (outer, 2.28/5.32) + Healing Bonus 10% (inner, non-standard 1.25/3.75)
        "1209": {"normal_attack": col("DEF", 2.28, 5.32), "resonance_skill": col("Healing Bonus", 1.25, 3.75), "resonance_liberation": col("Healing Bonus", 1.25, 3.75), "intro_skill": col("DEF", 2.28, 5.32)},  # Mornye

    }

    for role_id, entry in WUTHERINGLAB_FALLBACK.items():
        if role_id not in nodes_by_id:
            nodes_by_id[role_id] = entry
            print(f"  + {role_id} (wutheringlab fallback)")

    # Write output
    out = {
        "_note": (
            "Forte Circuit stat bonus nodes. Primary source: dotgg.gg API (2026-07-04). "
            "Fallback for characters not yet in dotgg: wutheringlab.com aggregate totals, "
            "decomposed into individual node values using standard tier breakdowns. "
            "8 nodes per character: 2 per non-Forte-Circuit column (lower tier, upper tier). "
            "Values are percentages. Columns: normal_attack, resonance_skill, "
            "resonance_liberation, intro_skill. Array index [0]=lower tier (closer to skill), "
            "[1]=upper tier (further from skill, unlocks after lower). "
            "Mornye and Galbrena use non-standard tier values derived from aggregate totals."
        ),
        "nodes": nodes_by_id,
    }

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print(f"\nWrote {len(nodes_by_id)} characters to {OUT_PATH}")
    if unmatched:
        print(f"Unmatched ({len(unmatched)}):")
        for u in unmatched:
            print(f"  - {u}")


if __name__ == "__main__":
    main()

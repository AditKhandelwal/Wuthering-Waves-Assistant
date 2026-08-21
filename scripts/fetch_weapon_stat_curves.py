"""
Fetch per-weapon base ATK, secondary stat, rank-scaled passive values, and
the two universal level-scaling growth curves, writing
data/weapon_stat_curves.json.

This file previously had NO source script at all in this repo -- it existed
only as already-committed data with no documented way to regenerate it.
That gap went unnoticed until Qingxiao's new signature weapon "Glint of
Clouds" (21020106) needed adding and there was nowhere to fetch it from
(dotgg.gg didn't have it yet either -- too new). Built this script instead
of hand-patching one entry, so the next new weapon doesn't hit the same
wall.

Source: Arikatsu/WutheringWaves_Data (same repo already used for character
stat curves / forte nodes -- see fetch_character_stat_curves.py's docstring
for the dynamic-branch-resolution reasoning, mirrored here unchanged):
  BinData/weapon/weaponconf.json            -- one row per weapon: ItemId,
                                                FirstPropId (base ATK) +
                                                FirstCurve, SecondPropId
                                                (secondary stat) +
                                                SecondCurve, DescParams[0]
                                                (rank 1-5 passive values,
                                                matches weapon_catalog.json's
                                                "{0}" placeholder)
  BinData/property/weaponpropertygrowth.json -- flat (CurveId, Level,
                                                BreachLevel) -> CurveValue
                                                table shared by ALL weapons

Confirmed 2026-08-20: every one of the 122 weapons in weaponconf.json has
FirstCurve=1 and SecondCurve=2 -- i.e. there are only two curve shapes in
the entire game (one for the base-ATK-scaling stat, one for the secondary
stat), not a per-weapon curve choice. This script still reads CurveId
dynamically off the actual rows rather than hardcoding 1/2, in case that
ever stops being universally true. Verified against the already-committed
file before trusting this: baseAtk/secondaryStat/rankValues/atkCurve/
secondaryCurve reproduce byte-identical values for every previously-known
weapon ID (see the verification block in main()).
"""

import json
import sys
import io
import urllib.request

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

REPO = "Arikatsu/WutheringWaves_Data"
OUT_PATH = "data/weapon_stat_curves.json"
FRONTEND_COPY_PATH = "frontend/public/data/weapon_stat_curves.json"
AGENT_COPY_PATH = "supabase/functions/agent/weapon_stat_curves.json"

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

    print("Fetching weaponconf.json...")
    weaponconf = fetch_json(raw_url(branch, "BinData/weapon/weaponconf.json"))
    print(f"  {len(weaponconf)} weapon entries")

    print("Fetching weaponpropertygrowth.json...")
    growth_raw = fetch_json(raw_url(branch, "BinData/property/weaponpropertygrowth.json"))

    base_atk = {}
    secondary_stat = {}
    rank_values = {}
    first_curve_ids = set()
    second_curve_ids = set()

    for w in weaponconf:
        wid = str(w["ItemId"])
        first = w.get("FirstPropId")
        second = w.get("SecondPropId")
        if not first or not second:
            continue
        base_atk[wid] = first["Value"]
        secondary_stat[wid] = {
            "propId": second["Id"],
            "value": second["Value"],
            "isRatio": second["IsRatio"],
        }
        first_curve_ids.add(w["FirstCurve"])
        second_curve_ids.add(w["SecondCurve"])
        desc_params = w.get("DescParams") or []
        if desc_params and desc_params[0].get("ArrayString"):
            rank_values[wid] = desc_params[0]["ArrayString"]

    print(f"  built base ATK + secondary stat for {len(base_atk)} weapons")
    if len(first_curve_ids) > 1 or len(second_curve_ids) > 1:
        print(
            f"  WARNING: expected exactly one FirstCurve id and one SecondCurve id across "
            f"all weapons, found FirstCurve={first_curve_ids} SecondCurve={second_curve_ids} "
            f"-- the 'universal curve pair' assumption this script relies on no longer holds, "
            f"investigate before trusting the output"
        )

    def build_curve(curve_id):
        rows = [row for row in growth_raw if row["CurveId"] == curve_id]
        rows.sort(key=lambda r: (r["Level"], r["BreachLevel"]))
        return [
            {"level": r["Level"], "breachLevel": r["BreachLevel"], "ratio": r["CurveValue"]}
            for r in rows
        ]

    (first_curve_id,) = first_curve_ids
    (second_curve_id,) = second_curve_ids
    atk_curve = build_curve(first_curve_id)
    secondary_curve = build_curve(second_curve_id)
    print(f"  atkCurve: {len(atk_curve)} rows (CurveId={first_curve_id})")
    print(f"  secondaryCurve: {len(secondary_curve)} rows (CurveId={second_curve_id})")

    out = {
        "baseAtk": base_atk,
        "rankValues": rank_values,
        "atkCurve": atk_curve,
        "secondaryStat": secondary_stat,
        "secondaryCurve": secondary_curve,
    }

    # Verify against whatever's already committed before overwriting it --
    # every previously-known weapon ID must reproduce byte-identical values.
    # New IDs (or previously-missing ones, like 21020106) are allowed and
    # reported separately, not treated as a mismatch.
    try:
        with open(OUT_PATH, encoding="utf-8") as f:
            existing = json.load(f)
        mismatches = []
        for wid, val in existing.get("baseAtk", {}).items():
            if wid in base_atk and base_atk[wid] != val:
                mismatches.append(("baseAtk", wid, val, base_atk[wid]))
        for wid, val in existing.get("secondaryStat", {}).items():
            if wid in secondary_stat and secondary_stat[wid] != val:
                mismatches.append(("secondaryStat", wid, val, secondary_stat[wid]))
        for wid, val in existing.get("rankValues", {}).items():
            if wid in rank_values and rank_values[wid] != val:
                mismatches.append(("rankValues", wid, val, rank_values[wid]))
        if existing.get("atkCurve") != atk_curve:
            mismatches.append(("atkCurve", "(whole table)", "...", "..."))
        if existing.get("secondaryCurve") != secondary_curve:
            mismatches.append(("secondaryCurve", "(whole table)", "...", "..."))

        new_weapon_ids = set(base_atk) - set(existing.get("baseAtk", {}))
        print(f"\n  {len(new_weapon_ids)} new weapon id(s) not in the previously-committed file: "
              f"{sorted(new_weapon_ids)}")

        if mismatches:
            print(f"\n  MISMATCH against previously-committed data for {len(mismatches)} field(s) "
                  f"-- NOT overwriting. Investigate before rerunning:")
            for field, wid, old, new in mismatches[:20]:
                print(f"    {field}[{wid}]: committed={old!r} vs fetched={new!r}")
            sys.exit(1)
        print("  verified: every previously-known weapon reproduces identical values")
    except FileNotFoundError:
        print(f"\n  {OUT_PATH} doesn't exist yet -- nothing to verify against, writing fresh")

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    with open(FRONTEND_COPY_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    with open(AGENT_COPY_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print(f"\nWrote {OUT_PATH}, {FRONTEND_COPY_PATH}, {AGENT_COPY_PATH}")


if __name__ == "__main__":
    main()

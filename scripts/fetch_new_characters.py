"""
Fetch full character data for newly-released resonators from Kuro's guide API
and merge them into data/wuwa_characters.json, matching the existing
per-character entry shape (the raw /introduction/info response for that
roleGbId's single "best" guide -- same pipeline that originally built the
54-character file, see .claude/rules/api.md).

Usage: edit NEW_ROLE_IDS below, then `python scripts/fetch_new_characters.py`
from the repo root. Mirrors the merged file to
frontend/public/data/wuwa_characters.json (frontend never reads data/
directly -- see .claude/rules/frontend.md).

New IDs are found by brute-force probing /introduction/list past the known
max in each element block (see api.md's "Re-indexing" note) -- there is no
index endpoint that lists all valid roleGbIds.
"""

import json
import sys
import io
import time
import urllib.request

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

HEADERS = {
    "x-os": "pc",
    "x-language": "en",
    "Referer": "https://wuwaguide.kurogames.com/",
    "Origin": "https://wuwaguide.kurogames.com",
}

CHARS_PATH = "data/wuwa_characters.json"
FRONTEND_COPY_PATH = "frontend/public/data/wuwa_characters.json"

# Qingxiao (1413) -- new resonator, guide id 14131.
NEW_ROLE_IDS = [1413]


def fetch_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def pick_best_guide(entries):
    """Prefer entries with non-empty English guide text; break ties by likeCount."""
    def has_en_content(e):
        en = next((t for t in e.get("texts", []) if t.get("language") == "en"), None)
        return bool(en and en.get("introductionDescription"))

    with_en = [e for e in entries if has_en_content(e)]
    pool = with_en or entries
    return max(pool, key=lambda e: e.get("likeCount", 0))


def fetch_character(role_id):
    listing = fetch_json(f"https://guide-server.aki-game.net/introduction/list?roleGbId={role_id}")
    entries = listing.get("data") or []
    if not entries:
        print(f"  {role_id}: no guide entries, skipping")
        return None

    best = pick_best_guide(entries)
    guide_id = best["id"]

    info = fetch_json(
        f"https://guide-server.aki-game.net/introduction/info?roleGbId={role_id}&id={guide_id}"
    )
    data = info.get("data")
    if not data:
        print(f"  {role_id}: info fetch returned no data")
        return None

    en_name = next(
        (t["name"] for t in data["role"]["texts"] if t["language"] == "en"), "?"
    )
    print(f"  {role_id}: {en_name} (guide id {guide_id}, {best.get('likeCount', 0)} likes)")
    return data


def main():
    with open(CHARS_PATH, encoding="utf-8") as f:
        chars = json.load(f)

    print(f"Loaded {len(chars)} existing characters")
    print(f"Fetching {len(NEW_ROLE_IDS)} new role IDs...")

    added = []
    for role_id in NEW_ROLE_IDS:
        key = str(role_id)
        if key in chars:
            print(f"  {role_id}: already present, skipping")
            continue
        data = fetch_character(role_id)
        if data:
            chars[key] = data
            added.append(key)
        time.sleep(0.3)

    if not added:
        print("Nothing new to write.")
        return

    with open(CHARS_PATH, "w", encoding="utf-8") as f:
        json.dump(chars, f, ensure_ascii=False, indent=2)
    with open(FRONTEND_COPY_PATH, "w", encoding="utf-8") as f:
        json.dump(chars, f, ensure_ascii=False, indent=2)

    print(f"\nAdded {len(added)} characters: {', '.join(added)}")
    print(f"Wrote {CHARS_PATH} and {FRONTEND_COPY_PATH} ({len(chars)} total)")


if __name__ == "__main__":
    main()

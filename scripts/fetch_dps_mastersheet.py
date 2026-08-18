"""
Fetch and parse "Wuthering Waves Calculations Mastersheet by Bittex" -- a
community-maintained Google Sheet with real per-character damage-per-
rotation (DPR) calcs: weapon comparisons, echo/sonata set comparisons, and
resonance chain (sequence) scaling, each as a %-vs-baseline figure.

This is a SECOND, independent data source alongside Kuro's own guide API
(wuwa_characters.json) -- added 2026-08-18 because Kuro's guide gives only
one official recommendation with no numbers behind it, and a real user
question ("why is Moonlit Clouds better than Empyrean Anthem on Zhezhi")
turned out to have no good answer from Kuro's data alone. This sheet has
actual DPR numbers for exactly that kind of question, and can genuinely
disagree with Kuro's pick (confirmed for Zhezhi: Empyrean Anthem is her own
highest-DPR sonata set at 100%, Moonlit Clouds only 79.22%, despite Kuro's
guide recommending Moonlit Clouds) -- letting the agent surface real
tension instead of forcing a single "correct" answer.

Sheet: https://docs.google.com/spreadsheets/d/1sj-LAG94oLUCVoSvFWuO0_y9masHEFy2TFJl5BOoyDk

Access quirk: the normal `/export?format=csv` endpoint 401s even on a
publicly-viewable sheet (Google's cookie/consent wrapper blocks it for an
unauthenticated request). The `/gviz/tq?tqx=out:csv&gid=...` endpoint
works without auth. There is also no API to list a spreadsheet's tabs
without auth/an API key -- tab names+gids are scraped instead from the
`/htmlview` page's embedded `items.push({name, gid, ...})` JS array.

Parsing approach: this sheet is hand-built per character by its author
(Bittex), not machine-generated -- column layout, header text, and section
labels are NOT consistent across tabs (confirmed by comparing Zhezhi's,
Carlotta's, Changli's, and Yinlin's raw CSVs: different column offsets,
side-by-side tables sharing rows, headers sometimes missing entirely).
A rigid "column N is always the weapon name" parser would misparse many
tabs. Instead this scans every row for the CONTENT pattern that's actually
consistent -- a numeric value immediately followed by a percentage cell
(e.g. "352,949.87", "119.65%") -- and takes the nearest non-empty cell to
its left as that entry's name. A best-effort "section" label is tracked
from rows that have no such numeric pair and exactly one substantial text
cell (e.g. "Sonata", "Sequence", "Setup Comparison (Ele + Ele NM Tempest)").
This is deliberately NOT forced into a rigid {weapon,sonata,sequence}
schema -- section labels vary too much (one character's tab literally
contains a section about a DIFFERENT character, "Zhezhi Sonata", inside
Carlotta's own tab) -- so raw (name, value, pctBaseline, section) tuples
are kept close to source rather than reinterpreted.

Coverage: only characters with an authored tab exist in the output --
confirmed 29 of the app's 58 characters as of 2026-08-18 (no Jinhsi,
Camellya, Roccia, etc. yet). get_damage_calcs must say plainly when a
character isn't covered, not guess.

Output: data/dps_mastersheet.json + a copy in supabase/functions/agent/,
keyed by roleGbId -> list of tabs (usually 1, but 2 for characters with
multiple playstyle tabs, e.g. Denia has separate "Fusion Burst" and "Tune
Strain" tabs -- kept as separate entries, not merged).
"""

import csv
import io
import json
import re
import sys
import time
import urllib.request

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

SPREADSHEET_ID = "1sj-LAG94oLUCVoSvFWuO0_y9masHEFy2TFJl5BOoyDk"
CHARS_PATH = "data/wuwa_characters.json"
OUT_PATH = "data/dps_mastersheet.json"
FUNCTION_COPY_PATH = "supabase/functions/agent/dps_mastersheet.json"

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

TAB_ITEM_RE = re.compile(r'items\.push\(\{name: "((?:[^"\\]|\\.)*)".*?gid: "(-?[0-9]+)"')
NUMBER_RE = re.compile(r"^-?[\d,]+(?:\.\d+)?$")
PERCENT_RE = re.compile(r"^-?[\d,]+(?:\.\d+)?%$")


def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def list_tabs():
    html = fetch(f"https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/htmlview")
    tabs = []
    for name, gid in TAB_ITEM_RE.findall(html):
        name = name.encode().decode("unicode_escape").strip()
        if name.lower() == "introduction":
            continue
        tabs.append((name, gid))
    return tabs


def fetch_tab_csv(gid):
    url = f"https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/gviz/tq?tqx=out:csv&gid={gid}"
    text = fetch(url)
    return list(csv.reader(io.StringIO(text)))


def parse_number(cell):
    cell = cell.strip()
    if not NUMBER_RE.match(cell):
        return None
    try:
        return float(cell.replace(",", ""))
    except ValueError:
        return None


def parse_percent(cell):
    cell = cell.strip()
    if not PERCENT_RE.match(cell):
        return None
    try:
        return float(cell.replace(",", "").rstrip("%"))
    except ValueError:
        return None


def parse_rows(rows):
    """Extract (name, value, pctBaseline, section) tuples using the
    number-immediately-followed-by-percent content pattern, since header
    text and column position are not consistent across tabs."""
    entries = []
    section = None
    for row in rows:
        row = [c.strip() for c in row]
        row_entries = []
        for i in range(len(row) - 1):
            value = parse_number(row[i])
            if value is None:
                continue
            pct = parse_percent(row[i + 1])
            if pct is None:
                continue
            # Skip past cells that are themselves numeric/percent-formatted
            # -- e.g. two comparison pairs sitting side by side in the same
            # row ([num1, pct1, num2, pct2]) would otherwise pick up pct1
            # (a real value, not a label) as pct2's "name".
            name = None
            for j in range(i - 1, -1, -1):
                cell = row[j]
                if not cell:
                    continue
                if parse_number(cell) is not None or parse_percent(cell) is not None:
                    continue
                name = cell
                break
            if name:
                row_entries.append((name, value, pct))

        if row_entries:
            for name, value, pct in row_entries:
                entries.append({"name": name, "value": value, "pctBaseline": pct, "section": section})
        else:
            # No numeric data in this row -- if it's a single substantial
            # text cell, treat it as the new section label for subsequent
            # rows (e.g. "Sonata", "Sequence Comparison (Ele + Ele NM Tempest)").
            texts = [c for c in row if c]
            if len(texts) == 1 and len(texts[0]) > 2:
                section = texts[0]
    return entries


def build_name_index(chars):
    index = {}
    for role_id, entry in chars.items():
        name = next((t["name"] for t in entry["role"]["texts"] if t["language"] == "en"), None)
        if name:
            index[name.lower()] = role_id
    return index


def resolve_role_id(tab_name, name_index):
    # Strip a trailing parenthetical archetype/variant label, e.g.
    # "Aemeath (Rupture)" -> "Aemeath", "Denia (Fusion Burst)" -> "Denia".
    base = re.sub(r"\s*\([^)]*\)\s*$", "", tab_name).strip().lower()
    if base in name_index:
        return name_index[base]
    # "Lucy & Rebecca (Cyberpunk)" style duo tabs -- try the first name.
    first = re.split(r"[&,/]", base)[0].strip()
    if first in name_index:
        return name_index[first]
    for name, role_id in name_index.items():
        if base in name or name in base:
            return role_id
    return None


def main():
    with open(CHARS_PATH, encoding="utf-8") as f:
        chars = json.load(f)
    name_index = build_name_index(chars)

    print("Listing tabs...")
    tabs = list_tabs()
    print(f"Found {len(tabs)} character tabs")

    result = {}
    unmatched = []
    for name, gid in tabs:
        rows = fetch_tab_csv(gid)
        entries = parse_rows(rows)
        role_id = resolve_role_id(name, name_index)
        if not role_id:
            unmatched.append(name)
            continue
        result.setdefault(role_id, []).append({"tabName": name, "gid": gid, "entries": entries})
        time.sleep(0.2)

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    with open(FUNCTION_COPY_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)  # no indent -- smaller deploy bundle

    covered = sum(len(v) for v in result.values())
    print(f"Matched {len(result)} characters ({covered} tabs) out of {len(chars)} in {CHARS_PATH}")
    if unmatched:
        print(f"Unmatched tabs (not written -- fix resolve_role_id or check name mismatch): {unmatched}")
    print(f"Wrote {OUT_PATH} and {FUNCTION_COPY_PATH}")


if __name__ == "__main__":
    main()

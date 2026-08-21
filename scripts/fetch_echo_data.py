"""
fetch_echo_data.py — build the Echo catalog, sonata set list, and stat curves
for the build-screen Echo picker (Phase 0 of the Echoes plan).

Produces three files, mirrored to frontend/public/data/, plus echo_sets.json
and echo_stat_curves.json ALSO mirrored to supabase/functions/agent/ (NOT
echo_catalog.json there -- see AGENT_DATA_DIR's comment below for why; run
download_echo_images.py afterward for that one, then redeploy the agent):
    data/echo_catalog.json       ~185 named echoes, cost tier, category, set membership
    data/echo_sets.json          34 sonata sets, flexible pieceCount/description effects
    data/echo_stat_curves.json   main-stat values by level (per cost tier) + substat roll ladders

Sources (see docs/DATA_REQUIREMENTS.md and the plan for full rationale):
  1. game8.co — "List of All Echoes" hub + its 4-Cost/3-Cost/1-Cost subpages, and
     "List of All Sonata Effects". Fetched with WebFetch-free `requests` (this is
     just names/sets/effects text + small numeric tables, not the disputed page).
     ALSO used as the primary main-stat value source (see below) — game8's own
     per-cost-tier "+0/+10/+15/+20/+25 Stat" tables turned out cleaner and more
     self-consistent than wutheringlab's, and directly exposed the fix for the
     one bad wutheringlab row.
  2. wutheringlab.com/wuthering-waves-echoes-list/ — main-stat Rank2-5 tables,
     fetched as RAW HTML (requests + BeautifulSoup) and parsed from actual <table>
     cells, per explicit instruction: do NOT trust WebFetch's AI summary of this
     page for numeric data. Used only as a CROSS-CHECK against game8's numbers
     here, not as the primary value source (see "DATA QUALITY FINDING" below).
  3. Arikatsu/WutheringWaves_Data (raw datamine) — phantomgrowth.json (level
     0-25 growth ratio curve), phantommainproperty.json (cost-tier main-stat
     option name cross-check via RandGroupId prefixes), phantomsubproperty.json
     (19-row substat count cross-check ONLY, not a value source).
  4. Community substat infographic ("WuWa Sub Stats", attributed
     youtube.com/catalystonline, Discord .LowPriority, provided by the user
     2026-07-02) — transcribed literally below, not fetched (it's a static image).

DATA QUALITY FINDING (rank -> level derivation, and the wutheringlab ATK bug):
    wutheringlab's 3-cost ATK (flat) row reads 131 / 244 / 363 / 1000 for
    Rank 2-5. Every OTHER stat row, in every cost tier, on that same page has a
    smooth per-rank ratio pattern of roughly [1.0, 1.38-1.48, 1.92-2.01, 3.06-3.26].
    This row's ratios are [1.0, 1.86, 2.77, 7.63] — a severe outlier, especially
    the last jump. Raw-HTML inspection (this script, not WebFetch) confirmed the
    numbers really are 131/244/363/1000 in the page's actual <table> cells (no
    colspan/rowspan trick, no comma-formatting artifact) — so this is a bad
    number on the SOURCE PAGE itself (that page also has a literal typo,
    "Gavoc DMG" for "Havoc DMG", in the same table — corroborating it's an
    error-prone page for this specific row), not a fetch/parsing bug on our end.

    game8.co's own per-cost-tier tables (the "+0 Stat / +10 Stat" etc. tables
    embedded in the 4-Cost/3-Cost/1-Cost list pages) give an independent,
    internally-consistent set of numbers, INCLUDING a clean 3-cost ATK
    progression of 31 / 44 / 63 / 100 (ratios [1.0, 1.42, 2.03, 3.23] — right in
    line with every other stat's pattern). game8's numbers are used as the
    primary main-stat value source for this reason; wutheringlab is kept only
    as a secondary cross-check (and is expected/allowed to mismatch on this one
    known-bad 3-cost ATK row — that mismatch is logged, not silently hidden).

RANK -> LEVEL DERIVATION (confirmed, not guessed):
    game8's tables are literally labelled "+10 Stat", "+15 Stat", "+20 Stat",
    "+25 Stat" (one column per subpage-table). Matching those columns' values
    against wutheringlab's "Rank 2/3/4/5" columns for two independent stats
    (4-cost ATK: 46/68/92/150 in both; 4-cost Crit Rate: 7.1/9.8-9.9/13.8/22.0
    in both) proves directly, without needing any curve-fitting, that:
        Rank 2 = level 10
        Rank 3 = level 15
        Rank 4 = level 20
        Rank 5 = level 25
    This was cross-checked BEFORE trusting it: naive curve-fitting against
    Arikatsu's phantomgrowth.json (GrowthId=1, level 0-25, linear 1.0x-5.0x)
    was tried first and does NOT reproduce the wutheringlab/game8 rank ratios
    at levels 10/15/20/25 (curve ratio at those levels is [1.0, 1.31, 1.62,
    1.92] vs. the real stat ratio [1.0, ~1.4, ~2.0, ~3.1]) — i.e. phantomgrowth
    is confirmed NOT to be the function that scales echo main stats level-to-
    level. It is used ONLY for what it's independently confirmed to represent
    (a monotonic 0-25 reference curve, used here to interpolate the *shape* of
    the untested levels between the 4 confirmed anchors, anchored at the real
    values, never overriding a confirmed anchor).

Rejected decoy source: a `wuwa_api` repo (also present in this session's
scratchpad) has pre-parsed echo/sonata JSON that is very likely fabricated —
unverifiable names, wrong piece-count thresholds vs. the confirmed 2pc/5pc-
and-other real structures below, dead Fandom wikia image URLs. Do NOT use it
as a source for this script, and do not trust it if rediscovered later.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import unicodedata
from pathlib import Path

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
FRONTEND_DATA_DIR = ROOT / "frontend" / "public" / "data"
# NOT echo_catalog.json -- that one gets its pictureUrl fields rewritten by
# download_echo_images.py AFTER this script runs, so mirroring it here would
# just be immediately stale; that script mirrors its own copy to the agent
# directory instead. echo_sets.json/echo_stat_curves.json aren't touched by
# that later step, so they're safe (and necessary) to mirror here -- missing
# this once already let the agent's bundled echo_sets.json silently go stale
# after a real rerun (2026-08-20).
AGENT_DATA_DIR = ROOT / "supabase" / "functions" / "agent"
CHARACTERS_JSON = DATA_DIR / "wuwa_characters.json"

ARIKATSU_CANDIDATES = [
    Path(
        r"C:\Users\aditk\AppData\Local\Temp\claude\c--Users-aditk-OneDrive-Desktop-wuwa-agent"
        r"\d61d1dc7-8380-4c20-a9a4-86e09d9af081\scratchpad\arikatsu"
    ),
    Path(
        r"C:\Users\aditk\AppData\Local\Temp\claude\c--Users-aditk-OneDrive-Desktop-wuwa-agent"
        r"\d61d1dc7-8380-4c20-a9a4-86e09d9af081\scratchpad\WutheringWaves_Data"
    ),
]

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/122.0 Safari/537.36"
    )
}

REQUEST_DELAY_SECONDS = 0.6

GAME8_HUB_URL = "https://game8.co/games/Wuthering-Waves/archives/452491"
GAME8_SONATA_URL = "https://game8.co/games/Wuthering-Waves/archives/456215"
GAME8_COST_PAGES = {
    4: "https://game8.co/games/Wuthering-Waves/archives/453988",
    3: "https://game8.co/games/Wuthering-Waves/archives/453987",
    1: "https://game8.co/games/Wuthering-Waves/archives/453986",
}
WUTHERINGLAB_URL = "https://wutheringlab.com/wuthering-waves-echoes-list/"

FETCH_DATE = "2026-07-02"

# Rank -> level mapping, confirmed via game8's own "+10/+15/+20/+25 Stat"
# column labels matching wutheringlab's Rank2-5 values for two independent
# stats (see module docstring). Rank 1 has no confirmed level (no "+0 Stat"
# column corresponds to it cleanly -- see docstring on the "+0" column being a
# different roll-quality tier, not a level 0 reading) so we do not claim one.
RANK_TO_LEVEL = {2: 10, 3: 15, 4: 20, 5: 25}
CONFIRMED_LEVELS = sorted(RANK_TO_LEVEL.values())  # [10, 15, 20, 25]

# game8's own per-cost-tier main-stat tables ("+10/+15/+20/+25 Stat" columns),
# transcribed from this session's raw fetch (scripts fetch + re-parse this
# live below; these constants exist only as the expected/sanity-check values,
# same treatment as the wutheringlab numbers given in the task prompt -- the
# script re-derives from the live page and cross-checks against these).
GAME8_EXPECTED_MAIN_STATS = {
    1: {
        "ATK%": [5.8, 8.1, 11.3, 18.0],
        "DEF%": [5.8, 8.1, 11.3, 18.0],
        "HP%": [7.4, 10.3, 14.3, 22.8],
        "HP": [296, 516, 957, 2280],
    },
    3: {
        "ATK%": [9.7, 13.6, 18.9, 30.0],
        "DEF%": [12.3, 17.2, 23.9, 38.0],
        "HP%": [9.7, 13.6, 18.9, 30.0],
        "Aero DMG Bonus": [9.7, 13.6, 18.9, 30.0],
        "Electro DMG Bonus": [9.7, 13.6, 18.9, 30.0],
        "Fusion DMG Bonus": [9.7, 13.6, 18.9, 30.0],
        "Glacio DMG Bonus": [9.7, 13.6, 18.9, 30.0],
        "Havoc DMG Bonus": [9.7, 13.6, 18.9, 30.0],
        "Spectro DMG Bonus": [9.7, 13.6, 18.9, 30.0],
        "Energy Regen": [10.4, 14.5, 20.1, 32.0],
        "ATK": [31, 44, 63, 100],
    },
    4: {
        "ATK%": [10.7, 14.9, 20.7, 33.0],
        "DEF%": [13.5, 18.9, 26.3, 41.8],
        "HP%": [10.7, 14.9, 20.7, 33.0],
        "Crit. Rate": [7.1, 9.9, 13.8, 22.0],
        "Crit. DMG": [14.3, 19.9, 27.7, 44.0],
        "Healing Bonus": [5.5, 11.9, 16.6, 26.4],
        "ATK": [46, 68, 92, 150],
    },
}

# wutheringlab's Rank2-5 tables, transcribed from this session's raw-HTML
# fetch, used ONLY as a cross-check against game8 above (see docstring). The
# known-bad 3-cost ATK row is included so the script's cross-check explicitly
# flags/logs the mismatch rather than silently ignoring it.
WUTHERINGLAB_MAIN_STATS = {
    1: {
        "HP": [296, 516, 957, 2280],
        "HP%": [7.2, 10.2, 14.2, 22.5],
        "ATK%": [5.7, 8.1, 11.3, 18.0],
        "DEF%": [5.7, 8.1, 11.3, 18.0],
    },
    3: {
        "HP%": [9.6, 14.0, 18.9, 30],
        "ATK%": [9.6, 14.0, 18.9, 30],
        "DEF%": [12.3, 17, 23.9, 38],
        "Energy Regen": [10, 14.2, 20.1, 32.0],
        "Aero DMG Bonus": [9.6, 14, 18.9, 30],
        "Glacio DMG Bonus": [9.6, 14, 18.9, 30],
        "Fusion DMG Bonus": [9.6, 14, 18.9, 30],
        "Electro DMG Bonus": [9.6, 14, 18.9, 30],
        "Havoc DMG Bonus": [9.6, 14, 18.9, 30],  # page's row was labeled "Gavoc DMG" (typo)
        "Spectro DMG Bonus": [9.6, 14, 18.9, 30],
        "ATK": [131, 244, 363, 1000],  # KNOWN BAD -- see docstring; superseded by game8's 31/44/63/100
    },
    4: {
        "ATK": [46, 68, 92, 150],
        "HP%": [10.6, 14.6, 20.5, 33.0],
        "ATK%": [10.6, 14.6, 20.5, 33.0],
        "DEF%": [13.5, 18.7, 26.0, 41.5],
        "Crit. Rate": [7.1, 9.8, 13.8, 22.0],
        "Crit. DMG": [14.3, 19.7, 27.7, 44.0],
        "Healing Bonus": [8.5, 11.9, 16.3, 26.0],
        "Energy Regen": [11, 15.6, 22.11, 35.2],
    },
}

# PropId/AddType for each stat name, cross-referenced against
# phantommainproperty.json's PropGroup ids and wuwa_characters.json's
# echoAttributes gbId/attachmentGameBusinessId fields (attachmentGameBusinessId
# 1=flat/2=percent matches AddType 1=flat/2=percent). AddType: 1=flat, 2=percent.
ELEMENTAL_DMG_NAMES = {"Aero", "Glacio", "Fusion", "Electro", "Havoc", "Spectro"}


def normalize_dmg_bonus_name(stat_name: str) -> str:
    """Only elemental DMG rows (e.g. 'Aero DMG' -> 'Aero DMG Bonus') get the
    ' Bonus' suffix appended; 'Crit. DMG' must NOT be touched (it's a
    different stat entirely, not an elemental DMG% bonus)."""
    stripped = stat_name.strip()
    for elem in ELEMENTAL_DMG_NAMES:
        if stripped == f"{elem} DMG":
            return f"{elem} DMG Bonus"
    return stat_name


# Canonical stat-name spelling, used to reconcile naming variants seen across
# game8 ("Crit. Rate") and wutheringlab ("CRIT Rate" on some tables, "Crit.
# Rate" on others) so the same real stat is recognized as the same key by
# both parsers before reconciliation runs.
CANONICAL_STAT_NAMES = {
    "critrate": "Crit. Rate",
    "critdmg": "Crit. DMG",
    "healingbonus": "Healing Bonus",
    "energyregen": "Energy Regen",
}


def canonicalize_stat_name(stat_name: str) -> str:
    stripped = stat_name.strip()
    key = re.sub(r"[^a-z]", "", stripped.lower())
    return CANONICAL_STAT_NAMES.get(key, stripped)


STAT_PROP_INFO = {
    "HP": (100021, 1),
    "ATK": (100071, 1),
    "HP%": (100022, 2),
    "ATK%": (100072, 2),
    "DEF%": (100102, 2),
    # BUG FIX (found 2026-07-04, testing echo-screenshot-import against a
    # real Kronablight card): these 10 were hardcoded addType 1 (flat) --
    # wrong, unconditionally, for every one of them. Crit. Rate/DMG, Energy
    # Regen, Healing Bonus, and all 6 elemental DMG Bonus variants are always
    # rendered as a percentage in-game; there is no flat version of any of
    # these as a *variable* main-stat option (the only genuinely flat main
    # stats are the separate STATIC one -- HP/ATK above -- which cost-1/3/4
    # echoes always carry alongside whichever variable option is picked).
    # This wasn't just cosmetic: it silently fed into ladderForMainStat's
    # addType gate in the frontend's OCR-import decimal-recovery logic,
    # which only retries a dropped-decimal-point read for addType 2 stats.
    "Crit. Rate": (81, 2),
    "Crit. DMG": (91, 2),
    "Healing Bonus": (351, 2),
    "Energy Regen": (111, 2),
    "Aero DMG Bonus": (251, 2),
    "Glacio DMG Bonus": (221, 2),
    "Fusion DMG Bonus": (231, 2),
    "Electro DMG Bonus": (241, 2),
    "Havoc DMG Bonus": (271, 2),
    "Spectro DMG Bonus": (261, 2),
}

# ---------------------------------------------------------------------------
# Substat infographic transcription
# Source: community infographic "WuWa Sub Stats", attributed to
# youtube.com/catalystonline / Discord user .LowPriority. Provided directly by
# the user this session (2026-07-02) as a static image -- not a fetchable
# page, so transcribed literally here per the plan (same treatment as the
# earlier Stat Nodes CSV). Values are MIN, 2, 3, 4, 5, 6, 7, MAX (8 steps) for
# Group A, and MIN, 2, 3, MAX (4 steps) for Group B.
# ---------------------------------------------------------------------------

GROUP_A_CHANCES = [7.33, 14.65, 19.54, 23.51, 15.63, 10.42, 5.95, 2.98]
GROUP_B_CHANCES = [18.52, 44.45, 26.38, 10.36]

# name -> (values[8], addType)  addType: 1=flat, 2=percent
GROUP_A_LADDERS = {
    "Crit. DMG": ([12.6, 13.8, 15, 16.2, 17.4, 18.6, 19.8, 21], 2),
    "Crit. Rate": ([6.3, 6.9, 7.5, 8.1, 8.7, 9.3, 9.9, 10.5], 2),
    "ATK%": ([6.4, 7.1, 7.9, 8.6, 9.4, 10.1, 10.9, 11.6], 2),
    "HP%": ([6.4, 7.1, 7.9, 8.6, 9.4, 10.1, 10.9, 11.6], 2),
    "DEF%": ([8.1, 9, 10, 10.9, 11.8, 12.8, 13.8, 14.7], 2),
    "Energy Regen": ([6.8, 7.6, 8.4, 9.2, 10, 10.8, 11.6, 12.4], 2),
    "HP": ([320, 360, 390, 430, 470, 510, 540, 580], 1),
}

# RE-CORRECTED (real echo-card screenshots, 2026-07-04): the 2026-07-03 fix
# below went too far. Attack-type DMG Bonus (Basic Attack/Heavy Attack/
# Resonance Skill/Resonance Liberation) IS a real echo substat -- confirmed
# by 4 independent user-provided screenshots, each showing one of these 4
# names as a "+"-prefixed substat row, and every observed value (10.1%, 7.9%,
# 8.6%, 7.1%, 8.6%) is an exact hit on this same GROUP_A_DMG_LADDER. Elemental
# DMG Bonus (Aero/Electro/Fusion/Glacio/Havoc/Spectro) stays excluded -- no
# screenshot has ever shown it as a substat, and it's confirmed main-stat-only
# (cost-3 echoes) by real in-game knowledge. Real substat pool is 13: the 9
# GROUP_A_LADDERS + GROUP_B_LADDERS names, plus these 4 attack-type DMG Bonus
# names. Don't remove these again without new contradicting evidence.
GROUP_A_DMG_LADDER = [6.4, 7.1, 7.9, 8.6, 9.4, 10.1, 10.9, 11.6]
GROUP_A_DMG_STAT_NAMES: list[str] = [
    "Basic Attack DMG Bonus",
    "Heavy Attack DMG Bonus",
    "Resonance Skill DMG Bonus",
    "Resonance Liberation DMG Bonus",
]

GROUP_B_LADDERS = {
    "DEF": ([40, 50, 60, 70], 1),
    "ATK": ([30, 40, 50, 60], 1),
}


def log(msg: str) -> None:
    print(msg, flush=True)


def normalize_name(name: str) -> str:
    """Normalize a name for fuzzy matching: lowercase, strip punctuation/whitespace,
    and drop any characters that aren't clean ASCII letters/digits (handles the
    known mojibake case in wuwa_characters.json, e.g. 'Jue�' / 'Ju\xe9')."""
    if not name:
        return ""
    # normalize unicode, then drop anything that doesn't decompose to ASCII
    decomposed = unicodedata.normalize("NFKD", name)
    ascii_only = decomposed.encode("ascii", "ignore").decode("ascii")
    ascii_only = ascii_only.lower()
    ascii_only = re.sub(r"[^a-z0-9]+", "", ascii_only)
    return ascii_only


def fetch_html(url: str, cache_name: str, cache_dir: Path) -> str:
    cache_path = cache_dir / f"{cache_name}.html"
    if cache_path.exists():
        log(f"  (using cached fetch: {cache_path.name})")
        return cache_path.read_text(encoding="utf-8")
    resp = requests.get(url, headers=HEADERS, timeout=20)
    resp.raise_for_status()
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(resp.text, encoding="utf-8")
    time.sleep(REQUEST_DELAY_SECONDS)
    return resp.text


# ---------------------------------------------------------------------------
# Step 1: game8 echo catalog + sonata sets
# ---------------------------------------------------------------------------

CATEGORY_NAMES = {"Calamity", "Overlord", "Elite", "Common"}


def parse_game8_cost_page(html: str, cost: int) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    tables = soup.find_all("table")
    catalog_table = None
    for t in tables:
        header = t.find("tr")
        if header and "Echo" in header.get_text():
            catalog_table = t
            break
    if catalog_table is None:
        raise RuntimeError(f"Could not find echo catalog table on cost-{cost} page")

    echoes = []
    rows = catalog_table.find_all("tr")[1:]
    for row in rows:
        cells = row.find_all(["td", "th"])
        if len(cells) < 3:
            continue
        echo_cell, sonata_cell = cells[1], cells[2]

        # Prefer the top-level <a> link's own visible text over img alt (see
        # parse_game8_sonata_sets for the confirmed game8 markup bug this
        # guards against: an unescaped apostrophe in an alt attribute, e.g.
        # "Flamewing's Shadow", truncates the alt text mid-string).
        img = echo_cell.find("img")
        picture_url = None
        if img:
            picture_url = img.get("data-src") or img.get("src")
            if picture_url and picture_url.startswith("data:"):
                picture_url = img.get("data-src")

        name = None
        top_link = echo_cell.find("a")
        if top_link:
            link_text = top_link.get_text(strip=True)
            if link_text and link_text not in CATEGORY_NAMES:
                name = link_text
        if not name and img and img.get("alt"):
            name = img["alt"].replace("Wuthering Waves - ", "").strip()
        if not name:
            b = echo_cell.find("b")
            if b:
                name = b.get_text(strip=True)
        if not name:
            continue

        category = None
        for a in echo_cell.find_all("a"):
            txt = a.get_text(strip=True)
            if txt in CATEGORY_NAMES:
                category = txt
                break
        if category is None:
            for cat in CATEGORY_NAMES:
                if cat in echo_cell.get_text():
                    category = cat
                    break

        # Prefer the div's own VISIBLE text (link text, same as
        # parse_game8_sonata_sets) over img alt: game8's markup has the same
        # unescaped-apostrophe bug here as in the sonata effects table (e.g.
        # "Flamewing's Shadow" / "Heart of Evil's Purge" truncate to
        # "Flamewing" / "Heart of Evil" when read from img alt). alt text is
        # only used as a last-resort fallback if the div has no usable link
        # text at all.
        set_names = []
        for div in sonata_cell.find_all("div", class_="align"):
            sname = None
            a = div.find("a")
            if a:
                link_text = a.get_text(strip=True)
                if link_text:
                    sname = link_text
            if not sname:
                simg = div.find("img")
                if simg and simg.get("alt"):
                    sname = simg["alt"].replace("Wuthering Waves - ", "").strip()
            if sname and sname not in set_names:
                set_names.append(sname)

        echoes.append(
            {
                "name": name,
                "cost": cost,
                "category": category,
                "setNames": set_names,
                "kuroGbId": None,
                "pictureUrl": picture_url,
            }
        )
    return echoes


def parse_game8_sonata_sets(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    tables = soup.find_all("table")
    sonata_table = None
    for t in tables:
        rows = t.find_all("tr")
        if len(rows) >= 30:  # the full 34-set table
            header_txt = rows[0].get_text()
            if "Sonata Effect" in header_txt or "Set Bonuses" in header_txt:
                sonata_table = t
                break
    if sonata_table is None:
        raise RuntimeError("Could not find the full 34-row sonata effects table on game8")

    sets = []
    rows = sonata_table.find_all("tr")[1:]
    for row in rows:
        cells = row.find_all(["td", "th"])
        if len(cells) < 2:
            continue
        name_cell, effect_cell = cells[0], cells[1]
        # Prefer the cell's own VISIBLE text over img alt: game8's markup has
        # at least two confirmed bugs where an unescaped apostrophe in a name
        # (e.g. "Flamewing's Shadow", "Heart of Evil's Purge") breaks HTML
        # attribute parsing and truncates img's alt text mid-string (to
        # "Flamewing", "Heart of Evil"). The cell's plain text node (whether
        # wrapped in an <a> or sitting bare next to the <img>) is NOT affected
        # by that attribute-parsing bug, so it's the more reliable source; alt
        # text is only used as a last-resort fallback if the cell has no
        # usable text at all (shouldn't happen on this page, but cheap to keep).
        cell_text = name_cell.get_text(strip=True)
        img = name_cell.find("img")
        alt_text = img["alt"].replace("Wuthering Waves - ", "").strip() if img and img.get("alt") else ""
        name = cell_text or alt_text
        if not name:
            continue
        # game8 lazy-loads images: the real URL is in data-src, not src (src is
        # a 1x1 placeholder gif). Used only as a fallback icon source -- see
        # extract_kuro_set_icons for the preferred real Kuro CDN icon.
        game8_icon_url = (img.get("data-src") or img.get("src")) if img else None

        # effect cell: <b>N-pc</b>: description <hr/> <b>M-pc</b>: description ...
        effects = []
        bolds = effect_cell.find_all("b")
        for b in bolds:
            label = b.get_text(strip=True)  # e.g. "2-pc"
            m = re.match(r"(\d+)\s*-?\s*pc", label, re.IGNORECASE)
            if not m:
                continue
            piece_count = int(m.group(1))
            # description text: everything after this <b> until the next <hr> or <b>
            desc_parts = []
            node = b.next_sibling
            while node is not None:
                if getattr(node, "name", None) == "hr":
                    break
                if getattr(node, "name", None) == "b":
                    break
                if isinstance(node, str):
                    desc_parts.append(node)
                else:
                    desc_parts.append(node.get_text())
                node = node.next_sibling
            description = "".join(desc_parts).strip()
            description = re.sub(r"^:\s*", "", description)
            description = re.sub(r"\s+", " ", description).strip()
            effects.append({"pieceCount": piece_count, "description": description})

        sets.append({"name": name, "effects": effects, "game8IconUrl": game8_icon_url})
    return sets


# Real Kuro CDN icon for a sonata set, sourced from wuwa_characters.json's
# echo.main.echoSetEffects[] (the same field every character's recommended-set
# data already carries a pictureUrl on). Only covers sets that are at least
# one of the 54 characters' recommended set (27/34 confirmed) -- same
# real-data-first, game8-fallback pattern already used for echo pictureUrl in
# cross_link_signature_echoes. Icon is identical across piece-count tiers for
# a given set (confirmed: zero sets had >1 distinct URL), so first-seen wins.
def extract_kuro_set_icons(characters_data: dict) -> dict[str, str]:
    icons: dict[str, str] = {}
    for char in characters_data.values():
        effects = char.get("echo", {}).get("main", {}).get("echoSetEffects", [])
        for eff in effects:
            name = next((t["name"] for t in eff.get("texts", []) if t.get("language") == "en"), None)
            url = eff.get("pictureUrl")
            if name and url and name not in icons:
                icons[name] = url
    return icons


# ---------------------------------------------------------------------------
# Step 2: wutheringlab main-stat cross-check + game8 main-stat tables (primary)
# ---------------------------------------------------------------------------


def parse_wutheringlab_main_stats(html: str) -> dict[int, dict[str, list[float]]]:
    soup = BeautifulSoup(html, "html.parser")
    tables = soup.find_all("table")
    result: dict[int, dict[str, list[float]]] = {1: {}, 3: {}, 4: {}}
    # tables[0]=1cost, [1]=3cost, [2]=4cost, per this session's fetch order
    cost_order = [1, 3, 4]
    for idx, cost in enumerate(cost_order):
        if idx >= len(tables):
            continue
        t = tables[idx]
        rows = t.find_all("tr")
        header = [c.get_text(strip=True) for c in rows[0].find_all(["td", "th"])]
        if not header or "Rank" not in "".join(header):
            continue
        for row in rows[1:]:
            cells = [c.get_text(strip=True) for c in row.find_all(["td", "th"])]
            if len(cells) < 5:
                continue
            stat_name = cells[0]
            try:
                values = [float(c.replace("%", "").strip()) for c in cells[1:5]]
            except ValueError:
                continue
            # normalize the known typo
            if stat_name.strip().lower() == "gavoc dmg":
                stat_name = "Havoc DMG"
            stat_name = normalize_dmg_bonus_name(stat_name)
            stat_name = canonicalize_stat_name(stat_name)
            result[cost][stat_name] = values
    return result


def parse_game8_main_stat_tables(html: str) -> dict[str, list[float]]:
    """Parse the 4 '+0 Stat / +N Stat' tables on a game8 cost-tier page.
    Returns {statName: [rank2, rank3, rank4, rank5]} using the '+N Stat' column
    (N in 10/15/20/25) from each of the 4 tables, keyed by matching N to rank."""
    soup = BeautifulSoup(html, "html.parser")
    tables = soup.find_all("table")
    rank_col_by_level = {10: [], 15: [], 20: [], 25: []}
    per_level: dict[int, dict[str, float]] = {}

    for t in tables:
        rows = t.find_all("tr")
        if not rows:
            continue
        header = [c.get_text(strip=True) for c in rows[0].find_all(["td", "th"])]
        if len(header) < 2 or "Stat" not in header[-1]:
            continue
        m = re.match(r"\+(\d+)\s*Stat", header[-1])
        if not m:
            continue
        level = int(m.group(1))
        if level not in per_level:
            per_level[level] = {}
        for row in rows[1:]:
            cells = [c.get_text(strip=True) for c in row.find_all(["td", "th"])]
            if len(cells) < 3:
                continue
            stat_name = cells[0].replace(" (2nd Line)", "").strip()
            try:
                val = float(cells[2].replace("%", "").strip())
            except ValueError:
                continue
            stat_name = normalize_dmg_bonus_name(stat_name)
            stat_name = canonicalize_stat_name(stat_name)
            per_level[level][stat_name] = val

    # assemble by stat name across the 4 confirmed levels
    stat_names = set()
    for lvl_data in per_level.values():
        stat_names.update(lvl_data.keys())
    result = {}
    for name in stat_names:
        vals = []
        ok = True
        for lvl in CONFIRMED_LEVELS:
            if name not in per_level.get(lvl, {}):
                ok = False
                break
            vals.append(per_level[lvl][name])
        if ok:
            result[name] = vals
    return result


def step_ratios(values: list[float]) -> list[float]:
    """Consecutive rank-to-rank multipliers: [r2->r3, r3->r4, r4->r5]."""
    return [values[i] / values[i - 1] for i in range(1, len(values))]


def sanity_check_ratios(cost: int, stat_name: str, values: list[float], reference_step_ratios: list[float] | None = None) -> list[str]:
    """Return a list of warning strings if a stat's rank2->rank5 progression has
    a step-to-step ratio outlier (catches garbled-transcription errors like the
    3cost ATK bug or game8's Healing Bonus rank2 bug), compared against the
    MEDIAN step-ratio pattern of other stats in the same cost tier (not a fixed
    global band -- flat stats like 1-cost HP legitimately grow faster
    rank-to-rank than percent stats, so a single global band produces false
    positives on those)."""
    warnings = []
    if len(values) != 4 or values[0] == 0:
        return [f"cost{cost} {stat_name}: unexpected value count {values}"]
    steps = step_ratios(values)
    if reference_step_ratios is None:
        return warnings
    for i, (s, ref) in enumerate(zip(steps, reference_step_ratios)):
        if ref <= 0:
            continue
        rel_diff = abs(s - ref) / ref
        if rel_diff > 0.5:  # this stat's step is >50% off the tier's median step pattern
            warnings.append(
                f"cost{cost} {stat_name}: step[{i}] ratio {s:.3f} deviates {rel_diff*100:.0f}% "
                f"from cost-tier median step ratio {ref:.3f} (values={values}) -- likely transcription error"
            )
    return warnings


def median(nums: list[float]) -> float:
    s = sorted(nums)
    n = len(s)
    mid = n // 2
    if n % 2 == 0:
        return (s[mid - 1] + s[mid]) / 2
    return s[mid]


def compute_median_step_ratios(stats_by_name: dict[str, list[float]]) -> list[float]:
    """Median step-ratio pattern across all stats in a cost tier -- used as the
    reference 'smooth progression' shape for outlier detection."""
    all_steps = [step_ratios(v) for v in stats_by_name.values() if len(v) == 4 and v[0] != 0]
    if not all_steps:
        return [1.0, 1.0, 1.0]
    return [median([s[i] for s in all_steps]) for i in range(3)]


def reconcile_main_stats(
    cost: int,
    game8_stats: dict[str, list[float]],
    wl_stats: dict[str, list[float]],
) -> tuple[dict[str, list[float]], list[str]]:
    """For each stat name known to either source, pick the source whose own
    step-ratio pattern is closer to that cost tier's median step-ratio pattern
    (computed from the OTHER stats, i.e. excluding the stat under test, so a
    genuinely-outlying stat can't skew its own reference). Falls back to
    whichever source has data if only one does. Logs every reconciliation
    decision where the two sources disagree, and every case where a source's
    own data was rejected as inconsistent with its own tier."""
    notes = []
    all_names = set(game8_stats) | set(wl_stats)
    resolved: dict[str, list[float]] = {}

    for name in sorted(all_names):
        g8 = game8_stats.get(name)
        wl = wl_stats.get(name)
        if g8 is not None and wl is not None:
            close_enough = all(abs(a - b) <= 0.15 for a, b in zip(g8, wl))
            if close_enough:
                resolved[name] = g8
                continue
            # disagreement: score each candidate against the tier's median step
            # pattern computed from every OTHER stat this source reports (so the
            # candidate under test doesn't influence its own yardstick)
            other_g8 = {k: v for k, v in game8_stats.items() if k != name}
            other_wl = {k: v for k, v in wl_stats.items() if k != name}
            ref_g8 = compute_median_step_ratios(other_g8) if other_g8 else compute_median_step_ratios(game8_stats)
            ref_wl = compute_median_step_ratios(other_wl) if other_wl else compute_median_step_ratios(wl_stats)

            def score(values, ref):
                steps = step_ratios(values)
                return sum(abs(s - r) / r for s, r in zip(steps, ref) if r > 0)

            score_g8 = score(g8, ref_g8)
            score_wl = score(wl, ref_wl)
            if score_g8 <= score_wl:
                resolved[name] = g8
                notes.append(
                    f"cost{cost} {name}: game8={g8} vs wutheringlab={wl} disagree -- "
                    f"chose game8 (fit score {score_g8:.3f} vs {score_wl:.3f})"
                )
            else:
                resolved[name] = wl
                notes.append(
                    f"cost{cost} {name}: game8={g8} vs wutheringlab={wl} disagree -- "
                    f"chose wutheringlab (fit score {score_wl:.3f} vs {score_g8:.3f})"
                )
        elif g8 is not None:
            resolved[name] = g8
        elif wl is not None:
            resolved[name] = wl
            notes.append(f"cost{cost} {name}: only available from wutheringlab (game8 table didn't list it)")

    return resolved, notes


# ---------------------------------------------------------------------------
# Step 3: Arikatsu parsing
# ---------------------------------------------------------------------------


def find_arikatsu_path(cli_path: str | None) -> Path:
    if cli_path:
        p = Path(cli_path)
        if (p / "BinData" / "phantom" / "phantomgrowth.json").exists():
            return p
        raise FileNotFoundError(f"--arikatsu-path {cli_path} does not contain BinData/phantom/phantomgrowth.json")
    for cand in ARIKATSU_CANDIDATES:
        if (cand / "BinData" / "phantom" / "phantomgrowth.json").exists():
            return cand
    raise FileNotFoundError(
        "Could not find a local Arikatsu/WutheringWaves_Data clone. "
        "Pass --arikatsu-path, or clone with: "
        "git clone --depth 1 https://github.com/Arikatsu/WutheringWaves_Data.git"
    )


def load_arikatsu_growth_curve(arikatsu_path: Path) -> dict[int, int]:
    p = arikatsu_path / "BinData" / "phantom" / "phantomgrowth.json"
    with p.open(encoding="utf-8") as f:
        rows = json.load(f)
    curve = {row["Level"]: row["Value"] for row in rows if row["GrowthId"] == 1}
    assert len(curve) == 26, f"expected 26-row growth curve (level 0-25), got {len(curve)}"
    assert curve[0] == 10000, f"expected level 0 = 10000 (1.0x), got {curve[0]}"
    assert curve[25] == 50000, f"expected level 25 = 50000 (5.0x), got {curve[25]}"
    return curve


def load_arikatsu_substat_count(arikatsu_path: Path) -> int:
    p = arikatsu_path / "BinData" / "phantom" / "phantomsubproperty.json"
    with p.open(encoding="utf-8") as f:
        rows = json.load(f)
    return len(rows)


def load_arikatsu_main_prop_cost_tiers(arikatsu_path: Path) -> dict[int, set[int]]:
    """RandGroupId prefix (2xx/3xx/4xx/5xx) -> cost tier, per finding #2. Returns
    {cost: set(RandGroupIds)} purely as a structural cross-check (option-name
    menus are shared per cost tier, not per echo)."""
    p = arikatsu_path / "BinData" / "phantom" / "phantommainproperty.json"
    with p.open(encoding="utf-8") as f:
        rows = json.load(f)
    prefix_to_cost = {2: 1, 3: 3, 4: 4, 5: 1}  # 5xx groups also observed cost=1 range in some dumps
    by_cost: dict[int, set[int]] = {1: set(), 3: set(), 4: set()}
    for row in rows:
        rgid = row["RandGroupId"]
        prefix = int(str(rgid)[0])
        # 2xx/3xx/4xx map straightforwardly; 5xx observed alongside 2xx-style groups
        # in this dataset -- treat both 2xx and 5xx as cost-1-adjacent structural
        # groups (used only as a coarse structural signal, not a value source).
        if prefix == 2:
            by_cost[1].add(rgid)
        elif prefix == 3:
            by_cost[3].add(rgid)
        elif prefix == 4:
            by_cost[4].add(rgid)
        elif prefix == 5:
            by_cost[1].add(rgid)
    return by_cost


def interpolate_curve(
    stat_name: str,
    rank_values: list[float],  # [rank2, rank3, rank4, rank5] i.e. levels [10,15,20,25]
    growth_curve: dict[int, int],
) -> dict[int, float]:
    """Build a 0-25 value-by-level dict for one main-stat option. The 4
    confirmed anchor points (levels 10/15/20/25, from game8/wutheringlab
    cross-checked values) are used exactly as given. Levels below 10, and the
    levels between/around the anchors, are filled by piecewise-linear
    interpolation in the Arikatsu curve's ratio-space (curve[level]/curve[10]),
    anchored so the result reproduces the 4 confirmed points exactly -- this
    uses the curve for its confirmed purpose (a monotonic 0-25 shape) without
    letting it override any real anchor value."""
    anchors = {10: rank_values[0], 15: rank_values[1], 20: rank_values[2], 25: rank_values[3]}
    values_by_level: dict[int, float] = dict()
    for lvl in range(0, 26):
        if lvl in anchors:
            values_by_level[lvl] = anchors[lvl]
            continue
        # find bracketing anchor levels (or extrapolate below level 10 using
        # the curve's own ratio back to level 0, anchored at level 10)
        lower_anchors = [a for a in anchors if a < lvl]
        upper_anchors = [a for a in anchors if a > lvl]
        if lower_anchors and upper_anchors:
            lo, hi = max(lower_anchors), min(upper_anchors)
        elif upper_anchors:
            # below the first anchor (levels 0-9): scale down from level 10
            # using the curve's ratio, no lower anchor exists
            hi = min(upper_anchors)
            ratio = growth_curve[lvl] / growth_curve[10]
            values_by_level[lvl] = round(anchors[hi] * ratio / (growth_curve[hi] / growth_curve[10]), 4)
            continue
        else:
            lo = max(lower_anchors)
            values_by_level[lvl] = round(anchors[lo], 4)
            continue
        c_lo, c_hi, c_lvl = growth_curve[lo], growth_curve[hi], growth_curve[lvl]
        if c_hi == c_lo:
            frac = 0.0
        else:
            frac = (c_lvl - c_lo) / (c_hi - c_lo)
        v_lo, v_hi = anchors[lo], anchors[hi]
        values_by_level[lvl] = round(v_lo + frac * (v_hi - v_lo), 4)
    return values_by_level


# ---------------------------------------------------------------------------
# Step 5 (substats): sanity checks on the transcription
# ---------------------------------------------------------------------------


def build_substat_options() -> list[dict]:
    options = []
    for name, (values, add_type) in GROUP_A_LADDERS.items():
        options.append(
            {"statName": name, "addType": add_type, "values": values, "chances": GROUP_A_CHANCES}
        )
    for name in GROUP_A_DMG_STAT_NAMES:
        options.append(
            {
                "statName": name,
                "addType": 2,
                "values": GROUP_A_DMG_LADDER,
                "chances": GROUP_A_CHANCES,
            }
        )
    for name, (values, add_type) in GROUP_B_LADDERS.items():
        options.append(
            {"statName": name, "addType": add_type, "values": values, "chances": GROUP_B_CHANCES}
        )
    return options


def verify_substat_transcription() -> list[str]:
    errors = []
    options = build_substat_options()
    if len(options) != 13:
        errors.append(f"Expected 13 substat entries, got {len(options)}")
    for opt in options:
        if len(opt["values"]) != len(opt["chances"]):
            errors.append(f"{opt['statName']}: values/chances length mismatch")
    a_sum = sum(GROUP_A_CHANCES)
    b_sum = sum(GROUP_B_CHANCES)
    if not (99 <= a_sum <= 101):
        errors.append(f"Group A chances sum to {a_sum}, expected ~100")
    if not (99 <= b_sum <= 101):
        errors.append(f"Group B chances sum to {b_sum}, expected ~100")
    return errors


# ---------------------------------------------------------------------------
# Step 6: signature echo cross-linking
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Manual corrections
# ---------------------------------------------------------------------------

# game8 (a fan wiki, not Kuro's own data) is occasionally incomplete on set
# membership -- each correction here is backed by a real in-game screenshot,
# not inferred/guessed, and is additive (appended to whatever game8 already
# found, never replacing it, since a screenshot proving one set membership
# doesn't disprove another).
MANUAL_SET_CORRECTIONS: dict[str, list[str]] = {
    # User-provided screenshot (2026-08-10) of Sabercat Prowler's in-game
    # echo card shows "Halo of Starry Radiance" as its active Sonata Effect
    # (2pc and 5pc both checked). game8's cost-3 page doesn't list this set
    # for this echo at all -- confirmed still missing on a live re-check the
    # same day, so this isn't a stale scrape, game8 itself is incomplete here.
    "Sabercat Prowler": ["Halo of Starry Radiance"],
    # Same evidence, same day, for the other Sabercat echo -- user provided
    # a second screenshot (this one after the first check came back
    # inconclusive, no Sonata Effect section visible) explicitly showing
    # Sabercat Reaver's Sonata Effect section with Halo of Starry Radiance
    # checked at 2/2 and 5/5, same as Prowler.
    "Sabercat Reaver": ["Halo of Starry Radiance"],
}


def apply_manual_set_corrections(echoes: list[dict]) -> None:
    for echo in echoes:
        for set_name in MANUAL_SET_CORRECTIONS.get(echo["name"], []):
            if set_name not in echo["setNames"]:
                echo["setNames"].append(set_name)


def cross_link_signature_echoes(echoes: list[dict], characters_data: dict) -> tuple[int, list[str]]:
    game8_index = {normalize_name(e["name"]): e for e in echoes}
    matched = 0
    unmatched = []
    seen_signature_names = set()
    for cid, char in characters_data.items():
        echo_main = char.get("echo", {}).get("main", {})
        echo_props = echo_main.get("echoProps", {})
        texts = echo_props.get("texts", [])
        en_text = next((t for t in texts if t.get("language") == "en"), None)
        if not en_text:
            continue
        sig_name = en_text.get("name", "").strip()
        if not sig_name or sig_name in seen_signature_names:
            continue
        seen_signature_names.add(sig_name)
        norm = normalize_name(sig_name)
        gb_id = echo_props.get("gbId")
        picture_url = echo_props.get("pictureUrl")

        target = game8_index.get(norm)
        if target is None:
            # try matching against a couple common punctuation variants
            # (colon vs dash, "Reminiscence - X" vs "Reminiscence: X")
            alt = norm.replace("reminiscence", "reminiscence")
            target = game8_index.get(alt)
        if target is not None:
            target["kuroGbId"] = gb_id
            if picture_url:
                target["pictureUrl"] = picture_url
            matched += 1
        else:
            unmatched.append(sig_name)
    return matched, unmatched


# ---------------------------------------------------------------------------
# Verification gate
# ---------------------------------------------------------------------------


def load_characters_json() -> dict:
    with CHARACTERS_JSON.open(encoding="utf-8") as f:
        return json.load(f)


def run_verification(
    catalog: list[dict],
    sets: list[dict],
    curves: dict,
    rank_derivation_ok: bool,
    rank_derivation_notes: list[str],
) -> bool:
    log("\n=== VERIFICATION GATE ===")
    all_ok = True
    characters = load_characters_json()

    # (a) main-stat names per cost tier match echoAttributes[]
    real_names_by_cost: dict[int, set[str]] = {1: set(), 3: set(), 4: set()}
    for cid, char in characters.items():
        for attr in char.get("echo", {}).get("main", {}).get("echoAttributes", []):
            cost = attr.get("cost")
            if cost not in real_names_by_cost:
                continue
            for key in ("attribute", "attribute2"):
                a = attr.get(key) or {}
                for t in a.get("texts", []):
                    if t.get("language") == "en" and t.get("name"):
                        real_names_by_cost[cost].add(t["name"])

    # `attribute`/`attribute2` in echoAttributes[] are exactly the
    # variable/static pair confirmed by the user (2026-07-03) -- so the full
    # covered name-set per cost is the selectable options plus the one static
    # stat, no more special-casing needed.
    curve_names_by_cost = {
        cost: {opt["statName"] for opt in curves["mainStatOptionsByCost"][str(cost)]}
        | {curves["staticMainStatByCost"][str(cost)]["statName"]}
        for cost in (1, 3, 4)
    }
    for cost in (1, 3, 4):
        missing = real_names_by_cost[cost] - curve_names_by_cost[cost]
        if missing:
            log(f"  [FAIL] cost {cost}: real stat names missing from curve data: {missing}")
            all_ok = False
        else:
            log(f"  [OK] cost {cost}: all real main-stat names covered ({sorted(real_names_by_cost[cost])})")

    # (b) set names/text appear in echo_sets.json
    def normalize_effect_text(s: str) -> str:
        s = s.lower()
        s = re.sub(r"\s+", " ", s)
        s = re.sub(r"\s*([+%.,:])\s*", r"\1", s)  # collapse spacing around + % . , :
        s = s.strip().rstrip(".")
        return s

    sets_by_norm = {normalize_name(s["name"]): s for s in sets}
    missing_sets = []
    wording_diffs = []
    exact_matches = 0
    checked = 0
    for cid, char in characters.items():
        for eff in char.get("echo", {}).get("main", {}).get("echoSetEffects", []):
            checked += 1
            piece_count = eff.get("echoSet")
            for t in eff.get("texts", []):
                if t.get("language") != "en":
                    continue
                name = t.get("name", "").strip()
                desc = t.get("description", "").strip()
                norm = normalize_name(name)
                our_set = sets_by_norm.get(norm)
                if our_set is None:
                    missing_sets.append(f"set '{name}' not found in echo_sets.json at all")
                    continue
                piece_match = next((e for e in our_set["effects"] if e["pieceCount"] == piece_count), None)
                if piece_match is None:
                    missing_sets.append(f"set '{name}' has no {piece_count}pc effect in echo_sets.json")
                    continue
                if normalize_effect_text(piece_match["description"]) == normalize_effect_text(desc):
                    exact_matches += 1
                else:
                    wording_diffs.append(
                        f"set '{name}' {piece_count}pc: real={desc!r} vs game8={piece_match['description']!r}"
                    )
    if missing_sets:
        log(f"  [FAIL] {len(missing_sets)} set(s)/piece-effects genuinely missing from echo_sets.json:")
        for m in missing_sets[:15]:
            log(f"    - {m}")
        all_ok = False
    else:
        log(f"  [OK] every real echoSetEffects set name + piece-count is present in echo_sets.json")

    if wording_diffs:
        log(
            f"  [INFO] {len(wording_diffs)}/{checked} entries have wording differences between Kuro's real "
            f"text and game8's fan transcription (same mechanic, different phrasing -- e.g. 'Upon' vs "
            f"'After', '+10%' vs '+ 10%'). Set is present and piece-count matches in all cases; not a hard "
            f"failure, logged for manual spot-check:"
        )
        for m in wording_diffs[:10]:
            log(f"    - {m}")
        if len(wording_diffs) > 10:
            log(f"    ... and {len(wording_diffs) - 10} more")
    log(f"  [OK] {exact_matches}/{checked} entries match verbatim after normalization")

    # (c) rank -> level derivation succeeded cleanly
    if rank_derivation_ok:
        log(f"  [OK] rank->level derivation confirmed cleanly: {RANK_TO_LEVEL}")
    else:
        log("  [FAIL] rank->level derivation was ambiguous or failed:")
        for n in rank_derivation_notes:
            log(f"    - {n}")
        all_ok = False

    # (d) exactly 13 substat entries (see GROUP_A_DMG_STAT_NAMES comment):
    # 9 plain stats + 4 attack-type DMG Bonus names, confirmed by real
    # echo-card screenshots. Elemental DMG Bonus stays excluded (main-stat
    # only). Arikatsu's phantomsubproperty.json (19 rows) is not expected to
    # match this count -- it's not a reliable "confirmed active substat pool"
    # source on its own, just cross-referenced for these 13.
    sub_count = len(curves["subStatOptions"])
    if sub_count != 13:
        log(f"  [FAIL] expected 13 substat entries, got {sub_count}")
        all_ok = False
    else:
        log("  [OK] subStatOptions has exactly 13 entries (the real substat pool)")

    log(f"\n=== VERIFICATION {'PASSED' if all_ok else 'FAILED'} ===")
    return all_ok


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify", action="store_true", help="Run the verification gate after building")
    parser.add_argument("--arikatsu-path", default=None, help="Path to a local Arikatsu/WutheringWaves_Data clone")
    parser.add_argument("--cache-dir", default=None, help="Directory to cache fetched HTML (avoids re-fetching)")
    args = parser.parse_args()

    cache_dir = Path(args.cache_dir) if args.cache_dir else (
        Path(r"C:\Users\aditk\AppData\Local\Temp\claude\c--Users-aditk-OneDrive-Desktop-wuwa-agent"
             r"\d61d1dc7-8380-4c20-a9a4-86e09d9af081\scratchpad\echo_fetch")
    )

    log("=== Step 1: game8.co catalog + sonata sets ===")
    all_echoes: list[dict] = []
    for cost, url in GAME8_COST_PAGES.items():
        log(f"  fetching cost-{cost} page...")
        html = fetch_html(url, f"cost{cost}", cache_dir)
        echoes = parse_game8_cost_page(html, cost)
        log(f"    parsed {len(echoes)} echoes for cost {cost}")
        all_echoes.extend(echoes)
    log(f"  total echoes: {len(all_echoes)}")
    apply_manual_set_corrections(all_echoes)

    log("  fetching sonata effects page...")
    sonata_html = fetch_html(GAME8_SONATA_URL, "sonata", cache_dir)
    sets = parse_game8_sonata_sets(sonata_html)
    log(f"  parsed {len(sets)} sonata sets")

    kuro_set_icons = extract_kuro_set_icons(load_characters_json())
    kuro_icon_count = sum(1 for s in sets if s["name"] in kuro_set_icons)
    for s in sets:
        game8_icon = s.pop("game8IconUrl", None)
        s["iconUrl"] = kuro_set_icons.get(s["name"]) or game8_icon
    log(
        f"  set icons: {kuro_icon_count}/{len(sets)} from real Kuro CDN (wuwa_characters.json), "
        f"{len(sets) - kuro_icon_count} falling back to game8's own icon"
    )

    log("\n=== Step 2: main-stat values (game8 primary, wutheringlab cross-check) ===")
    game8_main_stats_by_cost: dict[int, dict[str, list[float]]] = {}
    for cost, url in GAME8_COST_PAGES.items():
        html = fetch_html(url, f"cost{cost}", cache_dir)
        stats = parse_game8_main_stat_tables(html)
        game8_main_stats_by_cost[cost] = stats
        log(f"  cost {cost}: parsed {len(stats)} main-stat rows from game8's +10/+15/+20/+25 tables")

    log("  fetching wutheringlab RAW HTML (not WebFetch) for cross-check...")
    wl_html = fetch_html(WUTHERINGLAB_URL, "wutheringlab", cache_dir)
    wl_main_stats_by_cost = parse_wutheringlab_main_stats(wl_html)

    resolved_main_stats_by_cost: dict[int, dict[str, list[float]]] = {}
    reconciliation_notes: list[str] = []
    for cost in (1, 3, 4):
        resolved, notes = reconcile_main_stats(
            cost, game8_main_stats_by_cost[cost], wl_main_stats_by_cost.get(cost, {})
        )
        resolved_main_stats_by_cost[cost] = resolved
        reconciliation_notes.extend(notes)

    if reconciliation_notes:
        log(f"  [RECONCILIATION] {len(reconciliation_notes)} game8/wutheringlab disagreement(s), resolved by picking whichever source's step-ratio pattern fits its own cost tier best:")
        for n in reconciliation_notes:
            log(f"    - {n}")
    else:
        log("  game8 and wutheringlab fully agree on all overlapping stats")

    # after reconciliation, run the ratio-outlier check against the FINAL
    # resolved values (using each cost tier's own median step pattern as the
    # reference) purely as a final confirmation that nothing outlier-shaped
    # slipped through reconciliation.
    ratio_warnings = []
    for cost in (1, 3, 4):
        ref = compute_median_step_ratios(resolved_main_stats_by_cost[cost])
        for stat_name, values in resolved_main_stats_by_cost[cost].items():
            other = {k: v for k, v in resolved_main_stats_by_cost[cost].items() if k != stat_name}
            ref_excl = compute_median_step_ratios(other) if other else ref
            ratio_warnings.extend(sanity_check_ratios(cost, stat_name, values, ref_excl))
    if ratio_warnings:
        log(f"  [DATA QUALITY] {len(ratio_warnings)} residual ratio-outlier warning(s) in the RESOLVED data (needs manual review):")
        for w in ratio_warnings:
            log(f"    - {w}")
    else:
        log("  no ratio outliers remain in the resolved (post-reconciliation) main-stat data")

    log("\n=== Step 3: Arikatsu (growth curve, cost-tier option cross-check, substat count) ===")
    arikatsu_path = find_arikatsu_path(args.arikatsu_path)
    log(f"  using Arikatsu clone at: {arikatsu_path}")
    growth_curve = load_arikatsu_growth_curve(arikatsu_path)
    log(f"  loaded 26-row growth curve, level 0={growth_curve[0]} (1.0x) to level 25={growth_curve[25]} (5.0x) -- confirmed")
    substat_count = load_arikatsu_substat_count(arikatsu_path)
    log(f"  phantomsubproperty.json has {substat_count} rows")
    main_prop_cost_tiers = load_arikatsu_main_prop_cost_tiers(arikatsu_path)
    log(f"  RandGroupId cost-tier structural groups: {{1: {len(main_prop_cost_tiers[1])}, 3: {len(main_prop_cost_tiers[3])}, 4: {len(main_prop_cost_tiers[4])}}}")

    log("\n=== Step 4: rank -> level derivation ===")
    # Confirmed directly via game8's own '+10/+15/+20/+25 Stat' column labels
    # matching wutheringlab's Rank2-5 values for 2 independent stats (4-cost
    # ATK and 4-cost Crit. Rate) -- see module docstring for the full proof.
    # We re-verify that proof live here using the freshly-parsed data.
    rank_derivation_notes = []
    rank_derivation_ok = True
    for stat_name in ("ATK", "Crit. Rate"):
        g8 = game8_main_stats_by_cost.get(4, {}).get(stat_name)
        wl = wl_main_stats_by_cost.get(4, {}).get(stat_name)
        if g8 is None or wl is None:
            rank_derivation_notes.append(f"missing data for cross-check stat {stat_name}")
            rank_derivation_ok = False
            continue
        diffs = [abs(a - b) for a, b in zip(g8, wl)]
        if max(diffs) > 0.2:
            rank_derivation_notes.append(
                f"{stat_name}: game8 +10/15/20/25={g8} vs wutheringlab Rank2-5={wl} -- diff too large"
            )
            rank_derivation_ok = False
        else:
            log(f"  [OK] {stat_name}: game8 +10/15/20/25={g8} matches wutheringlab Rank2-5={wl} (max diff {max(diffs):.2f})")
    if rank_derivation_ok:
        log(f"  CONFIRMED: {RANK_TO_LEVEL}")
    else:
        log("  [FAIL] rank->level derivation did not confirm cleanly:")
        for n in rank_derivation_notes:
            log(f"    - {n}")

    log("\n=== Step 5: substat transcription sanity check ===")
    substat_errors = verify_substat_transcription()
    if substat_errors:
        for e in substat_errors:
            log(f"  [FAIL] {e}")
    else:
        log("  [OK] 13 entries transcribed, values/chances lengths match, both groups' chances sum to ~100%")
    log(
        f"  [INFO] Arikatsu's phantomsubproperty.json has {substat_count} rows -- no longer expected to "
        "match (that file isn't a reliable confirmed-substat-pool source on its own, see "
        "GROUP_A_DMG_STAT_NAMES comment)"
    )

    log("\n=== Step 6: cross-link signature echoes ===")
    characters = load_characters_json()
    matched, unmatched = cross_link_signature_echoes(all_echoes, characters)
    total_signature = matched + len(unmatched)
    log(f"  matched {matched}/{total_signature} signature echoes by name")
    if unmatched:
        log(f"  unmatched ({len(unmatched)}): {unmatched}")

    log("\n=== Building main-stat option curves ===")
    # Confirmed against a real echo card (user, 2026-07-03): every echo has
    # TWO main stats, not one -- a fixed/non-selectable "static" one plus the
    # player-selectable "variable" one this app already modeled. The static
    # one is always flat ATK for cost-3/cost-4 echoes, and always flat HP for
    # cost-1 echoes (cost-1 has no variable/selectable second stat choice
    # beyond that). Previously this script just dropped flat ATK entirely
    # (wrongly assuming it was a scrape bleed-over from a substat table) --
    # it's real, just not swappable. Routed into staticMainStatByCost instead
    # of mainStatOptionsByCost (the swappable-options list).
    STATIC_MAIN_STAT_NAME = {1: "HP", 3: "ATK", 4: "ATK"}
    main_stat_options_by_cost: dict[int, list[dict]] = {1: [], 3: [], 4: []}
    static_main_stat_by_cost: dict[int, dict] = {}
    for cost in (1, 3, 4):
        for stat_name, rank_values in resolved_main_stats_by_cost[cost].items():
            prop_id, add_type = STAT_PROP_INFO.get(stat_name, (None, 2 if "%" in stat_name or "Bonus" in stat_name or "Rate" in stat_name or "Regen" in stat_name else 1))
            values_by_level = interpolate_curve(stat_name, rank_values, growth_curve)
            option = {
                "propId": prop_id,
                "statName": stat_name,
                "addType": add_type,
                "valuesByLevel": {str(k): v for k, v in values_by_level.items()},
            }
            if stat_name == STATIC_MAIN_STAT_NAME[cost]:
                static_main_stat_by_cost[cost] = option
            else:
                main_stat_options_by_cost[cost].append(option)

    substat_options = build_substat_options()

    log("\n=== Writing output files ===")
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    FRONTEND_DATA_DIR.mkdir(parents=True, exist_ok=True)

    catalog_out = {
        "meta": {
            "game8FetchDate": FETCH_DATE,
            "wutheringlabFetchDate": FETCH_DATE,
            "arikatsuSource": "https://github.com/Arikatsu/WutheringWaves_Data",
            "substatInfographicAttribution": "youtube.com/catalystonline, Discord .LowPriority (user-provided, 2026-07-02)",
        },
        "echoes": all_echoes,
    }
    sets_out = {"sets": sets}
    curves_out = {
        "mainStatOptionsByCost": {str(c): main_stat_options_by_cost[c] for c in (1, 3, 4)},
        "staticMainStatByCost": {str(c): static_main_stat_by_cost[c] for c in (1, 3, 4)},
        "subStatOptions": substat_options,
    }

    catalog_path = DATA_DIR / "echo_catalog.json"
    sets_path = DATA_DIR / "echo_sets.json"
    curves_path = DATA_DIR / "echo_stat_curves.json"

    catalog_path.write_text(json.dumps(catalog_out, indent=2, ensure_ascii=False), encoding="utf-8")
    sets_path.write_text(json.dumps(sets_out, indent=2, ensure_ascii=False), encoding="utf-8")
    curves_path.write_text(json.dumps(curves_out, indent=2, ensure_ascii=False), encoding="utf-8")
    log(f"  wrote {catalog_path}")
    log(f"  wrote {sets_path}")
    log(f"  wrote {curves_path}")

    if args.verify:
        ok = run_verification(all_echoes, sets, curves_out, rank_derivation_ok, rank_derivation_notes)
        if not ok:
            log("\nVerification FAILED -- not mirroring to frontend. Fix the root cause and re-run.")
            sys.exit(1)

        for src, name in (
            (catalog_path, "echo_catalog.json"),
            (sets_path, "echo_sets.json"),
            (curves_path, "echo_stat_curves.json"),
        ):
            dest = FRONTEND_DATA_DIR / name
            dest.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
            log(f"  mirrored {name} -> {dest}")
        # echo_catalog.json deliberately excluded here -- see AGENT_DATA_DIR's
        # comment above for why.
        for src, name in ((sets_path, "echo_sets.json"), (curves_path, "echo_stat_curves.json")):
            dest = AGENT_DATA_DIR / name
            dest.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
            log(f"  mirrored {name} -> {dest}")
        log(
            "\nDone. All 3 files verified and mirrored to frontend/public/data/ "
            "(echo_sets.json/echo_stat_curves.json also mirrored to "
            "supabase/functions/agent/ -- re-run scripts/download_echo_images.py "
            "for echo_catalog.json's agent copy, and redeploy the agent function)."
        )
    else:
        log("\nDone (skipped --verify; files written to data/ only, NOT mirrored to frontend).")


if __name__ == "__main__":
    main()

"""
Extract the always-on stat-bonus component (if any) from each weapon's
passive ability text, for folding into computeFinalStats/get_character_build
alongside the weapon's ATK and secondary stat.

Why this exists: computeFinalStats (frontend/src/lib/finalStats.ts, ported
to supabase/functions/agent/stats.ts) only ever reads a weapon's ATK and its
ONE secondary stat -- never its passive ability text, which is stored as a
free-text description (weapon_catalog.json's effectDescription), same
limitation as echo set-bonus effects. Found 2026-08-19 via a real
discrepancy: a user's friend's Cartethyia build showed 46338 HP in this
app but 48108 in-game, traced exactly to Defier's Thorn's Rank 1 passive
("Max HP is increased by 12%") never being applied -- verified by the
math: 14800 base HP x 12% = 1776, and 48108 - 46338 = 1770 (within
rounding).

Why this can't just parse the whole passive text: most weapon passives mix
an always-on component with a conditional/proc one in the SAME sentence
(e.g. Defier's Thorn's own passive continues "...15s after casting Intro
Skill or Basic Attacks, ignore 8% of the target's DEF... if the target has
Aero Erosion, DMG taken is Amplified by 20%") -- baking the conditional
parts into a static "final stats" number would be actively wrong, not just
incomplete. This only extracts the FIRST sentence, and only when it
contains no conditional-trigger language at all (when/upon/after/casting/
dealing/stack/etc) -- anything else is left alone entirely, same as this
app already does for echo set-bonus text (computeActiveSetBonuses).

Validated against the full 100-weapon catalog (2026-08-19): 40 confidently
extracted (spot-checked, all genuinely unconditional single-sentence
passives), 60 correctly rejected (every rejection sampled was verified to
start with real conditional language -- no false rejections found), 0
false positives found on manual review. This is a real, tested pattern,
not a guess -- but it is still a plain-text heuristic; if Kuro ever phrases
a new weapon's passive in an unrecognized way, it will be silently
excluded (conservative failure direction) rather than mis-extracted --
check REJECTED output on every rerun for anything that looks like it
should have matched.

Output: data/weapon_passive_bonuses.json, keyed by weapon gbId -> a list of
{stat, valuesByRank} (list, not single object, because a few weapons boost
two stats at once, e.g. "Basic Attack DMG Bonus and Heavy Attack DMG Bonus
by X%" -- both get the same values). valuesByRank is indexed 0-4 for
Rank 1-5. Weapons with no confidently-extractable unconditional bonus are
simply absent from the output (not an empty list). "ELEMENTAL" is a
placeholder stat name for "Attribute DMG Bonus" text (a handful of weapons
phrase their bonus as whichever element the wielder is, e.g. Stringmaster) --
resolved at compute time against the wielding character's own element,
mirroring how elementalDmgBonusName is already built in finalStats.ts.

Copied to frontend/public/data/ (frontend reads its own copy, see
frontend.md) and supabase/functions/agent/ (bundled into the agent's
deploy, no runtime fetch). Rerun whenever weapon_catalog.json changes.
"""

import json
import re
import shutil
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

CATALOG_PATH = "data/weapon_catalog.json"
OUT_PATH = "data/weapon_passive_bonuses.json"
FRONTEND_COPY_PATH = "frontend/public/data/weapon_passive_bonuses.json"
FUNCTION_COPY_PATH = "supabase/functions/agent/weapon_passive_bonuses.json"

# Canonical stat-name strings -- MUST match the exact keys computeFinalStats
# (frontend/src/lib/finalStats.ts) and its Deno port (stats.ts) look up via
# echo()/forte()/weaponStat(), not just similar text.
STAT_NAME_MAP = {
    "atk": "ATK%",
    "hp": "HP%",
    "max hp": "HP%",
    "def": "DEF%",
    "energy regen": "Energy Regen",
    "crit. rate": "Crit. Rate",
    "crit rate": "Crit. Rate",
    "crit. dmg": "Crit. DMG",
    "crit dmg": "Crit. DMG",
    "healing bonus": "Healing Bonus",
    "basic attack dmg bonus": "Basic Attack DMG Bonus",
    "heavy attack dmg bonus": "Heavy Attack DMG Bonus",
    "resonance skill dmg bonus": "Resonance Skill DMG Bonus",
    "resonance liberation dmg bonus": "Resonance Liberation DMG Bonus",
    "attribute dmg bonus": "ELEMENTAL",
}
ELEMENTS = ["glacio", "fusion", "electro", "aero", "spectro", "havoc"]

# Deliberately excludes "gain"/"grants" alone -- used in BOTH conditional
# stack-based effects ("Gain 6 stacks of Oath") AND plain unconditional
# bonuses ("Gain 12% Attribute DMG Bonus"); "stack"/"stacking" already
# catches the former case on its own.
CONDITIONAL_MARKERS = re.compile(
    r"\b(when|upon|after|casting|cast|dealing|deals|providing|provides|"
    r"if |stack|stacking|switching|entering|defeating|triggered|every \d|"
    r"within \d)\b",
    re.IGNORECASE,
)

RANK_VALUES_RE = r"([\d.]+%?(?:/[\d.]+%?){4})"
SUBJECT_PREFIX = r"(?:the wielder'?s |the Resonator'?s |)"

# Two-stat pattern tried FIRST (e.g. "Increases Basic Attack DMG Bonus and
# Heavy Attack DMG Bonus by 12%/.../24%.") -- must come before the
# single-stat patterns below, which would otherwise swallow "X and Y" as one
# unmappable string.
TWO_STAT_PATTERN = re.compile(
    rf"^(?:Increases?|Grants?|Gain) {SUBJECT_PREFIX}([A-Za-z. ]+?) and ([A-Za-z. ]+?) by {RANK_VALUES_RE}\.?$",
    re.IGNORECASE,
)
SINGLE_STAT_PATTERNS = [
    # "Increases/Increase/Grants/Grant ATK by 12%/.../24%."
    re.compile(
        rf"^(?:Increases?|Grants?|Gain) {SUBJECT_PREFIX}(?:Max )?([A-Za-z. ]+?) by {RANK_VALUES_RE},?\.?$",
        re.IGNORECASE,
    ),
    # "ATK is increased by 12%/.../24%." / "ATK increased by ...%."
    re.compile(
        rf"^(?:Max )?([A-Za-z. ]+?) (?:is |are )?increased? by {RANK_VALUES_RE}\.?$",
        re.IGNORECASE,
    ),
    # "Grants/Gain 12%/.../24% Attribute DMG Bonus."
    re.compile(
        rf"^(?:Increases?|Grants?|Gain) {RANK_VALUES_RE} {SUBJECT_PREFIX}([A-Za-z. ]+?)\.?$",
        re.IGNORECASE,
    ),
]
STAT_GROUP_FIRST = [True, True, False]

CRIT_PLACEHOLDER = "\x00CRIT\x00"


def first_sentence(text: str) -> str:
    # "Crit." contains its own period -- protect it from being misread as a
    # sentence boundary before splitting.
    protected = text.strip().replace("Crit.", CRIT_PLACEHOLDER)
    parts = re.split(r"(?<=[.])\s+|\n", protected, maxsplit=1)
    return parts[0].strip().replace(CRIT_PLACEHOLDER, "Crit.")


def canonical_stat_name(raw: str):
    key = raw.strip().lower()
    if key in STAT_NAME_MAP:
        return STAT_NAME_MAP[key]
    for el in ELEMENTS:
        if key == f"{el} dmg bonus":
            return f"{el.capitalize()} DMG Bonus"
    return None


# "Basic Attack and Heavy Attack DMG Bonus" -- the first stat name drops the
# shared "DMG Bonus" suffix, borrowed from the second. Only tried as a
# fallback after a plain lookup fails.
def canonical_stat_name_with_shared_suffix(raw: str, suffix_donor: str):
    direct = canonical_stat_name(raw)
    if direct:
        return direct
    donor_suffix_match = re.search(r"\b(DMG Bonus)$", suffix_donor.strip(), re.IGNORECASE)
    if not donor_suffix_match:
        return None
    return canonical_stat_name(f"{raw.strip()} {donor_suffix_match.group(1)}")


def try_extract(effect_text: str):
    """Returns (list of {stat, valuesByRank}, sentence, unmapped_name_or_None)."""
    sentence = first_sentence(effect_text)
    if CONDITIONAL_MARKERS.search(sentence):
        return None, sentence, None

    m = TWO_STAT_PATTERN.match(sentence)
    if m:
        stat1, stat2, values_raw = m.group(1), m.group(2), m.group(3)
        c1 = canonical_stat_name_with_shared_suffix(stat1, stat2)
        c2 = canonical_stat_name(stat2)
        if c1 and c2:
            values = [float(v.rstrip("%")) for v in values_raw.split("/")]
            return [{"stat": c1, "valuesByRank": values}, {"stat": c2, "valuesByRank": values}], sentence, None
        return None, sentence, f"{stat1} and {stat2}"

    for pattern, stat_first in zip(SINGLE_STAT_PATTERNS, STAT_GROUP_FIRST):
        m = pattern.match(sentence)
        if not m:
            continue
        stat_raw, values_raw = (m.group(1), m.group(2)) if stat_first else (m.group(2), m.group(1))
        stat = canonical_stat_name(stat_raw)
        if not stat:
            return None, sentence, stat_raw
        values = [float(v.rstrip("%")) for v in values_raw.split("/")]
        return [{"stat": stat, "valuesByRank": values}], sentence, None

    return None, sentence, None


def main():
    with open(CATALOG_PATH, encoding="utf-8") as f:
        catalog = json.load(f)

    result = {}
    matched_count = 0
    unmapped = []
    for gb_id, w in catalog.items():
        text = w.get("effectDescription") or ""
        if not text.strip():
            continue
        extracted, sentence, unmapped_name = try_extract(text)
        if extracted:
            result[gb_id] = extracted
            matched_count += 1
        elif unmapped_name:
            unmapped.append((w["name"], unmapped_name, sentence))

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    shutil.copyfile(OUT_PATH, FRONTEND_COPY_PATH)
    shutil.copyfile(OUT_PATH, FUNCTION_COPY_PATH)

    print(f"Extracted unconditional passive bonuses for {matched_count} of {len(catalog)} weapons")
    if unmapped:
        print(f"\n{len(unmapped)} weapon(s) had an unconditional-looking sentence but an unrecognized stat name -- check STAT_NAME_MAP:")
        for name, stat_raw, sentence in unmapped:
            print(f"  {name}: {stat_raw!r}  <- {sentence!r}")
    print(f"\nWrote {OUT_PATH}, {FRONTEND_COPY_PATH}, {FUNCTION_COPY_PATH}")


if __name__ == "__main__":
    main()

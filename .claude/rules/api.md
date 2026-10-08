# API Rules

## Kuro Games Guide API

Base URL: `https://guide-server.aki-game.net`

**Required headers for every request:**
```python
headers = {
    "x-os": "pc",
    "x-language": "en",
    "Referer": "https://wuwaguide.kurogames.com/",
    "Origin": "https://wuwaguide.kurogames.com"
}
```

Without these headers, the API returns `{"code": 200, "data": null}`.

**Key endpoints:**
- `GET /introduction/list?roleGbId={id}` — list of guide entries for a character
- `GET /introduction/info?roleGbId={id}&id={guide_id}` — full build data for a guide entry

**All 61 valid character roleGbIds (verified 2026-08-20 — element ID blocks
correspond to 1=Glacio, 2=Fusion, 3=Electro, 4=Aero, 5=Spectro, 6=Havoc;
IDs don't strictly follow their block's element once a block is "full" —
e.g. 1610 "Yangyang: Xuanling" is Havoc despite the 1610 slot falling right
after the otherwise-Havoc 1601-1608 run, and 1110 "Suisui" is Glacio despite
sitting in the 1100s Glacio block's tail):**
```python
VALID_IDS = [
    1102, 1103, 1104, 1105, 1106, 1107, 1108, 1109, 1110,
    1202, 1203, 1204, 1205, 1206, 1207, 1208, 1209, 1210, 1211,
    1301, 1302, 1303, 1304, 1305, 1306, 1307, 1308, 1309, 1310,
    1402, 1403, 1404, 1405, 1406, 1407, 1408, 1409, 1410, 1411, 1412, 1413,
    1501, 1502, 1503, 1504, 1505, 1506, 1507, 1508, 1509, 1510, 1511,
    1601, 1602, 1603, 1604, 1605, 1606, 1607, 1608, 1610
]
```
**2026-08 patch additions:** 1110 (Suisui, Glacio), 1309/1310 (Rover:
Electro gender-variant pair, same "share data" pattern as the other Rover
pairs below), 1610 (Yangyang: Xuanling, Havoc — a distinct playable
roleGbId from the original Yangyang at 1402, not an alternate costume on
the same ID; treat it as its own character everywhere, including the
frontend character-select grid). Found by brute-force probing
`/introduction/list` past each block's previous max — see "Re-indexing"
below. Fetched into `wuwa_characters.json` via `scripts/fetch_new_characters.py`
(edit its `NEW_ROLE_IDS` list and rerun for the next patch's additions).

**Later addition:** 1413 (Qingxiao, Aero — follows its block's element, no
exception needed unlike 1110/1610 above), added 2026-08-20 the same day her
guide went live (`guide_id` 14131) — a good illustration of how fast a new
release can show up in this API.

**Known API quirk:** for Rover gender-variant pairs (e.g. 1406/1408,
1501/1502, 1604/1605), the API's own `role.roleGbId` field in the response
body has been observed out of sync with the `roleGbId` you queried by —
one variant in each pair reports its sibling's ID instead of its own.
Always key data by the `roleGbId` you requested, never by the response
body's internal `role.roleGbId` field.

**Missing from `wuwa_characters.json`:** 1106 (Youhu) and 1402 (Yangyang)
were not fetched by the initial brute-force scan and are absent from the
file (59 of 61 valid IDs present). The frontend character-select grid
therefore cannot show them, and `fetch_forte_nodes.py` never attempts
them either (it iterates `wuwa_characters.json`'s own keys) — run
`fetch_new_characters.py` for these two first if that ever gets fixed.

**Re-indexing:** Use `modifiedAt` Unix timestamp field from the API response
to detect stale entries. Since new ID blocks get added entirely outside the
existing range (as with 1601-1608), periodically re-probe a few IDs past the
current max — don't assume `VALID_IDS` stays complete forever.

## Arikatsu/WutheringWaves_Data (forte circuit stat bonus nodes)

**Superseded the dotgg.gg + wutheringlab.com hybrid on 2026-08-08.** That
approach topped out at 42/60 characters via dotgg plus 12 hand-derived
wutheringlab approximations, with zero coverage for anything released in
the 2026-08 patch — and one of the approximations (Mornye's Healing Bonus)
turned out to be flatly wrong (guessed 1.25%/3.75%, real value is the
standard 1.80%/4.20% tier). `scripts/fetch_forte_nodes.py` now pulls real
per-node values for **all 59 characters** straight from this datamine repo
instead. Same repo already used for `fetch_character_stat_curves.py` — see
that script for the branch-resolution pattern (`GET
https://api.github.com/repos/Arikatsu/WutheringWaves_Data` for
`default_branch`, since it's renamed to the current game version like
`"3.5"` every patch).

**Source file:** `BinData/skillTree/skilltree.json` — one flat list of
~950 nodes covering every character's entire skill tree (talents,
inherent skills, and the forte stat-bonus nodes together), keyed by
`NodeGroup` == roleGbId (as an **integer**, not a string).

**Extracting the 8 stat-bonus nodes for one character:**
1. Filter to that `NodeGroup`. `NodeType 2` nodes are the 4 outer talent
   columns (Normal Attack/Resonance Skill/Resonance Liberation/Intro
   Skill) — always exactly 4, sort by `Coordinate` (1-4) to get that fixed
   order. `NodeType 1` is Forte Circuit — no stat-bonus children, matching
   this app's existing "Forte Circuit uses Inherent Skills instead" design.
2. `NodeType 4` nodes are the stat-bonus nodes. Each one's `ParentNodes[0]`
   points to another node's `NodeIndex` — for the *upper*-tier node this is
   the *lower*-tier node of the same column, not the talent directly, so
   **walk the parent chain up** until it lands on one of the 4 `NodeType 2`
   talent nodes found in step 1. That tells you the column.
3. The stat-bonus node's own `Coordinate` gives the tier: 1 = lower,
   2 = upper.
4. `Property[0]` is `{Id, Value, IsRatio}` — map `Id` to a stat name (table
   below), then convert `Value`: `IsRatio: true` → raw fraction, multiply
   by 100 (`0.018` → `1.8`); `IsRatio: false` → already ×100 basis points,
   divide by 100 (`180` → `1.8`). Same convention as
   `STAT_NAME_BY_PROP_ID` in `frontend/src/lib/weapons.ts`.

**Property Id → stat name** (found by cross-checking against
already-known-correct values spanning all 6 elements + 3 healers):
```
8 = Crit. Rate        9 = Crit. DMG         35 = Healing Bonus
10002 = HP             10007 = ATK            10010 = DEF
22 = Glacio DMG Bonus        23 = Fusion DMG Bonus       24 = Electro DMG Bonus
25 = Aero DMG Bonus          26 = Spectro DMG Bonus      27 = Havoc DMG Bonus
```
**Critical gotcha, got this wrong on the first pass:** IDs 10002/10007/
10010 must map to bare `"HP"`/`"ATK"`/`"DEF"`, **not** `"HP%"`/`"ATK%"`/
`"DEF%"` — those are the *echo/weapon* stat-name convention. This app's
forte-node convention has always stored these bare even though they're %
multipliers (see the Output schema note below and
`frontend/src/lib/finalStats.ts`'s `forte("ATK")`/`forte("HP")`/
`forte("DEF")` lookups). Using the `%`-suffixed names would silently zero
out every character's ATK/HP/DEF forte contribution — caught by checking
against `finalStats.ts` before shipping, not by a visible error.

**Rover gender-variant pairs are absent as their own `NodeGroup`** — same
"one entry serves both" pattern as the Kuro guide API itself. Copy the
sibling's extracted result: `1310` ← `1309`, `1408` ← `1406`, `1502` ←
`1501`, `1605` ← `1604` (`ROVER_DUPLICATE_OF` in the script).

**Output schema** (`data/sequence_stat_nodes.json`, also copied to
`frontend/public/data/`):
```json
{
  "nodes": {
    "1107": {
      "normal_attack":        [{"stat":"Crit. Rate","value":1.2}, {"stat":"Crit. Rate","value":2.8}],
      "resonance_skill":      [{"stat":"ATK","value":1.8},        {"stat":"ATK","value":4.2}],
      "resonance_liberation": [{"stat":"ATK","value":1.8},        {"stat":"ATK","value":4.2}],
      "intro_skill":          [{"stat":"Crit. Rate","value":1.2}, {"stat":"Crit. Rate","value":2.8}]
    }
  }
}
```
Array index `[0]` = lower tier, `[1]` = upper tier. **All forte stat values
are percentages** — even nodes named `"ATK"`, `"HP"`, or `"DEF"` are %
multipliers on the base stat, not flat additions. The flat-index formula
for the 8-element boolean active array is `colIndex * 2 + tierIndex`, where
column order matches `FORTE_COLUMN_ORDER` in `TalentGrid.tsx`.

## dotgg.gg API (full weapon catalog)

**Endpoint:** `GET https://api.dotgg.gg/cgfw/getgacha?game=wuthering-waves&type=weapons`

Returns ~105 weapons with `id` (gbId), `name`, `type` (matches our
`WeaponTypeName` strings exactly: Broadblade/Sword/Pistols/Gauntlets/
Rectifier — no mapping table needed), `rarity` ("1"-"5"), `icon` (relative
path — prefix with `https://static.dotgg.gg/wuthering-waves/`), and
`skill.description`/`skill.params`.

**Rank-scaled text format:** `skill.params` is 5 arrays (one per
refinement rank 1-5), each holding the values for that rank's `{0}`/`{1}`/…
placeholders in `skill.description`. Expand by joining each placeholder's
5 rank-values with `/` — e.g. `params=[["4%"],["5%"],["6%"],["7%"],["8%"]]`
+ `"Increases ATK by {0}."` → `"Increases ATK by 4%/5%/6%/7%/8%."`. Same
convention Kuro's own guide API uses for character-recommended weapon text,
so the two sources render identically in the picker. See
`format_description()` in `scripts/fetch_weapon_catalog.py`.

**A few dotgg entries are unlocalized placeholders** — `name` literally
`"WeaponConf_21010073_WeaponName"` etc. (5 of 105, as of 2026-08-07,
presumably very-new weapons whose English text hasn't gone out yet).
`fetch_weapon_catalog.py` drops any dotgg entry whose `id` isn't already a
key in `weapon_stat_curves.json`'s `baseAtk` — which conveniently filters
these out too, since a display entry with no computable ATK is useless
either way.

**Kuro-data fallback pass (added 2026-08-20):** for any weapon id with real
stat-curve data but no usable dotgg entry, `fetch_weapon_catalog.py` now
does a second pass scanning every character's own recommended-weapon data
in `wuwa_characters.json` (`load_kuro_weapon_entries()`) and fills the
catalog entry from there instead — same name/icon/star/weaponType/
rank-scaled passive-text shape, no `{0}`-placeholder expansion needed since
Kuro's text is already rank-scaled. Found via a real gap, not proactively:
Qingxiao's brand-new "Glint of Clouds" (too new for dotgg) AND Chisa's
pre-existing signature weapon Kumokiri (dotgg just never had it) were BOTH
missing display data before this — Kumokiri's absence meant its own +12%
ATK passive was silently never applied for any Chisa build, unrelated to
Qingxiao. This is a genuinely different gap from the zh-Hans-only-text case
below (weapon *entirely missing* from dotgg vs. *present but unlocalized*)
— both mechanisms coexist, this one doesn't replace the other.

**Coverage:** as of 2026-08-20, 4 of 122 known weapon gbIds have no display
data from any source (`21010045`, `21010076`, `21020045`, `21050045` —
`21010076` newly surfaced when `fetch_weapon_stat_curves.py` picked up real
stat-curve data for it; no character recommends it and dotgg doesn't have
it either). Some Kuro-sourced weapon texts are zh-Hans-only (no `"en"`
entry at all) — `loadWeaponCatalog()` in `frontend/src/lib/weapons.ts`
treats a Kuro name of `"Unknown"` as lower-priority than a dotgg name, not
as already-resolved, so dotgg's real name/icon still wins for those.

**`weapon_stat_curves.json` has a real fetch script now**
(`scripts/fetch_weapon_stat_curves.py`, added 2026-08-20) — this file
previously existed only as already-committed data with NO way to
regenerate it, a gap that went unnoticed until a brand-new weapon needed
adding and there was nowhere to fetch it from. Source: the same Arikatsu
datamine repo, `BinData/weapon/weaponconf.json` (per-weapon `FirstPropId`
= base ATK + `FirstCurve`, `SecondPropId` = secondary stat + `SecondCurve`,
`DescParams[0].ArrayString` = rank 1-5 passive values) and
`BinData/property/weaponpropertygrowth.json` (flat `(CurveId, Level,
BreachLevel) -> CurveValue` table shared by all weapons). Confirmed every
one of 122 weapons uses `FirstCurve=1`/`SecondCurve=2` — only two curve
shapes exist in the whole game, not a per-weapon choice, though the script
still reads the ids off the data rather than hardcoding them. Verifies
byte-identical output against whatever's already committed for every
previously-known weapon id before writing anything, refusing to overwrite
on a mismatch.

**Rank-value regex only matched dotgg's format, not Kuro's** (found +
fixed 2026-08-20, `scripts/build_weapon_passive_bonuses.py`): dotgg's
`format_description()` output never wraps rank values in parens
(`"4%/5%/6%/7%/8%"`), but Kuro's own per-character weapon text does
(`"(12%/15%/18%/21%/24%)"`). The passive-bonus extraction regex was tuned
only against dotgg text (the only source fed into it until the Kuro
fallback above started adding entries), so it silently rejected every
Kuro-sourced weapon's passive as "no unconditional bonus found" — including
Kumokiri's and Glint of Clouds' plain, obviously-unconditional "ATK is
increased by X%." Fixed by making the surrounding parens optional in
`RANK_VALUES_RE` (literal `\(?`/`\)?`, not new capturing groups, so
existing `m.group(N)` call sites didn't need to change). Extraction went
from 40/118 to 56/118 weapons with zero regressions on the original 40.

**5 more dotgg entries have a cosmetically-broken name** — one 4★ per
weapon type (`21010034`/`21020034`/`21030034`/`21040034`/`21050034`) comes
back as e.g. `"Rectifier#25"` instead of a real name. Real icon and real
rank-scaled passive text, just no display name — dotgg hasn't localized
them and no character recommends any of the five, so there's no Kuro-side
name to fall back to either. Shown as-is rather than hidden (hiding them
would undercount the catalog); don't hand-guess a nicer name without a
real source.

## Agent API / LLM
Not FastAPI, not Groq — that was the original target design, superseded
before any of it was built. The real, live implementation (Supabase Edge
Function, Claude API, hand-rolled SSE) is documented in `agent.md` and
`architecture.md`'s "Decision: Edge Function, not FastAPI" — this file
covers game-data sources only (Kuro's guide API, dotgg.gg, the Arikatsu
datamine), not the agent's own API.

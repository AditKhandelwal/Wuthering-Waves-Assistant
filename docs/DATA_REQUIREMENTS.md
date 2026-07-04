# Data Requirements & Sourcing Status

Tracks game data needed beyond `data/wuwa_characters.json` (Kuro's guide API —
per-character *recommendations* only, not game-wide catalogs or scaling
curves). Status: ✅ confirmed · 🟡 inferred/partial · ❌ blocked.

**Primary supplementary source:** [Arikatsu/WutheringWaves_Data](https://github.com/Arikatsu/WutheringWaves_Data)
— raw datamined server config + text maps, the freshest of several
candidates checked (see git history of this file for the full evaluation
table if needed again). Re-clone and re-check recency before trusting it for
new work — these community repos update per patch.

**Fandom/Prydwen are blocked** for direct fetching by our tools (402/403
errors, domain-wide, not page-specific). Don't retry the same approach —
either get content pasted in directly, or find another path.

## What's actually built (data/*.json + frontend wiring)

| File | Contains | Confidence |
|---|---|---|
| `character_stat_curves.json` | Per-character level-1 base HP/ATK/DEF + universal growth-ratio curve by (level, breachLevel) | ✅ Confirmed — cross-checked against known Sanhua lvl 90 values |
| `weapon_stat_curves.json` | Per-weapon base ATK + universal ATK growth curve, rank-scaled passive values, secondary-stat base+curve | ✅ ATK confirmed exact match to a known reference (Spectral Trigger Crit. DMG 48.6% @ lvl 90). Secondary-stat **name** resolution: ATK/Crit. Rate/Crit. DMG/Energy Regen (propId 7/8/9/11) confirmed via cross-referencing `roleAttribute` gbId prefixes; ATK%/HP%/DEF% (propId 10007/10002/10010) are inferred by prevalence, not independently confirmed |
| `stat_icons.json` | Real in-game stat icons (17 types) | ✅ Extracted directly from `wuwa_characters.json`'s `roleAttribute`/`echoAttributes` — data we already had |
| `sequence_stat_nodes.json` | User-provided CSV of Left/Left-Mid/Right-Mid/Right stat bonuses (32/54 characters) | ❌ **Not used in the app** — built, then removed per user decision. Real screenshots showed the CSV was *incomplete* (only captured a "base" tier; a 2nd "advanced" tier exists per node, ~7/3 ratio observed but only confirmed for 2 of ~7 stat types). Kept as a reference file only, not shipped to frontend. Don't resurrect without either more screenshots or a working Fandom fetch |
| `echo_catalog.json` | 180 named echoes across cost 1/3/4, monster-tier category, sonata-set membership(s), `kuroGbId`+`pictureUrl` for the 31 signature echoes | ✅ Catalog + set membership from game8.co (fetched + parsed from raw HTML, not WebFetch summarization). 31/31 signature echoes (from `wuwa_characters.json`) matched by name and given real Kuro `gbId`/`pictureUrl`; the rest fall back to game8's own echo icon URLs |
| `echo_sets.json` | 34 sonata sets, flexible `effects[]` (`pieceCount`, `description`) — not fixed 2pc/5pc | ✅ From game8.co's "List of All Sonata Effects" page. Verification gate confirms every real `echoSetEffects[]` set name + piece-count from `wuwa_characters.json` (108 checked) is present; 76/108 match verbatim after normalization, the other 32 are minor wording paraphrases vs. Kuro's exact text (e.g. "Upon" vs "After") — same mechanic, not a data error. Confirmed non-2pc/5pc sets: 5 are 3pc-only (Crown of Valor, Dream of the Lost, Flamewing's Shadow, Law of Harmony, Thread of Severed Fate), 1 is 1pc-unique (Shadow of Shattered Dreams) |
| `echo_stat_curves.json` | `mainStatOptionsByCost` (1/3/4) with real values by level 0-25; `subStatOptions` (19 entries, discrete roll ladders + chances) | ✅ Main-stat values: **primary source is game8.co's own per-cost-tier tables** (its "+10/+15/+20/+25 Stat" columns), cross-checked stat-by-stat against wutheringlab.com (raw HTML parse, not WebFetch); each disagreement resolved by picking whichever source's rank-to-rank ratio pattern best fits its own cost tier — see "Echo main-stat sourcing" below for the two confirmed source bugs this caught. Substat roll ladders: community infographic (see below), count cross-validated against Arikatsu's 19-row `phantomsubproperty.json` |

## Confirmed data-linkage findings (expensive to re-derive, worth keeping)

- **`roleSkill.addPointTarget[]`** = the 5 leveled talents (Normal Attack, Resonance Skill, Forte Circuit, Resonance Liberation, Intro Skill), real names/icons/descriptions/`recommendLevel`. ✅ Reliable.
- **`roleSkill.fixedSkills[]`** = the 2 "Inherent Skill" passives (explicitly labeled in `skillType.texts[].name`). ✅ Reliable, always exactly 2 entries.
- **`roleSkill.addPointSequence[]`** — looks like it should map sequence nodes to boosted skills, but inspection showed it's just a near-duplicate of `addPointTarget` with a `linkNextType` field (UI graph hint, not a sequence-number link). Not useful for node→skill mapping.
- **`roleSkill.keynoteSkills[]`** = "Outro Skill" and "Tune Break" (real distinct `skillType.texts[].name` values, `gbId` 11/12) — ✅ confirmed a genuinely different field from `fixedSkills` (Inherent Skills), not the same thing under another name (an earlier note here conflated the two after a screenshot showed "Outro Skill"/"Tune Break" as circular nodes below the Forte tree — those are keynoteSkills, not Inherent Skills). Not leveled, no `recommendLevel`. Loaded via `loadKeynoteSkills()` in `frontend/src/lib/talents.ts`, rendered as their own row below the tree in both `TalentGrid.tsx` and `BuildCard.tsx`'s `TalentTree`.
- **Which sequence node / which Inherent Skill (`fixedSkills`) boosts which of the 5 talent columns**: ❌ **confirmed not derivable** from any source checked. Tried: raw `resonantchain.json` (all 6 nodes per character have identical `NodeType`, no skill link), text-matching a node's description against the 5 skill names (disproved by a real screenshot — Carlotta's "Flawless Purity" describes triggering off "Resonance Skill" but is positioned above "Forte Circuit" in-game). Current UI (both `TalentGrid.tsx` and `BuildCard.tsx`) stacks both Inherent Skills above Forte Circuit unconditionally as a labeled simplification — don't try to make this "accurate" without new data.
- **Weapon secondary-stat property IDs**: traced one down to a raw buff ID (`1102901001`) which turned out to reference a multi-hop `ExtraEffectParameters` chain ending in an unlabeled `GameAttributeID` enum — a real reverse-engineering task, not a quick lookup. Didn't finish; the propId-name mapping above is good enough for now.

## Echoes (Phase 0 complete — `scripts/fetch_echo_data.py`)

**Sourced 2026-07-02.** Full catalog (180 echoes, 3 cost tiers), 34 sonata sets
with flexible piece-count text, real main-stat values at every level 0-25 per
cost tier, and a real 19-entry discrete substat roll table — replacing the
earlier "show only the one recommended echo, no picker" placeholder plan.
Sources, combined deliberately by what each is actually good for (see
`scripts/fetch_echo_data.py`'s module docstring for the full account):

- **game8.co** ("List of All Echoes" + its 4-Cost/3-Cost/1-Cost subpages,
  "List of All Sonata Effects") — echo names, cost tier, monster-tier
  category, sonata-set membership, set bonus text, **and** (this session's
  key finding) the primary main-stat value source, via its own per-cost-tier
  "+10/+15/+20/+25 Stat" tables. Fetched and parsed from raw HTML with
  `requests`+`BeautifulSoup` (not WebFetch's summarizer) for the numeric
  tables.
- **wutheringlab.com** — main-stat Rank2-5 tables, used as a cross-check
  against game8, not the primary source (see "Echo main-stat sourcing"
  below for why).
- **Arikatsu/WutheringWaves_Data** — `phantomgrowth.json` (26-row, level 0-25,
  1.0x-5.0x growth curve, confirmed) used to interpolate the levels between
  main-stat anchor points; `phantomsubproperty.json`'s 19-row count used to
  validate the substat infographic transcription; `phantommainproperty.json`
  used as a structural (not numeric) cross-check that main-stat option menus
  are shared per cost tier.
- **Community substat infographic** ("WuWa Sub Stats", attributed
  `youtube.com/catalystonline`, Discord `.LowPriority`, user-provided
  2026-07-02) — transcribed literally into the script (not fetchable, it's a
  static image). 19 entries: 7 stats + 10 DMG-Bonus variants sharing one
  8-step ladder, plus ATK/DEF flat on a separate 4-step ladder. Both groups'
  chances sum to ~100%, and the total count (19) matches Arikatsu's
  `phantomsubproperty.json` row count exactly — the cross-check that made
  this the trusted substat source over wutheringlab's simpler ranges.

### Echo main-stat sourcing: two confirmed source bugs, not fetch bugs

The task's original suspicion was that a WebFetch AI summary had garbled
wutheringlab's 3-cost ATK row (`131/244/363/1000`, vs. every other stat's
smooth ~1.4-3.2x rank2→rank5 pattern). **Raw-HTML re-fetch confirmed the bad
numbers are really in that page's `<table>` cells** (no colspan/rowspan
trick) — the source page itself has the error, corroborated by a literal
typo in the same table ("Gavoc DMG" for "Havoc DMG"). game8.co's own
per-cost-tier tables give a clean, internally-consistent 3-cost ATK
progression (`31/44/63/100`) that fits the expected ratio pattern exactly —
this is now the value used.

The reverse also happened once: game8's own 4-cost Healing Bonus row
(`5.5/11.9/16.6/26.4`) has an internal outlier at rank2 (a 2.16x jump into
rank3, vs. every other 4-cost stat's ~1.4x), while wutheringlab's Healing
Bonus row (`8.5/11.9/16.3/26.0`) fits the tier's pattern cleanly. Likely a
copy-paste artifact (5.5% is also Crit. DMG's adjacent "+0" cell in that same
table). The script's `reconcile_main_stats()` catches both directions
automatically: for every stat where the two sources disagree, it scores each
candidate's rank-to-rank ratio pattern against that cost tier's median
pattern (computed from the tier's *other* stats) and keeps whichever fits —
game8 won 16/18 disagreements, wutheringlab won 1 (Healing Bonus), and 1 stat
(4-cost Energy Regen) was only listed by wutheringlab at all. Every
disagreement is logged in the script's normal run output, not silently
resolved.

### Every echo has 2 main stats: one static, one variable (superseded, 2026-07-03)

Earlier correction below turned out to be half right: flat ATK genuinely
isn't a *selectable* main-stat option, but it **is** a real main stat — just
a fixed, always-present second one, not a swappable choice. The user (real
in-game knowledge, confirmed against an actual echo card screenshot showing
two un-bulleted top lines: a chosen "Crit. Rate 22.0%" and a fixed
"ATK 150") clarified the real structure: **every echo has two main stats**,
one static/non-selectable and one variable/player-chosen:

- Cost 4 and cost 3: static = flat ATK, variable = the existing selectable
  menu (Crit Rate/Crit DMG/Energy Regen/Healing Bonus/ATK%/HP%/DEF% for
  cost 4; ATK%/HP%/DEF%/Energy Regen/elemental DMG Bonus for cost 3).
- Cost 1: static = flat HP, variable = ATK%/HP%/DEF% (previously HP was
  wrongly modeled as one of the *selectable* cost-1 options — it's always
  present instead, cost-1 never had HP% as its only choice-free stat).

`echo_stat_curves.json` now has a third top-level key, `staticMainStatByCost`
(`Record<1|3|4, EchoMainStatOption>`), alongside the existing
`mainStatOptionsByCost` (now the *variable-only* menu per cost). Both
`data/echo_stat_curves.json` and its frontend mirror were patched directly
(flat ATK values for cost 3/4 recovered from git history — they'd been fully
deleted by the original, incomplete fix); `fetch_echo_data.py`'s main-stat
loop now routes `STATIC_MAIN_STAT_NAME[cost]` into `staticMainStatByCost`
instead of dropping/keeping it in the selectable list.

This also resolves a question the original script's own verification gate
was already flagging (`echoAttributes[].attribute`/`attribute2` in
`wuwa_characters.json` — `attribute2` is exactly this static stat).

### Echo substats: elemental DMG Bonus excluded, attack-type DMG Bonus included (superseded again, 2026-07-04)

The 2026-07-03 correction below went too far in one direction. Real
screenshots provided while scoping the echo-screenshot-import feature (4
independent echo cards) directly contradicted it: each one shows an
attack-type DMG Bonus name (Basic Attack DMG Bonus, Heavy Attack DMG Bonus,
Resonance Skill DMG Bonus — Resonance Liberation DMG Bonus not seen yet but
presumed parallel) as a genuine "+"-prefixed substat row, and every observed
value (10.1%, 7.9%, 8.6% ×2, 7.1%) is an exact hit on the same 8-step ladder
`[6.4, 7.1, 7.9, 8.6, 9.4, 10.1, 10.9, 11.6]` this data already had recorded
(and had briefly removed) for that stat group. **Elemental** DMG Bonus
(Glacio/Fusion/Electro/Aero/Spectro/Havoc) stays excluded as a substat — no
screenshot has ever shown it in a substat row, consistent with it being
main-stat-only (cost-3 echoes, see above).

Real substat pool is 13: HP, HP%, ATK, ATK%, DEF, DEF%, Crit. Rate, Crit.
DMG, Energy Regen, plus Basic/Heavy Attack DMG Bonus and Resonance
Skill/Liberation DMG Bonus. `subStatOptions` in `echo_stat_curves.json` is
back up from 9 to 13 entries; `build_substat_options()` in
`scripts/fetch_echo_data.py` emits `GROUP_A_DMG_STAT_NAMES` again (now
holding just the 4 attack-type names, not all 10 from the original
over-inclusive assumption). Arikatsu's `phantomsubproperty.json` (19 rows)
still isn't treated as confirming this exact count — it's not a reliable
source for that on its own, just cross-referenced for these 13.

### Rank → level derivation (confirmed, not guessed)

**Rank 2 = level 10, Rank 3 = level 15, Rank 4 = level 20, Rank 5 = level
25.** Confirmed directly: game8's per-cost-tier tables are literally labelled
"+10 Stat" / "+15 Stat" / "+20 Stat" / "+25 Stat" (one table per breakpoint),
and those columns' values match wutheringlab's "Rank 2/3/4/5" columns exactly
for two independent stats (4-cost ATK and 4-cost Crit. Rate). A naive
curve-fit against Arikatsu's `phantomgrowth.json` was tried *first* and does
**not** reproduce this mapping (the curve's ratio shape at levels 10/15/20/25
is `[1.0, 1.31, 1.62, 1.92]`, but the real stat ratios are closer to
`[1.0, 1.4, 2.0, 3.1]`) — i.e. `phantomgrowth.json`'s `GrowthId=1` curve is
now confirmed to **not** be the function that scales echo main stats
level-to-level; it's used only to interpolate the *shape* of the untested
levels between the 4 real anchor points (and to extrapolate levels 0-9 below
the first anchor), never to override a confirmed value.

### Rejected decoy source

A `wuwa_api` repo (found in this session's scratchpad alongside the Arikatsu
clone) has pre-parsed echo/sonata JSON that is very likely fabricated:
unverifiable echo/set names, wrong piece-count thresholds inconsistent with
the confirmed 2pc/5pc-and-other structures documented above, and dead Fandom
wikia image URLs. **Not used as a source for `fetch_echo_data.py` or
anything else in this app.** Flagged here (and in the script's own
docstring) so it isn't mistaken for a legitimate source and re-trusted later
if rediscovered.

## Still blocked / not started

- **Damage formula** (the full per-hit formula: `DMG = Base × Resistances × Bonuses`, `%DEF = (800+8×LVL_atk)/(800+8×LVL_atk+DEF_target×(1-DEF_ignore))` capped 200%) — still not wired in. Partially superseded: the *final-stats* half (base+weapon+echoes → HP/ATK/DEF/Crit Rate/Crit DMG/Energy Regen/DMG Bonus categories, using the universal base constants Crit Rate 5%/Crit DMG 150%/Energy Regen 100%, none of which exist in this app's data) **is** now wired in — see `frontend/src/lib/finalStats.ts`. What's still missing is the actual per-hit damage calculation (resistances, DEF mitigation, crit expected-value) on top of those final stats.
- **Echo set-bonus effects (2pc/5pc) as structured stat deltas** — still just free-text `description` strings (`echo_sets.json`), not parsed into machine-usable stat contributions. Deliberately not attempted (see `computeActiveSetBonuses` in `lib/echoes.ts`) — shown as read-only tags, not folded into any total.
- **Cost-3 static main-stat (flat ATK) curve is wrong at intermediate levels** (found 2026-07-04, testing the echo-screenshot-import feature against a real Kronablight card): level 0 and level 25 both check out exactly against real cards (see the three other confirmed matches below), but level 20 — one of the app's own "confirmed rank anchor" points (Rank 4, per the rank→level derivation section above) — computes 63 when the real card shows 84. Endpoints being right but an interior anchor being wrong suggests either a transcription error specific to this one value in the original per-rank source table, or that the static-ATK curve was never actually validated at its interior anchors the way the variable main-stat curves were (it was "recovered from git history," i.e. pulled from an earlier already-computed table, not freshly re-sourced — see "Every echo has 2 main stats" above). Confirmed-correct static-stat endpoints from real cards: cost 1 HP @ level 25 = 2280 ✓, cost 4 ATK @ level 25 = 150 ✓, cost 3 ATK @ level 25 = 100 ✓. Needs more real screenshots (ideally several cost-3 echoes at varied levels) to pin down the actual intermediate curve before touching the data — don't guess-patch a single value. The same Kronablight card also showed the cost-3 *variable* main stat (Fusion DMG Bonus) at level 20 reading 18.9 in this app's data vs. 25.2 on the real card — same symptom (endpoints untested here, but consistent with the static-ATK finding), rolled into this same open item rather than treated separately.
- **Main-stat `addType` was wrong for 10 names, now fixed**: `STAT_PROP_INFO` in `scripts/fetch_echo_data.py` had Crit. Rate, Crit. DMG, Healing Bonus, Energy Regen, and all 6 elemental DMG Bonus variants hardcoded as `addType: 1` (flat) — wrong unconditionally, since none of these have a flat form as a variable main-stat option (only the separate *static* stat, HP/ATK, is ever flat). Unlike the curve-value issue above, this needed no new data to confirm (DMG Bonus/Crit/Energy Regen are always percentages in-game) and was fixed directly: `STAT_PROP_INFO` corrected, both `echo_stat_curves.json` copies patched (11 entries). Substats were unaffected — `build_substat_options()` already had these right, this bug was isolated to `mainStatOptionsByCost` construction. Caught because the frontend's OCR-import decimal-recovery logic (`frontend/src/lib/echoOcrParse.ts`) gates its "maybe the OCR dropped a decimal point" retry on `addType === 2`, so a wrong `addType` silently broke OCR matching for these stats specifically — a good example of why this field being correct actually matters beyond display formatting.

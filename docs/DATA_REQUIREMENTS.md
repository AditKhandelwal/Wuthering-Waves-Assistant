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
- **Which sequence node / which Inherent Skill boosts which of the 5 talent columns**: ❌ **confirmed not derivable** from any source checked. Tried: raw `resonantchain.json` (all 6 nodes per character have identical `NodeType`, no skill link), text-matching a node's description against the 5 skill names (disproved by a real screenshot — Carlotta's "Flawless Purity" describes triggering off "Resonance Skill" but is positioned above "Forte Circuit" in-game). Current UI handles this by stacking both Inherent Skills above Forte Circuit unconditionally as a labeled simplification — don't try to make this "accurate" without new data.
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

### Flat ATK is not a real main-stat option (user correction, 2026-07-03)

Both game8 and wutheringlab's cost-3/cost-4 tables include a flat "ATK" row
alongside "ATK%", and `reconcile_main_stats()` happily resolved it like any
other stat (see the 3-cost ATK progression `31/44/63/100` above). The user
(real in-game knowledge) confirmed no echo main-stat menu at any cost tier
actually offers flat ATK — only ATK%. Likely bleed-over from a substat table
on one or both source sites (flat ATK **is** a legitimate substat, see
`build_substat_options()`). Fixed by excluding `stat_name == "ATK"` when
building `mainStatOptionsByCost` in `fetch_echo_data.py` — don't re-add it
without new evidence.

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

- **Damage formula** — fully documented on Fandom (not from raw data): `DMG = Base × Resistances × Bonuses`, `%DEF = (800+8×LVL_atk)/(800+8×LVL_atk+DEF_target×(1-DEF_ignore))` capped 200%, base Crit DMG 150%. Not yet wired into any UI computation.

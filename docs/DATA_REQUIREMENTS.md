# Data Requirements Checklist

Tracks the game data we need beyond `data/wuwa_characters.json` (which only has
per-character *recommendations* pulled from Kuro's guide API — not game-wide
catalogs, roll ranges, or damage formulas). Status: ✅ have it · 🟡 partial ·
❌ need it. Priority: 🔴 blocking (schema/logic depends on it) · 🟢 nice-to-have
(assets, can lag).

**Reference:** [wuwaflex.com/builder](https://wuwaflex.com/builder) is a close
match for the manual build-entry UX we want (character select → level/weapon/
sequence-node/talent-node state → 5 echo slots with sonata/main stat/substat
pickers). Their goal is a shareable build card; ours is structured state the
agent can query. Same underlying data model either way — their screenshots
corrected two assumptions below (see items marked "corrected via wuwaflex").

**Primary data source (confirmed 2026-07-02):** [Arikatsu/WutheringWaves_Data](https://github.com/Arikatsu/WutheringWaves_Data)
— raw datamined server config (`BinData/`) + full text maps (`Textmaps/en/`),
last updated for GameVer 3.4.0 (2026-06-12), the most current of the four repos
checked. This is the actual source of truth the game client itself reads from
— not a wiki transcription. Evaluated alternatives:

| Repo | Verdict | Why |
|---|---|---|
| [Arikatsu/WutheringWaves_Data](https://github.com/Arikatsu/WutheringWaves_Data) | ✅ **use this** | Freshest (3.4.0, Jun 2026), same raw config schema as Dimbreath, has all files identified below |
| [Dimbreath/WutheringData](https://github.com/Dimbreath/WutheringData) | 🟡 cross-check only | Same schema, ~3 patches stale (3.1.19, Mar 2026); flatter folder layout makes it faster to browse for spot-checks |
| [alt3ri/WW_Data](https://github.com/alt3ri/WW_Data) | ❌ skip | Dead since Aug 2024 (GameVer 1.1.0) |
| [FahriAdison/wuwa_api](https://github.com/FahriAdison/wuwa_api) | ❌ skip as primary | Stale (Apr 2025, "v2.2"), and its parsed `substats.json` collapses each substat to a lossy min/max — contradicts the discrete enumerated roll list confirmed by the wiki and wuwaflex. Only useful as an API-shape reference |

Both Arikatsu and Dimbreath require parsing: numeric IDs (`PropId`, text-map
keys like `WeaponConf_21010074_WeaponName`) need resolving against
`Textmaps/en/`, and values are integer-scaled (e.g. `10000` = 1.0×, roll value
`375` = 3.75%) — needs a small parsing pass, not a raw dump.

## 1. Echo mechanics (🔴 blocking — shapes `user_echoes` schema)

| Item | Status | Notes |
|---|---|---|
| Echo leveling breakpoints (0-25, substat unlock every 5 levels) | 🟡 | Source found: `phantom/phantomlevel.json` in Arikatsu. Also independently confirmed by Fandom wiki (Echo/Stats page): 1 slot unlocks per 5 levels, max 5 at level 25 |
| Main stat value per (stat type, echo level) | 🟡 | Source found: `phantom/phantommainproperty.json` + `phantom/phantommainpropitem.json` in Arikatsu — deterministic lookup, confirms the wuwaflex correction |
| Main stat pool per cost tier (1/3/4-cost) | 🟡 | Source found: `phantom/phantomquality.json` (cost/rarity) cross-referenced with `phantommainproperty.json`'s `RandGroupId`/`PropGroup` fields |
| Substat pool (full list: Crit Rate, Crit DMG, ATK%, ATK flat, HP%, HP flat, DEF%, DEF flat, Energy Regen, all elemental DMG bonuses, Basic/Heavy/Skill/Liberation DMG bonus) | 🟡 | Source found: `phantom/phantomsubproperty.json` (19 entries) — `PropId` needs resolving to a stat name via a property-name text map (not yet located, likely `PropertyResource`-style file) |
| Substat valid roll values (per substat) | 🟡 | Source found: `phantom/phantomsubproperty.json` gives `SubStandardProperty` (base roll unit, integer-scaled — e.g. `375` → 3.75%) and `AddType`; need to confirm how `AddType` generates the 8-value enumerated set (likely `SubStandardProperty × [0.8, 0.9, 1.0 ... 1.4]` roll tiers) — needs a parsing pass, cross-check against Fandom wiki's published values |
| Substat count by level (1 substat unlocked per breakpoint, max 5) | 🟡 | Same source as leveling breakpoints — `phantomlevel.json` |
| Full echo set catalog (all sets, 2pc/5pc effects) | 🟡 | Likely in `phantom/phantomfetter.json` / `phantomfettergroup.json` (fetter = set bonus in this codebase's naming) — not yet opened/verified |
| Full echo catalog (every echo, which sets it can drop with, its cost tier) | 🟡 | Source found: `phantom/phantominfo.json` — not yet opened/verified for completeness |

## 2. Damage formula / combat math (🔴 blocking — needed for `evaluate_echo` / build scoring)

| Item | Status | Notes |
|---|---|---|
| Damage formula (ATK × multiplier × crit × elemental bonus × resistance/defense) | ✅ | `calculationData` in `wuwa_characters.json` is always `null` (Kuro's API doesn't expose it), but the formula is fully documented on [Fandom — Damage](https://wutheringwaves.fandom.com/wiki/Damage): `DMG = Base DMG × Resistances × Bonuses` |
| Resistance/defense reduction formula | ✅ | `%DEF = (800 + 8×LVL_atk) / (800 + 8×LVL_atk + DEF_target×(1-DEF_ignore))`, capped at 200%. Documented on Fandom — Damage page |
| Stat scaling curves (how flat ATK/HP/DEF scale with character/weapon level) | 🟡 | Source found: `property/rolepropertygrowth.json` (character) and `property/weaponpropertygrowth.json` (weapon) in Arikatsu — both give per-level curve ratios (e.g. `AtkRatio: 10842` = 1.0842×) |
| Crit rate/DMG stacking rules (cap behavior, whether values compound or add) | 🟡 | Base Crit DMG 150% documented on [Fandom — Crit. DMG](https://wutheringwaves.fandom.com/wiki/Crit._DMG); stacking/cap behavior for user-added substats not yet verified against raw data |
| Per-skill talent level → multiplier scaling (needed to score a build's damage, not just its stats) | 🟡 | Source found: `skill/skilllevel.json` in Arikatsu — not yet opened/verified |

## 3. Weapon data (🟡 partial — have recommendations, missing full catalog)

| Item | Status | Notes |
|---|---|---|
| Per-character recommended weapons + passive text | ✅ | In `wuwa_characters.json` → `weapon.items` |
| Full weapon catalog (all weapons per type, not just recommended) | 🟡 | Source found: `weapon/weaponconf.json` in Arikatsu (118 weapons) — has `FirstPropId`/`SecondPropId` (base stat + value), `FirstCurve`/`SecondCurve` (level curve refs), and `ResonLevelLimit`. Names need resolving via `Textmaps/en/` |
| Weapon base ATK + secondary stat curve by **level** (1-90) | 🟡 | Source found: `property/weaponpropertygrowth.json` (192 entries: `CurveId`, `Level`, `BreachLevel`, `CurveValue`) — join on `weaponconf.json`'s `FirstCurve`/`SecondCurve` to get the actual stat at any level |
| Weapon ascension/breach thresholds | 🟡 | Source found: `weapon/weaponbreach.json` (963 entries) — level-up material costs and breach-level gating |
| Passive effect magnitude by **rank** (R1-R5) | ✅ | Confirmed structure: `weaponconf.json`'s `DescParams[].ArrayString` already contains the 5 rank-scaled values (e.g. `["4%","6.2%","8.4%","10.6%","12.8%"]`) in order R1→R5 — same pattern already visible in `wuwa_characters.json`'s passive description text, just needs structured parsing instead of regex on the description string |

## 4. Resonator (character) data (✅ mostly covered)

| Item | Status | Notes |
|---|---|---|
| Names, element, star rank, role tags | ✅ | `role` section |
| Skill descriptions, rotation notation | ✅ | `baseTexts`, `roleSkill` |
| Stat thresholds (target Crit Rate/DMG etc.) | ✅ | `roleAttribute.items` |
| Team comp recommendations | ✅ | `introductionDetail` (needs HTML/text parsing) |
| Character portraits/card art | ✅ | `role.cardPictureUrl`, `illustrationPictureUrl` |
| Talent/skill icons | 🟡 | Present under `roleSkill`, not yet verified for completeness across all 46 |

## 5. Character build state (🔴 blocking — `user_characters` schema is missing these)

New requirements surfaced by the wuwaflex reference — `database.md`'s current
`user_characters` table only has `resonance_level INTEGER` (0-6), which isn't
granular enough to match what a real build needs:

| Item | Status | Notes |
|---|---|---|
| Per-skill talent levels (Normal Attack, Resonance Skill, Forte Circuit, Resonance Liberation, Intro Skill — each 1-10) | 🟡 | Not in current schema at all — schema gap, not a data gap. Source for the scaling itself found: `skill/skilllevel.json` in Arikatsu |
| Sequence node state (nodes 1-6, individually toggleable) | 🟡 | Current schema only stores a count (`resonance_level`); wuwaflex shows discrete node toggles — functionally equivalent if nodes always unlock in order 1→6, but worth confirming they can't be unlocked out of order before assuming a single int is sufficient |
| Character level (1-90) — main stat (ATK) + secondary stat curve | 🟡 | `character_level` column exists; curve source found: `property/rolepropertygrowth.json` in Arikatsu (96 entries: `Level`, `BreachLevel`, `LifeMaxRatio`, `AtkRatio`, `DefRatio`) |

**Decision needed:** should `database.md` be updated now to add a talent-levels
field (JSONB or a separate `user_talent_levels` table) and clarify sequence
node storage, or defer until we're actually building the character-entry
screen? Recommend deferring the schema edit itself but locking in the
requirement here so it doesn't get missed.

## 6. Echo assets (🟢 nice-to-have, defer to as-you-go)

| Item | Status | Notes |
|---|---|---|
| Icon per echo (full catalog, not just recommended) | 🟡 | Only recommended echoes have `echoProps.pictureUrl` today |
| Echo set icons | 🟡 | Same limitation |

## 7. Weapon assets (🟢 nice-to-have)

| Item | Status | Notes |
|---|---|---|
| Weapon icons | ✅ | Present for recommended weapons via `weapon.items[].pictureUrl` |
| Icons for non-recommended weapons | ❌ | |

## 8. Talent/symbol assets (🟢 nice-to-have)

| Item | Status | Notes |
|---|---|---|
| Talent tree / skill symbol icons | 🟡 | Partial via `roleSkill`, needs audit |

---

## Sourcing plan

- **Sections 1, 2, 3, 5 (🔴 blocking):** superseded — primary source is now `Arikatsu/WutheringWaves_Data` (see table above), not wiki scraping. Every blocking item has an identified source file; remaining work is a parsing pass (resolve text-map keys, un-scale integer values, join curve tables to base stats), not further hunting. Fandom wiki stays useful as a cross-check / sanity-check against the parsed output, and is already sufficient on its own for the damage formula (Section 2), which doesn't need raw datamining since it's fully documented.
- **Sections 6-8 (assets):** defer. Pull lazily per-character as we build out that character's page. Note Arikatsu's `Textmaps/en/` (46MB) covers all display strings, but image assets are a separate concern — still need to check whether the repo also ships icon files or just string/numeric config.

## Next steps (not yet done)

1. Open and verify the still-unopened files flagged 🟡 above: `phantomfetter.json`/`phantomfettergroup.json` (echo sets), `phantominfo.json` (echo catalog), `skilllevel.json` (talent scaling), and locate the property-name text map that resolves `PropId` → stat name in `phantomsubproperty.json`.
2. Confirm the roll-tier math for substats (`SubStandardProperty` × `AddType` → the 8 enumerated values) against the Fandom wiki's published numbers as a correctness check.
3. Decide whether to write a one-time ingestion script (parse Arikatsu's raw config → clean JSON/DB seed, similar in spirit to `wuwa_api`'s `data/` folder but current and complete) versus pulling from the repo live. A one-time parse + commit to `data/` is more consistent with how `wuwa_characters.json` is already handled (per `conventions.md`: seeded data is committed).
4. Re-run this same recency check before each content update, since these community repos update per patch — don't treat today's `arikatsu` clone as permanently current.
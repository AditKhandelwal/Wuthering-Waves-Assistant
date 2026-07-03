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

## Confirmed data-linkage findings (expensive to re-derive, worth keeping)

- **`roleSkill.addPointTarget[]`** = the 5 leveled talents (Normal Attack, Resonance Skill, Forte Circuit, Resonance Liberation, Intro Skill), real names/icons/descriptions/`recommendLevel`. ✅ Reliable.
- **`roleSkill.fixedSkills[]`** = the 2 "Inherent Skill" passives (explicitly labeled in `skillType.texts[].name`). ✅ Reliable, always exactly 2 entries.
- **`roleSkill.addPointSequence[]`** — looks like it should map sequence nodes to boosted skills, but inspection showed it's just a near-duplicate of `addPointTarget` with a `linkNextType` field (UI graph hint, not a sequence-number link). Not useful for node→skill mapping.
- **Which sequence node / which Inherent Skill boosts which of the 5 talent columns**: ❌ **confirmed not derivable** from any source checked. Tried: raw `resonantchain.json` (all 6 nodes per character have identical `NodeType`, no skill link), text-matching a node's description against the 5 skill names (disproved by a real screenshot — Carlotta's "Flawless Purity" describes triggering off "Resonance Skill" but is positioned above "Forte Circuit" in-game). Current UI handles this by stacking both Inherent Skills above Forte Circuit unconditionally as a labeled simplification — don't try to make this "accurate" without new data.
- **Weapon secondary-stat property IDs**: traced one down to a raw buff ID (`1102901001`) which turned out to reference a multi-hop `ExtraEffectParameters` chain ending in an unlabeled `GameAttributeID` enum — a real reverse-engineering task, not a quick lookup. Didn't finish; the propId-name mapping above is good enough for now.

## Still blocked / not started

- **Echoes** — no full catalog independent of per-character recommendations, no enumerated substat roll values, no main-stat-by-level lookup. Sources were identified in Arikatsu (`phantom/phantomsubproperty.json`, `phantommainproperty.json`, `phantomlevel.json`, `phantomfetter*.json`, `phantominfo.json`) but never parsed — this is the next real chunk of sourcing work when Echoes gets built. Current plan (see project plan history): show only the one real recommended echo per slot, no picker, until this is done.
- **Damage formula** — fully documented on Fandom (not from raw data): `DMG = Base × Resistances × Bonuses`, `%DEF = (800+8×LVL_atk)/(800+8×LVL_atk+DEF_target×(1-DEF_ignore))` capped 200%, base Crit DMG 150%. Not yet wired into any UI computation.

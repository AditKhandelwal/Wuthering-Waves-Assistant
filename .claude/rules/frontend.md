# Frontend

Stack: React 19 + Vite + TypeScript, Tailwind v4. Dark theme with gold
accents — tokens defined in `frontend/src/index.css`'s `@theme` block
(`--color-bg`, `--color-panel`, `--color-gold`, `--color-element-*`, etc.).

## Data loading pattern

Every `frontend/src/lib/*.ts` loader fetches a JSON file from
`frontend/public/data/` (e.g. `loadRoster()` fetches `/data/wuwa_characters.json`).
This stands in for a future backend endpoint — swap the fetch URL there when
a real API exists, not at each call site.

**The source JSON lives in `data/` at the repo root; the frontend reads its
own copy in `frontend/public/data/`.** Whenever a file in `data/` is
regenerated, copy it to `frontend/public/data/` too — this is easy to forget
and causes silent stale-data bugs (the app keeps working, just on old data).

## Tailwind v4 gotchas

- **Dynamically-built class strings generate no CSS.** Tailwind scans
  source *text* for complete literal class name strings — it does not
  evaluate JS at build time. A class name assembled via a template-literal
  helper function (e.g. `` `[border-color:${color}]` ``) never appears as a
  complete string anywhere in the source, so Tailwind generates zero CSS for
  it — the class shows up correctly in the DOM's `className` attribute (so
  it *looks* right when inspected) but has no effect. Fix: spell out each
  variant's class string fully and literally, one per case (see
  `ELEMENT_PORTRAIT_CLASS`/`ELEMENT_RING_CLASS` for the working pattern).
- **`clip-path` clips away box-shadow AND filter effects on the same
  element** (corrected 2026-07-03 — an earlier version of this note claimed
  `filter: drop-shadow` was the fix and "respects" clip-path; isolated
  side-by-side test proved that wrong). A Tailwind `ring-*`/`shadow-*` *or*
  `filter:drop-shadow(...)` on an element that also has `clip-path` (e.g.
  `.clip-corner`) barely shows any outward glow — clip-path clips the
  filter's rendered output too, cutting off the blur right at the shape's
  own edge. The actual fix: put `filter`/`animation` on an **outer wrapper
  div with no clip-path of its own**, nesting the clipped/bordered element
  inside it — the wrapper's filter then glows around the already-clipped
  shape instead of being clipped itself. See `ELEMENT_PORTRAIT_BORDER_CLASS`
  (inner, clipped) vs `ELEMENT_PORTRAIT_GLOW_CLASS` (outer wrapper) in
  `frontend/src/lib/characters.ts`, used in `BuildCard.tsx` and
  `BuildScreenPage.tsx`. Don't trust "does the computed `filter` value
  change over time" (e.g. via `getComputedStyle` in a script) as proof a
  glow is *visible* — it can be technically animating and still be entirely
  invisible on screen if this wrapper structure is missing; confirm with an
  actual before/after screenshot crop around the element's edge instead.
- **Static vs. animated glow, same element, different classes**: this
  project deliberately keeps the character-select ring's glow *animated*
  (pulsing, `glow-glacio` etc. keyframes in `index.css`) while the larger
  build-card/build-screen portraits use a *fixed, non-pulsing*
  `filter:drop-shadow(...)` (`ELEMENT_PORTRAIT_GLOW_CLASS`) — this was an
  explicit user preference, not an oversight. Don't unify them without
  being asked.

## Common layout bug: numeric readouts resizing

A number/label sitting next to a `flex-1` or `w-full` sibling in a flex row
can get compressed below its own declared width (classic `min-width: auto`
flexbox behavior) once the number gets wider (e.g. 1 digit → 2 digits),
causing it to wrap onto a second line and grow the whole container's height.
Fix: give the flexible sibling `min-w-0`, and give the readout `shrink-0` +
a fixed width + `whitespace-nowrap` + `tabular-nums`. Hit this twice
(the level readout, then `StatBox`) — check for it whenever a number is
rendered next to a slider or other flexible element.

## Recoloring icon images

Real game icons pulled from Kuro's CDN are dark/colored PNGs on transparent
backgrounds. To render them white against the dark theme:
`className="brightness-0 invert"` on the `<img>`. If the icon still looks
faint after that, the source art has soft/semi-transparent pixels (glow
effects, anti-aliased edges) — `brightness`/`invert` don't touch the alpha
channel, so no amount of color filtering fixes it. Instead, stack two
identical `<img>` copies absolutely positioned on top of each other; the
compounded partial-alpha reads as solid white. Used in `SequenceNodeRow` and
`TalentGrid`.

## Forte Circuit stat bonus nodes

8 togglable nodes per character (4 columns × 2 tiers). Data lives in
`data/sequence_stat_nodes.json` (source) and `frontend/public/data/`
(frontend copy — keep in sync). Loaded per-character via
`frontend/src/lib/forteNodes.ts`.

**Stat value types — critical distinction:** Even nodes named `"ATK"`,
`"HP"`, or `"DEF"` are **percentage multipliers**, not flat values. In
`computeFinalStats` (`finalStats.ts`) they are added to the `%` bucket
(`atkPercent`, `hpPercent`, `defPercent`) that scales the base stat. `"Crit.
Rate"`, `"Crit. DMG"`, `"Healing Bonus"`, and element DMG bonus names are
direct additives. Getting this wrong produces subtly incorrect numbers that
look plausible — verify with a toggle-on/toggle-off ATK comparison.

**Flat index formula:** `colOrderIndex * 2 + tierIndex`. Column order:
`normal_attack(0)`, `resonance_skill(1)`, `resonance_liberation(2)`,
`intro_skill(3)`. `tierIndex 0` = lower tier (closer to skill diamond),
`tierIndex 1` = upper tier (further from skill, renders at top of column in
the UI). The UI renders `[1, 0]` so upper appears first visually.

**Icons in node buttons:** Stat icons come from `stat_icons.json` (same map
used by echo stat summary). The stat names in `sequence_stat_nodes.json`
match the icon keys exactly (e.g. `"Crit. Rate"`, `"ATK"`, `"Glacio DMG
Bonus"`). The double-stacked `<img>` pattern (`brightness-0 invert`) is
needed for solid rendering — same as all other game icons in this project.

## Verifying UI changes

No project-specific run skill exists yet. Pattern used throughout: start
the dev server (`cd frontend && npm run dev`), then drive it with Playwright
(`npx playwright@latest install chromium` once, then a short `.mjs` script
using `chromium.launch()` — see conversation history for examples) to
screenshot the actual rendered result. Don't just type-check and assume —
several bugs in this project only showed up visually (icons invisible
despite "correct" filters, layout resizing, wrong badge styling).

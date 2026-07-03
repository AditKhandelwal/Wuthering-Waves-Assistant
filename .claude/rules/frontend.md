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
- **`clip-path` clips away box-shadow-based effects entirely** — a
  Tailwind `ring-*` or `shadow-*` on an element that also has `clip-path`
  (e.g. the `.clip-corner` utility) won't render, because box-shadow paints
  outside the clipped region. Use `border-color` + `filter: drop-shadow(...)`
  instead — both respect `clip-path` and will hug the actual clipped shape,
  angular corners included.

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

## Verifying UI changes

No project-specific run skill exists yet. Pattern used throughout: start
the dev server (`cd frontend && npm run dev`), then drive it with Playwright
(`npx playwright@latest install chromium` once, then a short `.mjs` script
using `chromium.launch()` — see conversation history for examples) to
screenshot the actual rendered result. Don't just type-check and assume —
several bugs in this project only showed up visually (icons invisible
despite "correct" filters, layout resizing, wrong badge styling).

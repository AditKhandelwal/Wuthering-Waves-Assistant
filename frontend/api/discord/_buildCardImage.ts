// Composes the real Build Card image for /build (see discord.md) -- not a
// Discord route itself (no default export, hence the leading underscore,
// Vercel's own convention for "not an endpoint" files under api/).
//
// v5 (same day as v3/v4) -- a direct comparison against a real site
// screenshot wasn't enough; this version instead transcribes EXACT
// Tailwind values from the real component source
// (frontend/src/components/BuildCard.tsx, FinalStatsGrid.tsx,
// EchoCardTile.tsx, StatIcon.tsx, TalentGrid.tsx) rather than
// approximating by eye. Concrete corrections this found: forte stat-bonus
// nodes are CIRCLES (ForteNodeDisplay, rounded-full), not diamonds --
// only the main talent icon, inherent-skill nodes, and sequence/
// resonance nodes are rotated diamonds. The main talent diamond is 32px
// (h-8 w-8), not 46px. The weapon icon is 64px (h-16 w-16), not 48px.
// StatIcon (used in the final-stats panel, weapon panel, and echo tiles)
// is NEVER inverted -- only SolidIcon (talent/inherent/forte/sequence/
// keynote icons) gets brightness-0 invert. Echo portraits are small 36px
// circles with a cost-tier-colored ring (COST_DISC_CLASS) and a small
// sonata-set badge overlaid on the corner, not a large rectangular hero
// image. The final-stats panel is ONE bordered box with an internal
// 2-column CSS grid and divider lines between rows, not separate boxed
// tiles. Every spacing value below (gaps, padding) is the literal pixel
// value of the Tailwind class in the real source, at 1rem = 16px.
//
// This is a composed re-creation pulling the same underlying DATA the
// live site's BuildCard.tsx uses, NOT a screenshot of that component -- a
// real headless-browser screenshot was considered and rejected: the full
// @sparticuz/chromium binary (70MB unpacked) exceeds Vercel's standard
// Node function size limit, and a hosted screenshot API trades that for
// an external paid dependency with its own rate limits. This renders in
// under a second of actual compute (network image fetches dominate wall
// time) with no browser at all.
//
// Built with satori (layout) + @resvg/resvg-js (rasterize to PNG, the
// NATIVE binary addon, not the WASM variant) -- this renders inside
// build-card.ts, a real Node function, so satori's latest version (with
// its harfbuzzjs dependency) and a native resvg binary both just work via
// normal npm resolution. See discord.md for why this differs from
// /builds' earlier Edge-runtime image attempt.
//
// Deliberately NOT JSX -- satori accepts any React-element-shaped tree,
// and a plain {type, props} object literal is exactly that shape without
// needing a .tsx extension or a JSX pragma in tsconfig.api.json. Satori
// requires an explicit `display: "flex"` (or "none") on every element
// with children -- it doesn't support default block layout like a real
// browser. clip-path (the real card's `.clip-corner` panel shape) has no
// satori support at all -- plain rounded corners stand in for it.
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { geistRegularFont } from "./_fontData.js";
import type { FinalStats } from "./stats.js";

// Exact tokens from frontend/src/index.css's @theme block -- kept in sync
// by hand (no build-time import across the Vite/satori boundary), check
// that file if this card's palette ever looks off from the real site.
const BG = "#0d0d0f";
const PANEL = "#161618";
const PANEL_ALT = "#1c1c1f";
const BORDER = "#2a2a2e";
const GOLD = "#c9a24b";
const GOLD_SOFT = "#d4af6a";
const TEXT = "#eaeaea";
const TEXT_MUTED = "#8a8a8f";
const ELEMENT_COLOR: Record<string, string> = {
  Glacio: "#6fb7e8",
  Fusion: "#e2643c",
  Electro: "#b47cf0",
  Aero: "#5fd6b0",
  Spectro: "#e8c25f",
  Havoc: "#b4467a",
};
// COST_DISC_CLASS in frontend/src/lib/echoes.ts -- the ring color around
// an echo's small portrait circle, by cost tier.
const COST_RING_COLOR: Record<1 | 3 | 4, string> = { 4: GOLD, 3: `${GOLD_SOFT}99`, 1: BORDER };

// v5 used a much wider canvas (1880px) sized to fit 5 echo tiles at a
// generous 310px each -- real enough to avoid satori's box-sizing/overflow
// bugs (see the comment on flexCol/flexRow below), but far wider than the
// real site ever renders this card: BuildScreenPage.tsx renders BuildCard
// inside `mx-auto max-w-6xl px-8` (1152px, minus 64px of padding = 1088px
// of actual content width), not anything close to 1880px. That mismatch is
// what a user flagged as "spacing where it doesn't need to be" -- the
// talent row's `justify-content: space-between` (an exact copy of the real
// TalentTree's `justify-between`, see talentColumn() below) is correct
// Tailwind, but on a canvas 800px wider than the real card it spreads 5
// talent columns across a enormous gap that never exists on the actual
// site. Fix: match the real card's proportions instead of sizing the
// canvas off an arbitrarily generous echo-tile width. WIDTH is now
// computed the same direction as before (right column's needs -> overall
// width) but off a tile width close to the real site's own (see
// ECHO_TILE_WIDTH below) instead of a padded-out guess.
const PORTRAIT_WIDTH = 240; // grid-cols-[240px_1fr] in BuildCard.tsx
const ECHO_TILE_WIDTH = 160;
const ECHO_TILE_GAP = 6; // gap-1.5 in EchoCardTile's real grid
const TALENT_COLUMN_WIDTH = 78;
const RIGHT_COLUMN_WIDTH = 5 * ECHO_TILE_WIDTH + 4 * ECHO_TILE_GAP; // 824
const WIDTH = PORTRAIT_WIDTH + 16 /* gap */ + RIGHT_COLUMN_WIDTH + 32 /* card padding */; // 1112
// satori requires an explicit height (no dynamic content-based sizing the
// way a real browser would do) -- generous enough to comfortably fit the
// richest case with some margin; a sparser build just leaves blank space
// within the card border rather than being cut off.
const HEIGHT = 500;

// Blends `front` over `back` at `ratio` (0-1), same visual role as the
// real card's CSS `color-mix(in srgb, var(--card-glow-color) 26%, var(--color-bg))`
// -- satori's CSS parser doesn't evaluate color-mix(), so this precomputes
// an equivalent plain rgb() string in JS instead.
function hexBlend(front: string, back: string, ratio: number): string {
  const f = parseInt(front.slice(1), 16);
  const b = parseInt(back.slice(1), 16);
  const mix = (shift: number) =>
    Math.round(((f >> shift) & 255) * ratio + ((b >> shift) & 255) * (1 - ratio));
  return `rgb(${mix(16)}, ${mix(8)}, ${mix(0)})`;
}

// Same rounding/truncation convention as frontend/src/lib/echoes.ts's
// formatStatValue/isFlatStat -- HP/ATK/DEF are flat integers, everything
// else (Crit Rate, elemental DMG bonus, etc.) is a truncated-to-1-decimal
// percentage (the game truncates displayed percentages rather than
// rounding them -- see that file's comment for the real screenshot that
// caught a naive toFixed(1) rounding bug).
const FLAT_STAT_NAMES = new Set(["HP", "ATK", "DEF"]);
function formatStatValue(value: number, statName: string): string {
  if (FLAT_STAT_NAMES.has(statName)) return String(Math.round(value));
  const truncated = Math.floor(value * 10 + 1e-7) / 10;
  return `${truncated.toFixed(1)}%`;
}

export interface TalentData {
  skillType: string;
  name: string;
  pictureUrl: string | null;
  level: number;
}
export interface InherentSkillData {
  name: string;
  pictureUrl: string | null;
  active: boolean;
}
export interface KeynoteSkillData {
  skillType: string;
  name: string;
  pictureUrl: string | null;
}
export interface SequenceNodeData {
  sequence: number;
  name: string;
  pictureUrl: string | null;
}
export interface ForteColumnNodes {
  nodes: [{ stat: string; value: number }, { stat: string; value: number }];
  active: [boolean, boolean];
}
export interface EchoTileData {
  pictureUrl: string | null;
  echoName: string | null;
  cost: 1 | 3 | 4 | null;
  setName: string | null;
  setIconUrl: string | null;
  // [staticMainStat, chosenMainStat] -- echoes.ts/stats.ts always resolve
  // the fixed static main stat first (if present) then the player-chosen
  // variable one, matching computeEchoSlotBreakdown's own order.
  mainStats: { statName: string; value: number }[];
  substats: { statName: string | null; value: number | null }[];
}
// basicAttackDmgBonus/heavyAttackDmgBonus/skillDmgBonus/liberationDmgBonus
// aren't part of stats.ts's FinalStats (see build-card.ts's comment on why
// they're computed separately) -- a sibling object instead of widening
// FinalStats itself.
export interface ExtraDmgBonuses {
  basicAttackDmgBonus: number;
  heavyAttackDmgBonus: number;
  skillDmgBonus: number;
  liberationDmgBonus: number;
}

export interface BuildCardData {
  name: string;
  element: string | null;
  elementIconUrl: string | null;
  illustrationPictureUrl: string | null;
  level: number;
  weaponName: string | null;
  weaponPictureUrl: string | null;
  weaponLevel: number;
  weaponRank: number;
  weaponAtk: number | null;
  weaponSecondaryStat: { name: string; value: number } | null;
  resonanceLevel: number;
  finalStats: FinalStats | null;
  extraDmgBonuses: ExtraDmgBonuses;
  activeEchoSets: { setName: string; count: number }[];
  // Index 0-4: Normal Attack / Resonance Skill / Forte Circuit /
  // Resonance Liberation / Intro Skill -- addPointTarget's fixed order
  // (see database.md's talent_levels column comment).
  talents: TalentData[];
  inherentSkills: InherentSkillData[];
  keynoteSkills: KeynoteSkillData[];
  sequenceNodes: SequenceNodeData[];
  // Keyed by the same 4 non-Forte-Circuit columns as CharacterForteNodes
  // (normal_attack/resonance_skill/resonance_liberation/intro_skill).
  forteColumns: Record<string, ForteColumnNodes>;
  statIcons: Record<string, string>;
  // 5 slots in saved-build order.
  echoes: EchoTileData[];
}

// boxSizing: "border-box" on every container is the actual root cause of
// a persistent, very confusing overflow bug: satori's default (like raw
// CSS/SVG, unlike Tailwind's global reset the real site relies on) is
// content-box, where an explicit width + padding/border ADDS the padding/
// border on top of that width instead of including it. A tile declared
// `width: "310px"` with `padding: "8px"` + a 1px border was actually
// rendering at 328px -- confirmed by dumping satori's raw SVG output and
// finding the 5th of 5 "fixed-width" echo tiles started at x=1593
// instead of the expected ~1536, a gap explained exactly by 4 prior
// tiles each being 18px wider than requested. This single fix replaces
// three earlier "just add more WIDTH" attempts that never addressed the
// actual cause.
function flexCol(style: Record<string, unknown>, children: unknown) {
  return { type: "div", props: { style: { display: "flex", flexDirection: "column", boxSizing: "border-box", ...style }, children } };
}
function flexRow(style: Record<string, unknown>, children: unknown) {
  return { type: "div", props: { style: { display: "flex", flexDirection: "row", boxSizing: "border-box", ...style }, children } };
}
function text(value: string, style: Record<string, unknown>) {
  return { type: "div", props: { style: { display: "flex", ...style }, children: value } };
}
// StatIcon.tsx: a plain <img className="h-3.5 w-3.5">, NEVER inverted --
// confirmed by reading that component directly (no filter class at all),
// which contradicts an earlier assumption in this file's history that
// every game icon needed brightness-0 invert. Used for HP/ATK/DEF/Crit/
// elemental-bonus icons in the stats panel, weapon panel, and echo tiles.
function statIconImg(src: string | null | undefined, size = 14) {
  if (!src) return null;
  return { type: "img", props: { src, width: size, height: size, style: { objectFit: "contain" } } };
}
// SolidIcon (BuildCard.tsx): double-stacked <img> with brightness-0
// invert, for talent/inherent-skill/forte-node/sequence-node/keynote-
// skill icons -- these are dark/semi-transparent line-art on this app's
// dark theme and are nearly invisible without it (confirmed via an
// isolated local satori filter test before this was relied on broadly).
// A single filtered image (not literally double-stacked) is visually
// equivalent for satori's purposes -- the real double-stack exists to
// compound partial-alpha pixels in a real browser's compositing, which
// doesn't apply the same way to a single rasterization pass here.
function solidIcon(src: string | null, size: number, extraStyle: Record<string, unknown> = {}) {
  if (!src) return null;
  return {
    type: "img",
    props: { src, width: size, height: size, style: { objectFit: "contain", filter: "brightness(0) invert(1)", ...extraStyle } },
  };
}

// h-8 w-8 rotate-45 border border-gold bg-panel -- the main talent icon.
function talentDiamond(iconUrl: string | null) {
  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        boxSizing: "border-box",
        width: "32px",
        height: "32px",
        border: `1px solid ${GOLD}`,
        backgroundColor: PANEL,
        alignItems: "center",
        justifyContent: "center",
        transform: "rotate(45deg)",
      },
      children: [solidIcon(iconUrl, 20, { transform: "rotate(-45deg)" })].filter(Boolean),
    },
  };
}
// h-7 w-7 rotate-45 border bg-panel -- inherent-skill nodes (Forte
// Circuit's column).
function inherentDiamond(iconUrl: string | null, active: boolean) {
  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        boxSizing: "border-box",
        width: "28px",
        height: "28px",
        border: `1px solid ${active ? GOLD : BORDER}`,
        backgroundColor: PANEL,
        alignItems: "center",
        justifyContent: "center",
        transform: "rotate(45deg)",
      },
      children: [solidIcon(iconUrl, 16, { transform: "rotate(-45deg)" })].filter(Boolean),
    },
  };
}
// ForteNodeDisplay: h-7 w-7 rounded-full border bg-panel -- a CIRCLE, not
// a diamond, unlike every other node on this card. Confirmed by reading
// that component directly; an earlier version of this file wrongly made
// every node type a diamond.
function forteNodeCircle(iconUrl: string | null, active: boolean) {
  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        boxSizing: "border-box",
        width: "28px",
        height: "28px",
        borderRadius: "9999px",
        border: `1px solid ${active ? GOLD : BORDER}`,
        backgroundColor: PANEL,
        alignItems: "center",
        justifyContent: "center",
      },
      children: [solidIcon(iconUrl, 14)].filter(Boolean),
    },
  };
}
// CompactSequenceRow: h-11 w-11 rotate-45 border bg-panel-ALT (not
// bg-panel like the other diamonds -- confirmed by reading that
// component).
function sequenceDiamond(iconUrl: string | null, unlocked: boolean) {
  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        boxSizing: "border-box",
        width: "44px",
        height: "44px",
        border: `1px solid ${unlocked ? GOLD : BORDER}`,
        backgroundColor: PANEL_ALT,
        alignItems: "center",
        justifyContent: "center",
        transform: "rotate(45deg)",
      },
      children: [solidIcon(iconUrl, 28, { transform: "rotate(-45deg)" })].filter(Boolean),
    },
  };
}
// Keynote skill (Outro Skill/Tune Break): h-8 w-8 rounded-full
// border-gold bg-panel.
function keynoteCircle(iconUrl: string | null) {
  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        boxSizing: "border-box",
        width: "32px",
        height: "32px",
        borderRadius: "9999px",
        border: `1px solid ${GOLD}`,
        backgroundColor: PANEL,
        alignItems: "center",
        justifyContent: "center",
      },
      children: [solidIcon(iconUrl, 18)].filter(Boolean),
    },
  };
}

// FinalStatsGrid's Row: flex items-center gap-2 py-2 text-xs, label
// w-[7rem] (112px) shrink-0 truncate text-muted + StatIcon + value
// tabular-nums text-text. `divider` replicates `divide-y divide-border/60`
// (a real CSS sibling selector satori can't express) as an explicit
// borderTop on every row after the first.
function statPanelRow(label: string, value: string, iconUrl: string | undefined, divider: boolean) {
  return flexRow(
    {
      alignItems: "center",
      gap: "8px",
      padding: "8px 0",
      fontSize: "12px",
      ...(divider ? { borderTop: `1px solid ${BORDER}9a` } : {}),
    },
    [
      flexRow({ alignItems: "center", gap: "6px", width: "112px", flexShrink: 0 }, [
        statIconImg(iconUrl),
        text(label, { color: TEXT_MUTED, fontSize: "12px" }),
      ].filter(Boolean)),
      text(value, { color: TEXT, fontSize: "12px" }),
    ],
  );
}

function setBadge(label: string, accent: string) {
  return text(label.toUpperCase(), {
    fontSize: "9px",
    fontWeight: 600,
    letterSpacing: "0.03em",
    color: GOLD_SOFT,
    border: `1px solid ${accent}`,
    borderRadius: "4px",
    padding: "2px 6px",
  });
}

// EchoCardTile's main/substat row: flex items-center justify-between
// gap-1.5, label (StatIcon + name, truncate, text-muted) + value
// (tabular-nums). `emphasis` matches the chosen main stat's text-gold-soft
// (vs. every other row's plain text-text).
function echoStatLine(
  statName: string | null,
  value: number | null,
  size: "10px" | "9px",
  statIcons: Record<string, string>,
  emphasis = false,
) {
  if (!statName || value === null) {
    return text("—", { fontSize: size, color: TEXT_MUTED });
  }
  // The actual root cause of a persistent "clipped right edge" bug that
  // survived three WIDTH increases and switching tiles to explicit fixed
  // widths: a long stat name ("Resonance Liberation DMG Bonus" is a real
  // one) has no wrap/truncation constraint here, so it renders at its
  // full natural width regardless of any flex/minWidth settings on its
  // ancestors -- forcing the row, and therefore the whole fixed-width
  // tile, wider than intended. Confirmed by dumping satori's raw SVG
  // output and finding the overflowing element was text, not an <image>
  // (which is all an earlier diagnostic check happened to look for).
  // overflow/whiteSpace/textOverflow here match frontend/src/components/
  // EchoCardTile.tsx's own `truncate` utility class.
  return flexRow({ alignItems: "center", justifyContent: "space-between", gap: "6px" }, [
    flexRow({ alignItems: "center", gap: "4px", minWidth: 0 }, [
      statIconImg(statIcons[statName], 11),
      text(statName, {
        fontSize: size,
        color: TEXT_MUTED,
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
        minWidth: 0,
      }),
    ].filter(Boolean)),
    text(formatStatValue(value, statName), { fontSize: size, color: emphasis ? GOLD_SOFT : TEXT, flexShrink: 0 }),
  ]);
}

// EchoCardTile: flex-col gap-1.5 border border-border bg-panel-alt p-2 --
// a small 36px circular portrait (cost-tier-ring-colored) with a small
// sonata-set badge on its corner, name + set name beside it, then main
// stats and substats as compact rows below. NOT a large rectangular hero
// image -- an earlier version of this file made the portrait the
// dominant visual element, which isn't how the real card looks at all.
function echoTile(slot: EchoTileData, statIcons: Record<string, string>) {
  const ringColor = slot.cost ? COST_RING_COLOR[slot.cost] : BORDER;
  const mainStats = slot.mainStats;
  const substats = Array.from({ length: 5 }, (_, i) => slot.substats[i] ?? { statName: null, value: null });

  return flexCol(
    // Explicit width, not flex:1 -- a persistent small overflow on the
    // LAST of 5 equal-width flex:1 tiles survived three successive width
    // increases on the overall card (1580 -> 1660px with no change in the
    // clipped amount), which means it wasn't actually a "not enough
    // space" problem -- almost certainly a flex-equal-distribution
    // rounding edge case in satori specific to the final item. Explicit
    // fixed widths (same fix that resolved the talent-column overflow
    // above) sidestep it entirely. ECHO_TILE_WIDTH (160px) matches the
    // real site's proportions -- see WIDTH's comment -- relying on the
    // same truncate-on-overflow text treatment echoStatLine already has,
    // same as the real EchoCardTile.tsx's `truncate` class.
    { width: `${ECHO_TILE_WIDTH}px`, gap: "6px", border: `1px solid ${BORDER}`, backgroundColor: PANEL_ALT, padding: "8px" },
    [
      flexRow({ alignItems: "center", gap: "6px" }, [
        {
          type: "div",
          props: {
            style: { display: "flex", position: "relative", flexShrink: 0 },
            children: [
              {
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    boxSizing: "border-box",
                    width: "36px",
                    height: "36px",
                    borderRadius: "9999px",
                    border: `1px solid ${ringColor}`,
                    backgroundColor: PANEL,
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                  },
                  children: slot.pictureUrl
                    ? [{ type: "img", props: { src: slot.pictureUrl, width: 36, height: 36, style: { objectFit: "cover" } } }]
                    : slot.cost
                      ? [text(String(slot.cost), { fontSize: "12px", fontWeight: 600, color: TEXT_MUTED })]
                      : [],
                },
              },
              slot.setIconUrl
                ? {
                    type: "img",
                    props: {
                      src: slot.setIconUrl,
                      width: 15,
                      height: 15,
                      style: {
                        position: "absolute",
                        bottom: "-2px",
                        right: "-2px",
                        borderRadius: "9999px",
                        border: `1px solid ${BORDER}`,
                        backgroundColor: PANEL,
                        objectFit: "cover",
                      },
                    },
                  }
                : null,
            ].filter(Boolean),
          },
        },
        flexCol({ flex: 1, minWidth: 0 }, [
          text(slot.echoName ?? "Empty", {
            fontSize: "11px",
            fontWeight: 600,
            color: GOLD_SOFT,
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
          }),
          slot.setName
            ? text(slot.setName, { fontSize: "9px", color: TEXT_MUTED, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" })
            : null,
        ].filter(Boolean)),
      ]),
      mainStats.length
        ? flexCol(
            { gap: "2px", borderTop: `1px solid ${BORDER}`, paddingTop: "4px" },
            mainStats.map((s, i) => echoStatLine(s.statName, s.value, "10px", statIcons, i === mainStats.length - 1)),
          )
        : null,
      flexCol(
        { gap: "2px", borderTop: `1px solid ${BORDER}`, paddingTop: "4px" },
        substats.map((s) => echoStatLine(s.statName, s.value, "9px", statIcons)),
      ),
    ].filter(Boolean),
  );
}

// ARC_OFFSET_BY_DISTANCE in BuildCard.tsx: indexed by a column's distance
// from the center column (Forte Circuit, always index 2 of 5) -- 0 at the
// center, growing outward, so the tree reads as a shallow arc/wing
// (center raised, outer columns lower), matching a real in-game Forte
// tree screenshot. A user flagged this cascading shape as missing --
// v5's talent row had every column at the same baseline.
const ARC_OFFSET_BY_DISTANCE = [0, 14, 46];

function talentColumn(
  talent: TalentData | undefined,
  forte: ForteColumnNodes | undefined,
  data: BuildCardData,
  offset: number,
) {
  const isForteCircuit = talent?.skillType === "Forte Circuit";
  const topNodes = isForteCircuit
    ? data.inherentSkills.map((skill) => flexCol({ alignItems: "center" }, [inherentDiamond(skill.pictureUrl, skill.active)]))
    : forte
      ? [1, 0].map((tierIndex) => {
          const node = forte.nodes[tierIndex as 0 | 1];
          const active = forte.active[tierIndex as 0 | 1];
          return flexCol({ alignItems: "center" }, [forteNodeCircle(data.statIcons[node.stat] ?? null, active)]);
        })
      : [];

  return flexCol(
    // Explicit width + wrapping label, not letting the column size itself
    // off the label's unwrapped text -- "RESONANCE LIBERATION" at 9px
    // uppercase has no wrap/overflow constraint otherwise, which forces
    // the whole row wider than its allocated flex space regardless of
    // flex-shrink/minWidth:0 (text has its own intrinsic minimum width
    // when it can't wrap). Confirmed via a real overflow bug -- the 5th
    // column and 5th echo tile silently fell off the canvas edge even
    // after widening the card twice and adding minWidth:0 everywhere
    // else; satori doesn't clip overflowing content visibly, it's simply
    // absent from the fixed-size raster output. TALENT_COLUMN_WIDTH
    // (78px) matches the real TalentTree's content-driven column width --
    // see WIDTH's comment for why the canvas shrank from 1880px.
    // marginTop (ARC_OFFSET_BY_DISTANCE) replicates the real cascading
    // arc -- requires the parent row to use alignItems: "flex-start"
    // (set where talentCols is built in renderBuildCard), since the
    // default "stretch" would otherwise force every column to the row's
    // full height and erase the visual staggering.
    { alignItems: "center", gap: "8px", width: `${TALENT_COLUMN_WIDTH}px`, marginTop: `${offset}px` },
    [
      ...topNodes,
      talentDiamond(talent?.pictureUrl ?? null),
      talent
        ? text(talent.skillType.toUpperCase(), {
            fontSize: "9px",
            fontWeight: 600,
            letterSpacing: "0.03em",
            color: TEXT_MUTED,
            textAlign: "center",
            whiteSpace: "normal",
            wordBreak: "break-word",
          })
        : null,
      talent ? text(`Lv.${talent.level}`, { fontSize: "11px", color: GOLD_SOFT }) : null,
    ].filter(Boolean),
  );
}

export async function renderBuildCard(data: BuildCardData): Promise<Uint8Array> {
  const accent = (data.element && ELEMENT_COLOR[data.element]) || GOLD;
  const stats = data.finalStats;
  const extra = data.extraDmgBonuses;
  const si = data.statIcons;

  // BuildCard.tsx's real structure: `min-h-0 flex-1` wrapper (fills
  // whatever vertical space is left in the left column after the name
  // row + weapon panel) around a `h-full w-full object-cover` image --
  // NOT a fixed-height box. A fixed PORTRAIT_HEIGHT (first v5's approach)
  // left a visible blank gap below the weapon panel whenever the right
  // column's content was taller than that fixed height, and also forced
  // a more aggressive object-fit:cover crop off the bottom of the
  // portrait art than the real flexible box ever does -- a user flagged
  // both ("bottom of the photo is cut off" / "picture should be longer
  // so there isn't a gap"). `flex: 1, minHeight: 0` makes satori resolve
  // the actual leftover height itself, same as a real browser would.
  const portrait = {
    type: "div",
    props: {
      style: {
        display: "flex",
        boxSizing: "border-box",
        flex: 1,
        minHeight: 0,
        width: `${PORTRAIT_WIDTH}px`,
        borderRadius: "4px",
        overflow: "hidden",
        border: `2px solid ${accent}`,
        backgroundColor: PANEL_ALT,
      },
      children: data.illustrationPictureUrl
        ? [{ type: "img", props: { src: data.illustrationPictureUrl, style: { width: "100%", height: "100%", objectFit: "cover" } } }]
        : [],
    },
  };

  // Weapon panel: border border-border bg-panel-alt px-3 py-3, gap-3,
  // icon h-16 w-16 object-contain.
  const weaponPanel = flexRow(
    { alignItems: "center", gap: "12px", padding: "12px", border: `1px solid ${BORDER}`, backgroundColor: PANEL_ALT },
    [
      { type: "div", props: { style: { display: "flex", width: "64px", height: "64px", flexShrink: 0 }, children: data.weaponPictureUrl ? [{ type: "img", props: { src: data.weaponPictureUrl, width: 64, height: 64, style: { objectFit: "contain" } } }] : [] } },
      flexCol({ flex: 1, minWidth: 0 }, [
        text(data.weaponName ?? "No weapon equipped", { fontSize: "14px", fontWeight: 600, color: GOLD_SOFT }),
        data.weaponName
          ? text(`Lv.${data.weaponLevel} · Rank ${data.weaponRank}`, { fontSize: "12px", color: TEXT_MUTED })
          : null,
        data.weaponAtk !== null || data.weaponSecondaryStat
          ? flexRow(
              { gap: "12px", marginTop: "6px", flexWrap: "wrap" },
              [
                data.weaponAtk !== null
                  ? flexRow({ alignItems: "center", gap: "4px" }, [statIconImg(si.ATK), text(String(data.weaponAtk), { fontSize: "12px", color: TEXT })].filter(Boolean))
                  : null,
                data.weaponSecondaryStat
                  ? flexRow({ alignItems: "center", gap: "4px" }, [
                      statIconImg(si[data.weaponSecondaryStat.name]),
                      text(formatStatValue(data.weaponSecondaryStat.value, data.weaponSecondaryStat.name), { fontSize: "12px", color: TEXT }),
                    ].filter(Boolean))
                  : null,
              ].filter(Boolean),
            )
          : null,
      ].filter(Boolean)),
    ],
  );

  // FinalStatsGrid: ONE bordered box, bg-panel-alt, inline-grid
  // grid-cols-2 gap-x-5 (20px), px-4 py-2, self-start (hugs content).
  // Every value here goes through formatStatValue, exactly like the real
  // FinalStatsGrid.tsx's Row component does -- raw string interpolation
  // (e.g. `${stats.critDmg}%`) used to run directly off floating-point sums
  // with no truncation, producing values like "272.59999999999997%" (a real
  // bug a user caught live). formatStatValue truncates every percentage
  // stat to 1 decimal, matching the game's own display convention.
  const leftRows = stats
    ? [
        ["HP", "HP", formatStatValue(stats.hp, "HP")],
        ["ATK", "ATK", formatStatValue(stats.atk, "ATK")],
        ["DEF", "DEF", formatStatValue(stats.def, "DEF")],
        ["Energy Regen", "Energy Regen", formatStatValue(stats.energyRegen, "Energy Regen")],
        ["Crit Rate", "Crit. Rate", formatStatValue(stats.critRate, "Crit. Rate")],
        ["Crit DMG", "Crit. DMG", formatStatValue(stats.critDmg, "Crit. DMG")],
      ]
    : [];
  const rightRows = stats
    ? [
        ["Basic Atk DMG", "Basic Attack DMG Bonus", formatStatValue(extra.basicAttackDmgBonus, "Basic Attack DMG Bonus")],
        ["Heavy Atk DMG", "Heavy Attack DMG Bonus", formatStatValue(extra.heavyAttackDmgBonus, "Heavy Attack DMG Bonus")],
        ["Skill DMG", "Resonance Skill DMG Bonus", formatStatValue(extra.skillDmgBonus, "Resonance Skill DMG Bonus")],
        [
          "Liberation DMG",
          "Resonance Liberation DMG Bonus",
          formatStatValue(extra.liberationDmgBonus, "Resonance Liberation DMG Bonus"),
        ],
        [
          stats.elementalDmgBonusName.replace(" Bonus", ""),
          stats.elementalDmgBonusName,
          formatStatValue(stats.elementalDmgBonus, stats.elementalDmgBonusName),
        ],
        ["Healing Bonus", "Healing Bonus", formatStatValue(stats.healingBonus, "Healing Bonus")],
      ]
    : [];

  const statsPanel = stats
    ? flexRow(
        { gap: "20px", padding: "8px 16px", border: `1px solid ${BORDER}`, backgroundColor: PANEL_ALT, alignSelf: "flex-start" },
        [
          flexCol({}, leftRows.map((r, i) => statPanelRow(r[0], r[2], si[r[1]], i > 0))),
          flexCol({}, rightRows.map((r, i) => statPanelRow(r[0], r[2], si[r[1]], i > 0))),
        ],
      )
    : flexCol(
        { padding: "16px", border: `1px solid ${BORDER}`, backgroundColor: PANEL_ALT },
        [text("Final stats unavailable for this character/level.", { fontSize: "14px", color: TEXT_MUTED })],
      );

  const sequenceRow = data.sequenceNodes.length
    ? flexRow(
        { gap: "20px", flexWrap: "wrap", justifyContent: "center" },
        data.sequenceNodes.map((node) => sequenceDiamond(node.pictureUrl, node.sequence <= data.resonanceLevel)),
      )
    : null;

  const talentCols = [0, 1, 2, 3, 4].map((i) => {
    const talent = data.talents[i];
    const forte = talent ? data.forteColumns[forteColumnKey(talent.skillType)] : undefined;
    const offset = ARC_OFFSET_BY_DISTANCE[Math.abs(i - 2)] ?? 0;
    return talentColumn(talent, forte, data, offset);
  });

  const keynoteRow = data.keynoteSkills.length
    ? flexRow(
        { gap: "32px", justifyContent: "center" },
        data.keynoteSkills.map((skill) =>
          flexCol({ alignItems: "center", gap: "4px" }, [
            keynoteCircle(skill.pictureUrl),
            text(skill.skillType, { fontSize: "9px", color: TEXT_MUTED }),
          ]),
        ),
      )
    : null;

  const element = {
    type: "div",
    props: {
      style: {
        display: "flex",
        flexDirection: "row",
        boxSizing: "border-box",
        width: `${WIDTH}px`,
        height: `${HEIGHT}px`,
        backgroundColor: BG,
        backgroundImage: `linear-gradient(165deg, ${hexBlend(accent, BG, 0.26)} 0%, ${BG} 85%)`,
        border: `1px solid ${BORDER}`,
        padding: "16px",
        gap: "16px",
      },
      children: [
        // Left column: grid-cols-[240px_1fr]'s first track.
        flexCol({ gap: "12px", width: `${PORTRAIT_WIDTH}px`, flexShrink: 0 }, [
          portrait,
          flexRow(
            { alignItems: "center", gap: "8px" },
            [
              // ElementIcon.tsx tints this (already a white silhouette on
              // transparent background) via a CSS mask-image + colored
              // drop-shadow glow -- satori's CSS subset has no
              // mask-image support, so this renders the raw white icon
              // untinted rather than attempting a lossy approximation. A
              // deliberate scope line, same category as clip-path/the
              // starfield background being skipped elsewhere in this file.
              data.elementIconUrl
                ? { type: "img", props: { src: data.elementIconUrl, width: 20, height: 20, style: { objectFit: "contain" } } }
                : null,
              text(data.name, { fontSize: "14px", fontWeight: 600, color: GOLD_SOFT }),
              text(`Lv.${data.level}`, { fontSize: "10px", color: TEXT_MUTED }),
            ].filter(Boolean),
          ),
          weaponPanel,
        ]),
        // Right column: flex-col gap-3.
        flexCol({ flex: 1, gap: "12px", minWidth: 0 }, [
          flexRow({ gap: "16px", alignItems: "flex-start", borderBottom: `1px solid ${BORDER}`, paddingBottom: "12px" }, [
            flexCol({ gap: "12px" }, [statsPanel, sequenceRow].filter(Boolean)),
            flexCol({ flex: 1, minWidth: 0, gap: "12px", borderLeft: `1px solid ${BORDER}`, paddingLeft: "16px" }, [
              // alignItems: "flex-start" (matches the real TalentTree's
              // `items-start`) -- required for each column's marginTop
              // offset to actually stagger the row instead of being
              // flattened by the default stretch behavior.
              flexRow({ gap: "8px", justifyContent: "space-between", alignItems: "flex-start" }, talentCols),
              keynoteRow,
            ].filter(Boolean)),
          ]),
          data.activeEchoSets.length
            ? flexRow(
                { gap: "6px", flexWrap: "wrap" },
                data.activeEchoSets.map((s) => setBadge(`${s.setName} (${s.count})`, accent)),
              )
            : null,
          flexRow({ gap: "6px" }, data.echoes.map((e) => echoTile(e, si))),
        ].filter(Boolean)),
      ],
    },
  };

  // satori's typings want a real React element; this tree is the plain
  // object-literal equivalent it actually consumes (see file header).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svg = await satori(element as any, {
    width: WIDTH,
    height: HEIGHT,
    fonts: [{ name: "Geist", data: geistRegularFont(), weight: 600, style: "normal" }],
  });

  const resvg = new Resvg(svg);
  return resvg.render().asPng();
}

function forteColumnKey(skillType: string): string {
  const map: Record<string, string> = {
    "Normal Attack": "normal_attack",
    "Resonance Skill": "resonance_skill",
    "Resonance Liberation": "resonance_liberation",
    "Intro Skill": "intro_skill",
  };
  return map[skillType] ?? "";
}

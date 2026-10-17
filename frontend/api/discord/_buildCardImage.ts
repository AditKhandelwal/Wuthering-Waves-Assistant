// Composes the real Build Card image for /build (see discord.md) -- not a
// Discord route itself (no default export, hence the leading underscore,
// Vercel's own convention for "not an endpoint" files under api/).
//
// This is a composed re-creation pulling the same underlying DATA the
// live site's BuildCard.tsx uses, NOT a screenshot of that component -- a
// real headless-browser screenshot was considered and rejected: the full
// @sparticuz/chromium binary (70MB unpacked) exceeds Vercel's standard
// Node function size limit, and a hosted screenshot API trades that for
// an external paid dependency with its own rate limits. This renders in
// under a second with no browser at all.
//
// Layout mirrors BuildCard.tsx's real structure (not just its colors):
// a left portrait column, then a row with TWO sub-columns -- stats panel
// + resonance-chain diamond row on the left, Forte talent tree + Outro
// Skill/Tune Break row on the right (border-separated, matching
// `flex items-start gap-4 border-b ... > flex-col | flex-1 border-l`) --
// then echo set badges and a full-width row of larger echo tiles (name +
// full main/substat list) below. Earlier versions of this file stacked
// stats above talents and used small icon-only echo tiles; both were
// revised after a direct side-by-side comparison against a real site
// screenshot showed real, concrete gaps, not just color differences.
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
// browser.
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { geistRegularFont } from "./_fontData.js";
import type { FinalStats } from "./stats.js";

// Exact tokens from frontend/src/index.css's @theme block -- kept in sync
// by hand (no build-time import across the Vite/satori boundary), check
// that file if this card's palette ever looks off from the real site.
const BG = "#0d0d0f";
const PANEL = "#161618";
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

const WIDTH = 1900;
// satori requires an explicit height (no dynamic content-based sizing the
// way a real browser would do) -- generous enough to comfortably fit the
// richest case with some margin; a sparser build just leaves blank space
// within the card border rather than being cut off.
const HEIGHT = 1020;
const PORTRAIT_WIDTH = 230;
const STAT_PANEL_COL_WIDTH = 280;
const ECHO_TILE_WIDTH = 300;

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

function flexCol(style: Record<string, unknown>, children: unknown) {
  return { type: "div", props: { style: { display: "flex", flexDirection: "column", ...style }, children } };
}
function flexRow(style: Record<string, unknown>, children: unknown) {
  return { type: "div", props: { style: { display: "flex", flexDirection: "row", ...style }, children } };
}
function text(value: string, style: Record<string, unknown>) {
  return { type: "div", props: { style: { display: "flex", ...style }, children: value } };
}
// `invert`: the real site's convention for these dark/semi-transparent
// line-art game icons (talents, forte nodes, sequence nodes, stat icons)
// is `brightness-0 invert` (see .claude/rules/frontend.md's "Recoloring
// icon images") -- without it they're nearly invisible against this
// card's dark panels, which is exactly what the "some icons are black"
// bug report turned out to be. Confirmed satori supports `filter` via an
// isolated local test before applying this broadly. Character portraits,
// echo art, and weapon icons are real full-color artwork and must NOT be
// inverted -- callers opt in per icon, not a global default.
function icon(src: string | null, size: number, style: Record<string, unknown> = {}, invert = false) {
  if (!src) return { type: "div", props: { style: { display: "flex", width: `${size}px`, height: `${size}px`, ...style } } };
  return {
    type: "img",
    props: {
      src,
      width: size,
      height: size,
      style: { objectFit: "cover", ...(invert ? { filter: "brightness(0) invert(1)" } : {}), ...style },
    },
  };
}

// Rotated-square "diamond" node, matching the real card's talent/forte/
// inherent-skill/sequence icon shape (BuildCard.tsx's `rotate-45` +
// counter-rotated `-rotate-45` icon inside). Confirmed satori supports
// `transform: rotate()` via an isolated local test before this was built.
function diamondNode(size: number, borderColor: string, iconUrl: string | null, iconSize: number) {
  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        width: `${size}px`,
        height: `${size}px`,
        border: `2px solid ${borderColor}`,
        backgroundColor: PANEL,
        alignItems: "center",
        justifyContent: "center",
        transform: "rotate(45deg)",
      },
      children: iconUrl ? [icon(iconUrl, iconSize, { transform: "rotate(-45deg)" }, true)] : [],
    },
  };
}

function circleNode(size: number, borderColor: string, iconUrl: string | null, iconSize: number) {
  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: "9999px",
        border: `2px solid ${borderColor}`,
        backgroundColor: PANEL,
        alignItems: "center",
        justifyContent: "center",
      },
      children: iconUrl ? [icon(iconUrl, iconSize, {}, true)] : [],
    },
  };
}

// One row in the final-stats list panel -- icon + label on the left,
// value right-aligned. Values are plain TEXT color (not accent-colored),
// matching the real card -- only the card border/background wash and a
// few headline labels (name, weapon, echo set badge) carry the element
// accent there.
function statRow(label: string, value: string, iconUrl?: string) {
  return flexRow(
    { alignItems: "center", justifyContent: "space-between", width: `${STAT_PANEL_COL_WIDTH}px` },
    [
      flexRow({ alignItems: "center", gap: "8px" }, [
        iconUrl ? icon(iconUrl, 16, {}, true) : null,
        text(label, { fontSize: "13px", color: TEXT_MUTED }),
      ].filter(Boolean)),
      text(value, { fontSize: "14px", fontWeight: 600, color: TEXT }),
    ],
  );
}

function setBadge(label: string, accent: string) {
  return text(label, {
    fontSize: "14px",
    color: accent,
    border: `1px solid ${accent}`,
    borderRadius: "9999px",
    padding: "4px 12px",
  });
}

function echoSubstatRow(sub: { statName: string | null; value: number | null }, statIcons: Record<string, string>) {
  if (!sub.statName || sub.value === null) {
    return text("—", { fontSize: "11px", color: TEXT_MUTED });
  }
  const iconUrl = statIcons[sub.statName];
  return flexRow({ alignItems: "center", justifyContent: "space-between" }, [
    flexRow({ alignItems: "center", gap: "5px" }, [
      iconUrl ? icon(iconUrl, 12, {}, true) : null,
      text(sub.statName, { fontSize: "11px", color: TEXT_MUTED }),
    ].filter(Boolean)),
    text(formatStatValue(sub.value, sub.statName), { fontSize: "11px", color: TEXT }),
  ]);
}

function echoTile(slot: EchoTileData, accent: string, statIcons: Record<string, string>) {
  const borderColor = slot.pictureUrl ? accent : BORDER;
  const substatRows = Array.from({ length: 5 }, (_, i) => echoSubstatRow(slot.substats[i] ?? { statName: null, value: null }, statIcons));

  return flexCol(
    { width: `${ECHO_TILE_WIDTH}px`, border: `2px solid ${borderColor}`, borderRadius: "10px", backgroundColor: PANEL, overflow: "hidden" },
    [
      {
        type: "div",
        props: {
          style: { display: "flex", position: "relative", width: `${ECHO_TILE_WIDTH - 4}px`, height: "150px" },
          children: [
            slot.pictureUrl
              ? { type: "img", props: { src: slot.pictureUrl, width: ECHO_TILE_WIDTH - 4, height: 150, style: { objectFit: "cover" } } }
              : null,
            slot.cost
              ? {
                  type: "div",
                  props: {
                    style: {
                      display: "flex",
                      position: "absolute",
                      bottom: "4px",
                      right: "4px",
                      width: "22px",
                      height: "22px",
                      borderRadius: "9999px",
                      backgroundColor: `${BG}dd`,
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "12px",
                      fontWeight: 700,
                      color: GOLD_SOFT,
                    },
                    children: String(slot.cost),
                  },
                }
              : null,
          ].filter(Boolean),
        },
      },
      flexCol({ gap: "6px", padding: "10px 12px" }, [
        text(slot.echoName ?? "Empty", { fontSize: "14px", fontWeight: 700, color: GOLD_SOFT }),
        slot.setName ? text(slot.setName, { fontSize: "11px", color: TEXT_MUTED }) : null,
        slot.mainStats.length
          ? flexCol(
              { gap: "2px", marginTop: "2px" },
              slot.mainStats.map((s) =>
                text(`${s.statName} ${formatStatValue(s.value, s.statName)}`, { fontSize: "13px", fontWeight: 600, color: TEXT }),
              ),
            )
          : null,
        flexCol({ gap: "4px", marginTop: "4px", borderTop: `1px solid ${BORDER}`, paddingTop: "6px" }, substatRows),
      ].filter(Boolean)),
    ],
  );
}

function talentColumn(talent: TalentData | undefined, forte: ForteColumnNodes | undefined, data: BuildCardData) {
  const isForteCircuit = talent?.skillType === "Forte Circuit";
  const topNodes = isForteCircuit
    ? data.inherentSkills.map((skill) =>
        flexCol({ alignItems: "center" }, [diamondNode(30, skill.active ? GOLD : BORDER, skill.pictureUrl, 14)]),
      )
    : forte
      ? [1, 0].map((tierIndex) => {
          const node = forte.nodes[tierIndex as 0 | 1];
          const active = forte.active[tierIndex as 0 | 1];
          const iconUrl = data.statIcons[node.stat];
          return flexCol({ alignItems: "center" }, [diamondNode(28, active ? GOLD : BORDER, iconUrl ?? null, 12)]);
        })
      : [];

  return flexCol(
    { alignItems: "center", gap: "10px", width: "150px" },
    [
      ...topNodes,
      diamondNode(46, GOLD, talent?.pictureUrl ?? null, 22),
      talent
        ? text(talent.skillType.toUpperCase(), {
            fontSize: "10px",
            fontWeight: 600,
            letterSpacing: "0.04em",
            color: TEXT_MUTED,
            textAlign: "center",
          })
        : null,
      talent ? text(`Lv.${talent.level}`, { fontSize: "13px", color: GOLD_SOFT }) : null,
    ].filter(Boolean),
  );
}

export async function renderBuildCard(data: BuildCardData): Promise<Uint8Array> {
  const accent = (data.element && ELEMENT_COLOR[data.element]) || GOLD;
  const stats = data.finalStats;
  const extra = data.extraDmgBonuses;
  const si = data.statIcons;

  const portrait = data.illustrationPictureUrl
    ? {
        type: "img",
        props: {
          src: data.illustrationPictureUrl,
          width: PORTRAIT_WIDTH,
          height: 300,
          style: { borderRadius: "12px", objectFit: "cover", border: `3px solid ${accent}` },
        },
      }
    : {
        type: "div",
        props: {
          style: {
            display: "flex",
            width: `${PORTRAIT_WIDTH}px`,
            height: "300px",
            borderRadius: "12px",
            border: `3px solid ${accent}`,
            backgroundColor: PANEL,
          },
        },
      };

  const weaponPanel = flexRow(
    { alignItems: "center", gap: "12px", padding: "12px", backgroundColor: PANEL, borderRadius: "10px", width: `${PORTRAIT_WIDTH}px` },
    [
      icon(data.weaponPictureUrl, 48, { borderRadius: "6px" }),
      flexCol({ flex: 1, gap: "2px" }, [
        text(data.weaponName ?? "No weapon equipped", { fontSize: "14px", fontWeight: 600, color: GOLD_SOFT }),
        data.weaponName
          ? text(`Lv.${data.weaponLevel} · Rank ${data.weaponRank}`, { fontSize: "12px", color: TEXT_MUTED })
          : null,
        data.weaponAtk !== null || data.weaponSecondaryStat
          ? flexRow(
              { gap: "10px" },
              [
                data.weaponAtk !== null ? text(`ATK ${data.weaponAtk}`, { fontSize: "12px", color: TEXT }) : null,
                data.weaponSecondaryStat
                  ? text(`${data.weaponSecondaryStat.name} ${data.weaponSecondaryStat.value}`, { fontSize: "12px", color: TEXT })
                  : null,
              ].filter(Boolean),
            )
          : null,
      ].filter(Boolean)),
    ],
  );

  const statsPanel = stats
    ? flexCol(
        { gap: "10px", padding: "16px 18px", backgroundColor: PANEL, borderRadius: "10px", border: `1px solid ${BORDER}` },
        [
          flexRow({ gap: "24px" }, [
            flexCol({ gap: "10px" }, [
              statRow("HP", String(stats.hp), si.HP),
              statRow("ATK", String(stats.atk), si.ATK),
              statRow("DEF", String(stats.def), si.DEF),
              statRow("Energy Regen", `${stats.energyRegen}%`, si["Energy Regen"]),
              statRow("Crit Rate", `${stats.critRate}%`, si["Crit. Rate"]),
              statRow("Crit DMG", `${stats.critDmg}%`, si["Crit. DMG"]),
            ]),
            flexCol({ gap: "10px" }, [
              statRow("Basic Atk DMG", `${extra.basicAttackDmgBonus}%`),
              statRow("Heavy Atk DMG", `${extra.heavyAttackDmgBonus}%`),
              statRow("Skill DMG", `${extra.skillDmgBonus}%`),
              statRow("Liberation DMG", `${extra.liberationDmgBonus}%`),
              statRow(stats.elementalDmgBonusName, `${stats.elementalDmgBonus}%`, si[stats.elementalDmgBonusName]),
              statRow("Healing Bonus", `${stats.healingBonus}%`, si["Healing Bonus"]),
            ]),
          ]),
        ],
      )
    : flexCol(
        { padding: "16px 18px", backgroundColor: PANEL, borderRadius: "10px", border: `1px solid ${BORDER}`, width: `${STAT_PANEL_COL_WIDTH * 2 + 24}px` },
        [text("Final stats unavailable for this character/level.", { fontSize: "16px", color: TEXT_MUTED })],
      );

  const sequenceRow = data.sequenceNodes.length
    ? flexRow(
        { gap: "10px" },
        data.sequenceNodes.map((node) => {
          const unlocked = node.sequence <= data.resonanceLevel;
          return diamondNode(40, unlocked ? GOLD : BORDER, node.pictureUrl, 18);
        }),
      )
    : null;

  const talentCols = [0, 1, 2, 3, 4].map((i) => {
    const talent = data.talents[i];
    const forte = talent ? data.forteColumns[forteColumnKey(talent.skillType)] : undefined;
    return talentColumn(talent, forte, data);
  });

  const keynoteRow = data.keynoteSkills.length
    ? flexRow(
        { gap: "24px", justifyContent: "center", borderTop: `1px solid ${BORDER}`, paddingTop: "14px" },
        data.keynoteSkills.map((skill) =>
          flexCol({ alignItems: "center", gap: "6px" }, [
            circleNode(40, GOLD, skill.pictureUrl, 20),
            text(skill.skillType.toUpperCase(), { fontSize: "10px", fontWeight: 600, letterSpacing: "0.04em", color: TEXT_MUTED }),
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
        width: `${WIDTH}px`,
        height: `${HEIGHT}px`,
        backgroundColor: BG,
        backgroundImage: `linear-gradient(165deg, ${hexBlend(accent, BG, 0.26)} 0%, ${BG} 85%)`,
        border: `2px solid ${accent}`,
        borderRadius: "16px",
        padding: "28px",
        gap: "28px",
      },
      children: [
        flexCol({ gap: "12px", width: `${PORTRAIT_WIDTH}px` }, [
          portrait,
          flexRow({ alignItems: "baseline", gap: "10px" }, [
            text(data.name, { fontSize: "26px", fontWeight: 700, color: GOLD_SOFT }),
            text(`Lv ${data.level}/90`, { fontSize: "15px", color: TEXT_MUTED }),
          ]),
          weaponPanel,
        ]),
        flexCol({ flex: 1, gap: "20px" }, [
          flexRow({ gap: "24px", alignItems: "flex-start", borderBottom: `1px solid ${BORDER}`, paddingBottom: "20px" }, [
            flexCol({ gap: "14px" }, [statsPanel, sequenceRow].filter(Boolean)),
            flexCol({ flex: 1, gap: "14px", borderLeft: `1px solid ${BORDER}`, paddingLeft: "24px" }, [
              flexRow({ gap: "10px", justifyContent: "space-between" }, talentCols),
              keynoteRow,
            ].filter(Boolean)),
          ]),
          data.activeEchoSets.length
            ? flexRow(
                { gap: "8px" },
                data.activeEchoSets.map((s) => setBadge(`${s.setName} ${s.count}pc`, accent)),
              )
            : null,
          flexRow({ gap: "14px" }, data.echoes.map((e) => echoTile(e, accent, si))),
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

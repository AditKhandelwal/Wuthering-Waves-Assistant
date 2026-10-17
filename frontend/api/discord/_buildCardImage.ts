// Composes the real Build Card image for /build (see discord.md) -- not a
// Discord route itself (no default export, hence the leading underscore,
// Vercel's own convention for "not an endpoint" files under api/).
//
// This is a composed re-creation pulling the same underlying DATA the
// live site's BuildCard.tsx uses (portrait, weapon, final stats, forte
// tree, echoes), NOT a screenshot of that component -- a real headless-
// browser screenshot was considered and rejected: the full @sparticuz/
// chromium binary (70MB unpacked) exceeds Vercel's standard Node function
// size limit, and a hosted screenshot API trades that for an external
// paid dependency with its own rate limits. This renders in under a
// second with no browser at all. Styled to match the real site as
// closely as satori's CSS subset allows: exact color tokens from
// index.css, the same element-tinted gradient wash, and the same rotated-
// diamond look for talent/forte/inherent-skill nodes (confirmed satori
// supports `transform: rotate()` via an isolated local test before
// committing to it across the whole tree). Two things from the real card
// are still NOT replicated: the angular `clip-corner` panel shape (satori
// has no clip-path support) and the starfield background dots (skipped,
// not worth the satori-compatibility risk for a background flourish) --
// plain rounded corners and a flat gradient stand in for those.
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

const WIDTH = 1100;
// satori requires an explicit height (no dynamic content-based sizing the
// way a real browser would do) -- generous enough to comfortably fit the
// richest case (portrait + weapon panel + stats grid + talent columns +
// echo tiles with full substats) with some margin; a sparser build just
// leaves blank space within the card border rather than being cut off.
const HEIGHT = 860;
const PORTRAIT_WIDTH = 230;
const ECHO_TILE_WIDTH = 140;

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
export interface ForteColumnNodes {
  nodes: [{ stat: string; value: number }, { stat: string; value: number }];
  active: [boolean, boolean];
}
export interface EchoTileData {
  pictureUrl: string | null;
  cost: 1 | 3 | 4 | null;
  setName: string | null;
  mainStats: { statName: string; value: number }[];
  substats: { statName: string | null; value: number | null }[];
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
  activeEchoSets: { setName: string; count: number }[];
  // Index 0-4: Normal Attack / Resonance Skill / Forte Circuit /
  // Resonance Liberation / Intro Skill -- addPointTarget's fixed order
  // (see database.md's talent_levels column comment).
  talents: TalentData[];
  inherentSkills: InherentSkillData[];
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
function icon(src: string | null, size: number, style: Record<string, unknown> = {}) {
  if (!src) return { type: "div", props: { style: { display: "flex", width: `${size}px`, height: `${size}px`, ...style } } };
  return { type: "img", props: { src, width: size, height: size, style: { objectFit: "cover", ...style } } };
}

// Rotated-square "diamond" node, matching the real card's talent/forte/
// inherent-skill icon shape (BuildCard.tsx's `rotate-45` + counter-
// rotated `-rotate-45` icon inside). Confirmed satori supports
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
      children: iconUrl ? [icon(iconUrl, iconSize, { transform: "rotate(-45deg)" })] : [],
    },
  };
}

function statBox(label: string, value: string, accent: string, iconUrl?: string) {
  return flexRow(
    { alignItems: "center", gap: "10px", width: "220px", padding: "9px 14px", backgroundColor: PANEL, borderRadius: "8px" },
    [
      iconUrl ? icon(iconUrl, 22) : null,
      flexCol({ flex: 1 }, [
        text(label, { fontSize: "13px", color: TEXT_MUTED }),
        text(value, { fontSize: "22px", fontWeight: 700, color: accent }),
      ]),
    ].filter(Boolean),
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

function echoTile(slot: EchoTileData, accent: string, statIcons: Record<string, string>) {
  const borderColor = slot.pictureUrl ? accent : BORDER;
  const mainStatLine = slot.mainStats.length
    ? slot.mainStats.map((s) => formatStatValue(s.value, s.statName)).join(" / ")
    : null;

  const substatRows = Array.from({ length: 5 }, (_, i) => {
    const sub = slot.substats[i];
    if (!sub?.statName || sub.value === null) {
      return text("—", { fontSize: "10px", color: TEXT_MUTED });
    }
    const iconUrl = statIcons[sub.statName];
    return flexRow({ alignItems: "center", gap: "4px" }, [
      iconUrl ? icon(iconUrl, 11) : null,
      text(formatStatValue(sub.value, sub.statName), { fontSize: "10px", color: TEXT }),
    ].filter(Boolean));
  });

  return flexCol(
    { width: `${ECHO_TILE_WIDTH}px`, border: `2px solid ${borderColor}`, borderRadius: "10px", backgroundColor: PANEL, overflow: "hidden" },
    [
      {
        type: "div",
        props: {
          style: { display: "flex", position: "relative", width: `${ECHO_TILE_WIDTH - 4}px`, height: "90px" },
          children: [
            slot.pictureUrl
              ? { type: "img", props: { src: slot.pictureUrl, width: ECHO_TILE_WIDTH - 4, height: 90, style: { objectFit: "cover" } } }
              : null,
            slot.cost
              ? {
                  type: "div",
                  props: {
                    style: {
                      display: "flex",
                      position: "absolute",
                      bottom: "2px",
                      right: "2px",
                      width: "18px",
                      height: "18px",
                      borderRadius: "9999px",
                      backgroundColor: `${BG}cc`,
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "11px",
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
      flexCol({ gap: "3px", padding: "6px 8px" }, [
        mainStatLine ? text(mainStatLine, { fontSize: "11px", fontWeight: 600, color: GOLD_SOFT }) : null,
        ...substatRows,
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
    { alignItems: "center", gap: "10px", width: "140px" },
    [
      ...topNodes,
      diamondNode(46, GOLD, talent?.pictureUrl ?? null, 22),
      talent ? text(talent.skillType, { fontSize: "11px", color: TEXT_MUTED, textAlign: "center" }) : null,
      talent ? text(`Lv.${talent.level}`, { fontSize: "13px", color: GOLD_SOFT }) : null,
    ].filter(Boolean),
  );
}

export async function renderBuildCard(data: BuildCardData): Promise<Uint8Array> {
  const accent = (data.element && ELEMENT_COLOR[data.element]) || GOLD;
  const stats = data.finalStats;
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

  const statsGrid = stats
    ? flexCol({ gap: "8px" }, [
        flexRow({ gap: "8px" }, [statBox("HP", String(stats.hp), TEXT, si.HP), statBox("ATK", String(stats.atk), TEXT, si.ATK)]),
        flexRow({ gap: "8px" }, [
          statBox("DEF", String(stats.def), TEXT, si.DEF),
          statBox("Energy Regen", `${stats.energyRegen}%`, TEXT, si["Energy Regen"]),
        ]),
        flexRow({ gap: "8px" }, [
          statBox("Crit Rate", `${stats.critRate}%`, accent, si["Crit. Rate"]),
          statBox("Crit DMG", `${stats.critDmg}%`, accent, si["Crit. DMG"]),
        ]),
        flexRow({ gap: "8px" }, [
          statBox(stats.elementalDmgBonusName, `${stats.elementalDmgBonus}%`, accent, si[stats.elementalDmgBonusName]),
        ]),
      ])
    : text("Final stats unavailable for this character/level.", { fontSize: "16px", color: TEXT_MUTED });

  const talentCols = [0, 1, 2, 3, 4].map((i) => {
    const talent = data.talents[i];
    const forte = talent ? data.forteColumns[forteColumnKey(talent.skillType)] : undefined;
    return talentColumn(talent, forte, data);
  });

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
          text(`Resonance Chain: ${data.resonanceLevel}/6 unlocked`, { fontSize: "14px", color: TEXT }),
        ]),
        flexCol({ flex: 1, gap: "16px" }, [
          statsGrid,
          flexRow({ gap: "10px", justifyContent: "space-between" }, talentCols),
          data.activeEchoSets.length
            ? flexRow(
                { gap: "8px" },
                data.activeEchoSets.map((s) => setBadge(`${s.setName} ${s.count}pc`, accent)),
              )
            : null,
          flexRow({ gap: "10px" }, data.echoes.map((e) => echoTile(e, accent, si))),
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

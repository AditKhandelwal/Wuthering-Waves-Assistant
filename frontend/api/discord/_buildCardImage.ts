// Composes the real Build Card image for /build (see discord.md) -- not a
// Discord route itself (no default export, hence the leading underscore,
// Vercel's own convention for "not an endpoint" files under api/).
//
// This is a composed re-creation pulling the same underlying DATA the
// live site's BuildCard.tsx uses (portrait, weapon, final stats, forte
// tree, echo sets), NOT a screenshot of that component -- a real headless-
// browser screenshot was considered and rejected: the full @sparticuz/
// chromium binary (70MB unpacked) exceeds Vercel's standard Node function
// size limit, and a hosted screenshot API trades that for an external
// paid dependency with its own rate limits. This renders in milliseconds
// with no browser at all. It won't be pixel-identical to the site and
// deliberately skips the two most layout-complex parts of the real card
// (the full per-echo substat tile grid, and the resonance-chain diamond
// icon row) in favor of matching its most informative/recognizable
// elements: portrait, weapon, final stats, and the Forte talent tree with
// real skill/node icons.
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

const GOLD = "#c9a24b";
const GOLD_SOFT = "#d4af6a";
const PANEL = "#15151a";
const BORDER = "#2a2a33";
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
// echo badges) with some margin; a sparser build just leaves blank space
// within the card border rather than being cut off.
const HEIGHT = 720;
const PORTRAIT_WIDTH = 230;

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
  // 5 slots in saved-build order. pictureUrl/cost are null when the slot
  // is empty or its saved echoName didn't resolve against the catalog --
  // rendered as an empty bordered tile either way, same "don't guess"
  // treatment as the rest of this card's fallbacks.
  echoes: { pictureUrl: string | null; cost: 1 | 3 | 4 | null }[];
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

function statBox(label: string, value: string, accent: string, iconUrl?: string) {
  return flexRow(
    { alignItems: "center", gap: "10px", width: "220px", padding: "9px 14px", backgroundColor: PANEL, borderRadius: "8px" },
    [
      iconUrl ? icon(iconUrl, 22) : null,
      flexCol({ flex: 1 }, [
        text(label, { fontSize: "13px", color: "#9a9a9a" }),
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

function echoTile(slot: { pictureUrl: string | null; cost: 1 | 3 | 4 | null }, accent: string) {
  const borderColor = slot.pictureUrl ? accent : BORDER;
  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        position: "relative",
        width: "84px",
        height: "84px",
        borderRadius: "10px",
        border: `2px solid ${borderColor}`,
        backgroundColor: PANEL,
        overflow: "hidden",
      },
      children: [
        slot.pictureUrl
          ? { type: "img", props: { src: slot.pictureUrl, width: 84, height: 84, style: { objectFit: "cover" } } }
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
                  width: "20px",
                  height: "20px",
                  borderRadius: "9999px",
                  backgroundColor: "#0d0d0dcc",
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
  };
}

function talentColumn(talent: TalentData | undefined, forte: ForteColumnNodes | undefined, data: BuildCardData, accent: string) {
  const isForteCircuit = talent?.skillType === "Forte Circuit";
  const topNodes = isForteCircuit
    ? data.inherentSkills.map((skill) =>
        flexCol({ alignItems: "center" }, [
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                width: "30px",
                height: "30px",
                borderRadius: "9999px",
                border: `1px solid ${skill.active ? GOLD : BORDER}`,
                backgroundColor: PANEL,
                alignItems: "center",
                justifyContent: "center",
              },
              children: skill.pictureUrl ? [icon(skill.pictureUrl, 16)] : [],
            },
          },
        ]),
      )
    : forte
      ? [1, 0].map((tierIndex) => {
          const node = forte.nodes[tierIndex as 0 | 1];
          const active = forte.active[tierIndex as 0 | 1];
          const iconUrl = data.statIcons[node.stat];
          return flexCol({ alignItems: "center" }, [
            {
              type: "div",
              props: {
                style: {
                  display: "flex",
                  width: "28px",
                  height: "28px",
                  borderRadius: "9999px",
                  border: `1px solid ${active ? accent : BORDER}`,
                  backgroundColor: PANEL,
                  alignItems: "center",
                  justifyContent: "center",
                },
                children: iconUrl ? [icon(iconUrl, 14)] : [],
              },
            },
          ]);
        })
      : [];

  return flexCol(
    { alignItems: "center", gap: "6px", width: "140px" },
    [
      ...topNodes,
      {
        type: "div",
        props: {
          style: {
            display: "flex",
            width: "46px",
            height: "46px",
            borderRadius: "9999px",
            border: `2px solid ${GOLD}`,
            backgroundColor: PANEL,
            alignItems: "center",
            justifyContent: "center",
          },
          children: talent?.pictureUrl ? [icon(talent.pictureUrl, 26)] : [],
        },
      },
      talent ? text(talent.skillType, { fontSize: "11px", color: "#9a9a9a", textAlign: "center" }) : null,
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
          ? text(`Lv.${data.weaponLevel} · Rank ${data.weaponRank}`, { fontSize: "12px", color: "#9a9a9a" })
          : null,
        data.weaponAtk !== null || data.weaponSecondaryStat
          ? flexRow(
              { gap: "10px" },
              [
                data.weaponAtk !== null ? text(`ATK ${data.weaponAtk}`, { fontSize: "12px", color: "#cfcfcf" }) : null,
                data.weaponSecondaryStat
                  ? text(
                      `${data.weaponSecondaryStat.name} ${data.weaponSecondaryStat.value}`,
                      { fontSize: "12px", color: "#cfcfcf" },
                    )
                  : null,
              ].filter(Boolean),
            )
          : null,
      ].filter(Boolean)),
    ],
  );

  const statsGrid = stats
    ? flexCol({ gap: "8px" }, [
        flexRow({ gap: "8px" }, [statBox("HP", String(stats.hp), "#f1f1f1", si.HP), statBox("ATK", String(stats.atk), "#f1f1f1", si.ATK)]),
        flexRow({ gap: "8px" }, [
          statBox("DEF", String(stats.def), "#f1f1f1", si.DEF),
          statBox("Energy Regen", `${stats.energyRegen}%`, "#f1f1f1", si["Energy Regen"]),
        ]),
        flexRow({ gap: "8px" }, [
          statBox("Crit Rate", `${stats.critRate}%`, accent, si["Crit. Rate"]),
          statBox("Crit DMG", `${stats.critDmg}%`, accent, si["Crit. DMG"]),
        ]),
        flexRow({ gap: "8px" }, [
          statBox(stats.elementalDmgBonusName, `${stats.elementalDmgBonus}%`, accent, si[stats.elementalDmgBonusName]),
        ]),
      ])
    : text("Final stats unavailable for this character/level.", { fontSize: "16px", color: "#9a9a9a" });

  const talentCols = [0, 1, 2, 3, 4].map((i) => {
    const talent = data.talents[i];
    const forte = talent ? data.forteColumns[forteColumnKey(talent.skillType)] : undefined;
    return talentColumn(talent, forte, data, accent);
  });

  const element = {
    type: "div",
    props: {
      style: {
        display: "flex",
        flexDirection: "row",
        width: `${WIDTH}px`,
        height: `${HEIGHT}px`,
        backgroundColor: "#0d0d0d",
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
            text(`Lv ${data.level}/90`, { fontSize: "15px", color: "#9a9a9a" }),
          ]),
          weaponPanel,
          text(`Resonance Chain: ${data.resonanceLevel}/6 unlocked`, { fontSize: "14px", color: "#cfcfcf" }),
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
          flexRow({ gap: "10px" }, data.echoes.map((e) => echoTile(e, accent))),
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

// Composes the real Build Card image for /build (see discord.md) -- not a
// Discord route itself (no default export, hence the leading underscore,
// Vercel's own convention for "not an endpoint" files under api/).
//
// Built with satori (layout) + @resvg/resvg-js (rasterize to PNG, the
// NATIVE binary addon, not the WASM variant) -- deliberately NOT
// @vercel/og, same reasoning as this app's earlier (scrapped) /builds
// image attempt documented in discord.md, except this time there's no
// Edge-runtime fight to have at all: this renders inside build-card.ts, a
// real Node function, so satori's latest version (with its harfbuzzjs
// dependency) and a native resvg binary both just work via normal npm
// resolution -- no WASM-loading tricks, no version pinning.
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
const ELEMENT_COLOR: Record<string, string> = {
  Glacio: "#6fb7e8",
  Fusion: "#e2643c",
  Electro: "#b47cf0",
  Aero: "#5fd6b0",
  Spectro: "#e8c25f",
  Havoc: "#b4467a",
};

const WIDTH = 900;
const HEIGHT = 480;
const PORTRAIT_SIZE = 220;

export interface BuildCardData {
  name: string;
  element: string | null;
  pictureUrl: string | null;
  level: number;
  weaponName: string | null;
  weaponLevel: number;
  weaponRank: number;
  resonanceLevel: number;
  finalStats: FinalStats | null;
  activeEchoSets: { setName: string; count: number }[];
}

function statBox(label: string, value: string, accent: string) {
  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        flexDirection: "column",
        width: "190px",
        padding: "10px 16px",
        backgroundColor: "#15151a",
        borderRadius: "8px",
      },
      children: [
        {
          type: "div",
          props: {
            style: { display: "flex", fontSize: "14px", color: "#9a9a9a" },
            children: label,
          },
        },
        {
          type: "div",
          props: {
            style: { display: "flex", fontSize: "26px", fontWeight: 700, color: accent },
            children: value,
          },
        },
      ],
    },
  };
}

function setBadge(text: string, accent: string) {
  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        fontSize: "15px",
        color: accent,
        border: `1px solid ${accent}`,
        borderRadius: "9999px",
        padding: "4px 14px",
      },
      children: text,
    },
  };
}

export async function renderBuildCard(data: BuildCardData): Promise<Uint8Array> {
  const accent = (data.element && ELEMENT_COLOR[data.element]) || GOLD;

  const portrait = data.pictureUrl
    ? {
        type: "img",
        props: {
          src: data.pictureUrl,
          width: PORTRAIT_SIZE,
          height: PORTRAIT_SIZE,
          style: { borderRadius: "16px", objectFit: "cover", border: `4px solid ${accent}` },
        },
      }
    : {
        type: "div",
        props: {
          style: {
            display: "flex",
            width: `${PORTRAIT_SIZE}px`,
            height: `${PORTRAIT_SIZE}px`,
            borderRadius: "16px",
            border: `4px solid ${accent}`,
            backgroundColor: "#1a1a1a",
          },
        },
      };

  const stats = data.finalStats;
  const statRows = stats
    ? [
        [statBox("HP", String(stats.hp), "#f1f1f1"), statBox("ATK", String(stats.atk), "#f1f1f1")],
        [
          statBox("DEF", String(stats.def), "#f1f1f1"),
          statBox("Energy Regen", `${stats.energyRegen}%`, "#f1f1f1"),
        ],
        [
          statBox("Crit Rate", `${stats.critRate}%`, accent),
          statBox("Crit DMG", `${stats.critDmg}%`, accent),
        ],
        [statBox(stats.elementalDmgBonusName, `${stats.elementalDmgBonus}%`, accent)],
      ]
    : null;

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
        gap: "32px",
      },
      children: [
        {
          type: "div",
          props: {
            style: { display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" },
            children: [
              portrait,
              data.element
                ? {
                    type: "div",
                    props: {
                      style: { display: "flex", fontSize: "16px", color: accent, fontWeight: 600 },
                      children: data.element,
                    },
                  }
                : null,
            ].filter(Boolean),
          },
        },
        {
          type: "div",
          props: {
            style: { display: "flex", flexDirection: "column", flex: 1, gap: "10px" },
            children: [
              {
                type: "div",
                props: {
                  style: { display: "flex", alignItems: "baseline", gap: "12px" },
                  children: [
                    {
                      type: "div",
                      props: { style: { display: "flex", fontSize: "36px", fontWeight: 700, color: GOLD_SOFT }, children: data.name },
                    },
                    {
                      type: "div",
                      props: { style: { display: "flex", fontSize: "20px", color: "#9a9a9a" }, children: `Lv ${data.level}/90` },
                    },
                  ],
                },
              },
              {
                type: "div",
                props: {
                  style: { display: "flex", fontSize: "17px", color: "#cfcfcf" },
                  children: data.weaponName
                    ? `${data.weaponName} (Lv ${data.weaponLevel}, Rank ${data.weaponRank})`
                    : "No weapon equipped",
                },
              },
              {
                type: "div",
                props: {
                  style: { display: "flex", fontSize: "17px", color: "#cfcfcf" },
                  children: `Resonance Chain: ${data.resonanceLevel}/6 unlocked`,
                },
              },
              statRows
                ? {
                    type: "div",
                    props: {
                      style: { display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" },
                      children: statRows.map((row) => ({
                        type: "div",
                        props: { style: { display: "flex", flexDirection: "row", gap: "8px" }, children: row },
                      })),
                    },
                  }
                : {
                    type: "div",
                    props: {
                      style: { display: "flex", fontSize: "16px", color: "#9a9a9a", marginTop: "8px" },
                      children: "Final stats unavailable for this character/level.",
                    },
                  },
              data.activeEchoSets.length
                ? {
                    type: "div",
                    props: {
                      style: { display: "flex", flexDirection: "row", gap: "8px", marginTop: "4px" },
                      children: data.activeEchoSets.map((s) => setBadge(`${s.setName} ${s.count}pc`, accent)),
                    },
                  }
                : null,
            ].filter(Boolean),
          },
        },
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

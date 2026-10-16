// Composes a real grid image of character portraits for /builds (see
// discord.md) -- not a Discord route itself (no default export, hence the
// leading underscore, Vercel's own convention for "not an endpoint" files
// under api/).
//
// Built directly from satori (layout) + @resvg/resvg-wasm (rasterize to
// PNG), NOT @vercel/og. @vercel/og was tried first (it's the usual way to
// do this on Vercel) but its package.json only resolves to its
// Edge-compatible build when a bundler sets the "edge"/"edge-light"
// export condition -- Next.js's build does this automatically for edge
// routes, but Vercel's bundler for a plain (non-Next.js) project's api/
// Edge Functions apparently does not, so it silently pulled in the
// Node-targeted build (dynamic `require("fs")` inside), which Vercel's
// own deploy-time Edge-compatibility check then rejected outright
// ("referencing unsupported modules: @vercel"). satori and
// @resvg/resvg-wasm have no such edge/node branching -- plain universal
// JS/WASM -- so calling them directly sidesteps the problem entirely.
// Confirmed working via a standalone local test before this was written
// (see discord.md).
//
// Deliberately NOT JSX -- satori accepts any React-element-shaped tree,
// and a plain {type, props} object literal is exactly that shape without
// needing a .tsx extension or a JSX pragma in tsconfig.api.json. Satori
// requires an explicit `display: "flex"` (or "none") on every element
// with children -- it doesn't support default block layout, unlike a
// real browser.
import satori from "satori";
import { Resvg, initWasm } from "@resvg/resvg-wasm";
import { geistRegularFont } from "./_fontData";
// Vendored copy of @resvg/resvg-wasm's own wasm binary (see that file's
// header) -- imported via Vercel's documented "?module" precompiled-Wasm
// convention (https://vercel.com/docs/functions/wasm), the only Wasm
// loading path confirmed to work in a Vercel Edge Function; a Node fs
// read (what local testing used) isn't available here at all. Typed by
// wasm-module.d.ts.
import resvgWasmModule from "./resvg.wasm?module";

const COLS = 5;
const CELL_WIDTH = 170;
const CELL_HEIGHT = 190;
const PADDING = 32;
const HEADER_HEIGHT = 70;
const PORTRAIT_SIZE = 110;
const GOLD = "#c9a24b";

export interface BuildCell {
  name: string;
  level: number;
  pictureUrl: string | null;
}

// initWasm throws if called twice on an already-initialized module, so
// this is memoized -- a warm function instance reuses it across
// invocations, a cold one initializes once.
let wasmReady: Promise<void> | null = null;
function ensureWasmInit(): Promise<void> {
  if (!wasmReady) {
    wasmReady = initWasm(resvgWasmModule);
  }
  return wasmReady;
}

function cellNode(cell: BuildCell) {
  const portrait = cell.pictureUrl
    ? {
        type: "img",
        props: {
          src: cell.pictureUrl,
          width: PORTRAIT_SIZE,
          height: PORTRAIT_SIZE,
          style: {
            borderRadius: "9999px",
            objectFit: "cover",
            border: `3px solid ${GOLD}`,
          },
        },
      }
    : {
        type: "div",
        props: {
          style: {
            display: "flex",
            width: `${PORTRAIT_SIZE}px`,
            height: `${PORTRAIT_SIZE}px`,
            borderRadius: "9999px",
            border: `3px solid ${GOLD}`,
            backgroundColor: "#1a1a1a",
          },
        },
      };

  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: `${CELL_WIDTH}px`,
      },
      children: [
        portrait,
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              marginTop: "10px",
              fontSize: "20px",
              fontWeight: 600,
              color: "#f1f1f1",
            },
            children: cell.name,
          },
        },
        {
          type: "div",
          props: {
            style: { display: "flex", marginTop: "2px", fontSize: "16px", color: "#9a9a9a" },
            children: `Lv ${cell.level}/90`,
          },
        },
      ],
    },
  };
}

export async function renderBuildsGrid(title: string, cells: BuildCell[]): Promise<Uint8Array> {
  await ensureWasmInit();

  const cols = Math.min(COLS, cells.length) || 1;
  const rows = Math.ceil(cells.length / cols);
  const width = cols * CELL_WIDTH + PADDING * 2;
  const height = rows * CELL_HEIGHT + PADDING * 2 + HEADER_HEIGHT;

  const element = {
    type: "div",
    props: {
      style: {
        display: "flex",
        flexDirection: "column",
        width: `${width}px`,
        height: `${height}px`,
        backgroundColor: "#0d0d0d",
        padding: `${PADDING}px`,
      },
      children: [
        {
          type: "div",
          props: {
            style: { display: "flex", fontSize: "26px", fontWeight: 700, color: "#d4af6a", marginBottom: "20px" },
            children: title,
          },
        },
        {
          type: "div",
          props: {
            style: { display: "flex", flexDirection: "row", flexWrap: "wrap" },
            children: cells.map(cellNode),
          },
        },
      ],
    },
  };

  // satori's typings want a real React element; this tree is the plain
  // object-literal equivalent it actually consumes (see file header).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svg = await satori(element as any, {
    width,
    height,
    fonts: [{ name: "Geist", data: geistRegularFont(), weight: 600, style: "normal" }],
  });

  const resvg = new Resvg(svg);
  return resvg.render().asPng();
}

// Composes a real grid image of character portraits for /builds (see
// discord.md) -- not a Discord route itself (no default export, hence the
// leading underscore, Vercel's own convention for "not an endpoint" files
// under api/). Built with @vercel/og: Satori (layout) + resvg (rasterize),
// both pure-JS/WASM and Edge-compatible, so this stays in the same Edge
// runtime as interactions.ts rather than needing a separate Node function.
//
// Deliberately NOT JSX -- @vercel/og's ImageResponse accepts any
// React-element-shaped tree, and a plain {type, props} object literal is
// exactly that shape without needing a .tsx extension or a JSX pragma in
// tsconfig.api.json. Satori requires an explicit `display: "flex"` (or
// "none") on every element with children -- it doesn't support default
// block layout, unlike a real browser.
import { ImageResponse } from "@vercel/og";

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

export async function renderBuildsGrid(title: string, cells: BuildCell[]): Promise<Response> {
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

  // @vercel/og's typings want a real React element; this tree is the plain
  // object-literal equivalent Satori actually consumes (see file header).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new ImageResponse(element as any, { width, height });
}

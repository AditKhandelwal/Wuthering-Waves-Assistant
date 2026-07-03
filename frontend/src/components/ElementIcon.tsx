import type { ElementName } from "../types/character";

// Element icons are real in-game symbols: solid white silhouettes on
// transparent backgrounds (confirmed by pixel inspection -- every opaque
// pixel is pure #fff). Rendered as a CSS mask so they can be tinted to their
// actual element color and given a matching glow, replicating how they
// glow in-game, instead of showing as flat white. Each class string is
// spelled out fully (not built via template-literal interpolation) per
// Tailwind's dynamic-class-string gotcha (see .claude/rules/frontend.md) --
// same pattern as ELEMENT_PORTRAIT_CLASS in lib/characters.ts.
const ELEMENT_GLOW_CLASS: Record<ElementName, string> = {
  Glacio:
    "bg-[color:var(--color-element-glacio)] [filter:drop-shadow(0_0_3px_var(--color-element-glacio))_drop-shadow(0_0_6px_var(--color-element-glacio))]",
  Fusion:
    "bg-[color:var(--color-element-fusion)] [filter:drop-shadow(0_0_3px_var(--color-element-fusion))_drop-shadow(0_0_6px_var(--color-element-fusion))]",
  Electro:
    "bg-[color:var(--color-element-electro)] [filter:drop-shadow(0_0_3px_var(--color-element-electro))_drop-shadow(0_0_6px_var(--color-element-electro))]",
  Aero: "bg-[color:var(--color-element-aero)] [filter:drop-shadow(0_0_3px_var(--color-element-aero))_drop-shadow(0_0_6px_var(--color-element-aero))]",
  Spectro:
    "bg-[color:var(--color-element-spectro)] [filter:drop-shadow(0_0_3px_var(--color-element-spectro))_drop-shadow(0_0_6px_var(--color-element-spectro))]",
  Havoc:
    "bg-[color:var(--color-element-havoc)] [filter:drop-shadow(0_0_3px_var(--color-element-havoc))_drop-shadow(0_0_6px_var(--color-element-havoc))]",
};

export function ElementIcon({
  element,
  iconUrl,
  className,
}: {
  element: ElementName;
  iconUrl: string;
  className: string;
}) {
  return (
    <span
      role="img"
      aria-label={element}
      className={`inline-block shrink-0 ${className} ${ELEMENT_GLOW_CLASS[element]}`}
      style={{
        WebkitMaskImage: `url(${iconUrl})`,
        maskImage: `url(${iconUrl})`,
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }}
    />
  );
}

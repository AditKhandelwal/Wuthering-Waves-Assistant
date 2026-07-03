import type { SequenceNode } from "../types/sequenceNode";

interface SequenceNodeRowProps {
  nodes: SequenceNode[];
  unlockedCount: number;
  onToggle: (sequence: number) => void;
}

export function SequenceNodeRow({ nodes, unlockedCount, onToggle }: SequenceNodeRowProps) {
  return (
    <div className="relative flex items-center justify-between px-4">
      <div className="absolute left-8 right-8 top-4 h-px bg-border" />
      {nodes.map((node) => {
        const unlocked = node.sequence <= unlockedCount;
        return (
          <button
            key={node.sequence}
            onClick={() => onToggle(node.sequence)}
            className="relative z-10 flex flex-col items-center gap-1.5"
            title={node.name}
          >
            <span
              className={`flex h-8 w-8 rotate-45 items-center justify-center border bg-panel transition ${
                unlocked
                  ? "border-gold shadow-[0_0_8px_color-mix(in_srgb,var(--color-gold)_50%,transparent)]"
                  : "border-border opacity-70 hover:border-gold-soft"
              }`}
            >
              {/* Two stacked copies compound the icon's semi-transparent pixels
                  (soft glow/anti-aliased edges in the source art) into a
                  solid-looking white symbol instead of a faint one. */}
              <span className="relative h-5 w-5 -rotate-45">
                <img
                  src={node.pictureUrl}
                  alt={node.name}
                  className="absolute inset-0 h-full w-full brightness-0 invert"
                />
                <img
                  src={node.pictureUrl}
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 h-full w-full brightness-0 invert"
                />
              </span>
            </span>
            <span className={`text-[10px] ${unlocked ? "text-gold-soft" : "text-text-muted"}`}>
              {node.sequence}
            </span>
          </button>
        );
      })}
    </div>
  );
}

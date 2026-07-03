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
                  : "border-border opacity-60 hover:border-gold-soft"
              }`}
            >
              <img
                src={node.pictureUrl}
                alt={node.name}
                className={`h-4 w-4 -rotate-45 brightness-0 invert ${unlocked ? "" : "opacity-50"}`}
              />
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

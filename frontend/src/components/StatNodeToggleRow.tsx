import type { SequenceStatNodes, StatNodePosition } from "../types/sequenceStatNode";

interface StatNodeToggleRowProps {
  nodes: SequenceStatNodes;
  toggled: Record<StatNodePosition, boolean>;
  onToggle: (position: StatNodePosition) => void;
}

const POSITIONS: { key: StatNodePosition; label: string }[] = [
  { key: "left", label: "Left" },
  { key: "leftMid", label: "Left-Mid" },
  { key: "rightMid", label: "Right-Mid" },
  { key: "right", label: "Right" },
];

export function StatNodeToggleRow({ nodes, toggled, onToggle }: StatNodeToggleRowProps) {
  const totals = new Map<string, number>();
  for (const { key } of POSITIONS) {
    const entry = nodes[key];
    if (entry && toggled[key]) {
      totals.set(entry.stat, (totals.get(entry.stat) ?? 0) + entry.value);
    }
  }

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-text-muted">Stat Nodes</span>
        <span className="text-[9px] text-text-muted italic">
          unverified values, may be inaccurate
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {POSITIONS.map(({ key, label }) => {
          const entry = nodes[key];
          if (!entry) return null;
          const active = toggled[key];
          return (
            <button
              key={key}
              onClick={() => onToggle(key)}
              className={`rounded-sm border px-2 py-1 text-left transition ${
                active
                  ? "border-gold bg-panel-alt text-gold-soft"
                  : "border-border text-text-muted hover:border-gold-soft"
              }`}
            >
              <div className="text-[9px] uppercase tracking-wide opacity-70">{label}</div>
              <div className="text-[10px] whitespace-nowrap">
                {entry.stat} +{entry.value}%
              </div>
            </button>
          );
        })}
      </div>
      {totals.size > 0 && (
        <div className="mt-2 text-xs text-gold-soft">
          {[...totals.entries()].map(([stat, val]) => `${stat} +${val.toFixed(1)}%`).join(" · ")}
        </div>
      )}
    </div>
  );
}

import type { ReactNode } from "react";

interface StatBoxProps {
  icon: ReactNode;
  value: string;
}

export function StatBox({ icon, value }: StatBoxProps) {
  return (
    <div className="flex w-24 items-center gap-1.5 rounded-sm border border-border bg-panel-alt px-2 py-1 text-gold-soft">
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1 text-right text-xs whitespace-nowrap tabular-nums text-text">
        {value}
      </span>
    </div>
  );
}

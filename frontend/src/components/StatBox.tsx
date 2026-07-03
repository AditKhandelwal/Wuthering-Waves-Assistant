import type { ReactNode } from "react";

interface StatBoxProps {
  icon: ReactNode;
  label: string;
  value: string;
}

export function StatBox({ icon, label, value }: StatBoxProps) {
  return (
    <div className="flex w-24 flex-col gap-1 rounded-sm border border-border bg-panel-alt px-2 py-1.5">
      <span className="truncate text-[9px] uppercase tracking-wide text-text-muted">{label}</span>
      <div className="flex items-center gap-1.5 text-gold-soft">
        <span className="shrink-0">{icon}</span>
        <span className="min-w-0 flex-1 text-right text-xs whitespace-nowrap tabular-nums text-text">
          {value}
        </span>
      </div>
    </div>
  );
}

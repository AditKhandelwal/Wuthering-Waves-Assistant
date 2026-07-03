import type { ReactNode } from "react";

interface StatBoxProps {
  icon: ReactNode;
  label: string;
  value: string;
}

export function StatBox({ icon, label, value }: StatBoxProps) {
  return (
    <div className="flex w-40 items-center gap-1.5 rounded-sm border border-border bg-panel-alt px-2 py-1.5">
      <span className="shrink-0 text-gold-soft">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-[10px] uppercase tracking-wide text-text-muted">
        {label}
      </span>
      <span className="shrink-0 whitespace-nowrap text-right text-xs tabular-nums text-text">
        {value}
      </span>
    </div>
  );
}

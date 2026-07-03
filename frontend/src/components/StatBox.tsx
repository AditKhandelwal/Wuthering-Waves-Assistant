import type { ReactNode } from "react";

interface StatBoxProps {
  icon: ReactNode;
  value: string;
}

export function StatBox({ icon, value }: StatBoxProps) {
  return (
    <div className="flex items-center gap-1.5 rounded-sm border border-border bg-panel-alt px-2 py-1 text-gold-soft">
      {icon}
      <span className="text-xs text-text">{value}</span>
    </div>
  );
}

import { StatIcon } from "./StatIcon";
import { formatStatValue } from "../lib/echoes";
import type { FinalStats } from "../lib/finalStats";

interface StatRow {
  label: string;
  statName: string;
  value: number;
}

function Row({ statIcons, row }: { statIcons: Record<string, string> | null; row: StatRow }) {
  return (
    <div className="flex items-center gap-1.5 py-0.5 text-[11px]">
      <span className="flex w-[6.5rem] shrink-0 items-center gap-1 truncate text-text-muted">
        <StatIcon icons={statIcons} name={row.statName} />
        {row.label}
      </span>
      <span className="tabular-nums text-text">{formatStatValue(row.value, row.statName)}</span>
    </div>
  );
}

// The real in-game stat panel's two columns: primary stats on the left,
// DMG-bonus categories on the right (all 4 attack types + the character's
// own element + Healing Bonus), matching how WUWAFLEX/community build tools
// lay theirs out. `self-start` keeps the box hugging its own content width
// instead of stretching to fill the flex column (the default
// align-items:stretch behavior) -- that stretch was the "large gap between
// stat name and value" bug: label+value were pinned to opposite edges of an
// unnecessarily wide box.
export function FinalStatsGrid({
  stats,
  statIcons,
}: {
  stats: FinalStats;
  statIcons: Record<string, string> | null;
}) {
  const left: StatRow[] = [
    { label: "HP", statName: "HP", value: stats.hp },
    { label: "ATK", statName: "ATK", value: stats.atk },
    { label: "DEF", statName: "DEF", value: stats.def },
    { label: "Energy Regen", statName: "Energy Regen", value: stats.energyRegen },
    { label: "Crit Rate", statName: "Crit. Rate", value: stats.critRate },
    { label: "Crit DMG", statName: "Crit. DMG", value: stats.critDmg },
  ];
  const right: StatRow[] = [
    { label: "Basic Atk DMG", statName: "Basic Attack DMG Bonus", value: stats.basicAttackDmgBonus },
    { label: "Heavy Atk DMG", statName: "Heavy Attack DMG Bonus", value: stats.heavyAttackDmgBonus },
    { label: "Skill DMG", statName: "Resonance Skill DMG Bonus", value: stats.skillDmgBonus },
    { label: "Liberation DMG", statName: "Resonance Liberation DMG Bonus", value: stats.liberationDmgBonus },
    {
      label: stats.elementalDmgBonusName.replace(" Bonus", ""),
      statName: stats.elementalDmgBonusName,
      value: stats.elementalDmgBonus,
    },
    { label: "Healing Bonus", statName: "Healing Bonus", value: stats.healingBonus },
  ];

  return (
    <div className="inline-grid w-fit grid-cols-2 gap-x-4 self-start border border-border bg-panel-alt px-3 py-1">
      <div className="divide-y divide-border/60">
        {left.map((row) => (
          <Row key={row.statName} statIcons={statIcons} row={row} />
        ))}
      </div>
      <div className="divide-y divide-border/60">
        {right.map((row) => (
          <Row key={row.statName} statIcons={statIcons} row={row} />
        ))}
      </div>
    </div>
  );
}

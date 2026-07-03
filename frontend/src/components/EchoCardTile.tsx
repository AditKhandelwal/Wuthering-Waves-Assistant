import { COST_DISC_CLASS, computeEchoMainStatValue, formatStatValue } from "../lib/echoes";
import { StatIcon } from "./StatIcon";
import type { EchoSet, EchoStatCurves, EquippedEcho } from "../types/echo";

interface EchoCardTileProps {
  slot: EquippedEcho;
  curves: EchoStatCurves | null;
  statIcons: Record<string, string> | null;
  sets: EchoSet[];
}

// Compact, read-only echo display for BuildCard -- unlike EchoSlotCard (in
// BuildScreenPage), this never edits anything, just shows the slot's current
// main stat + rolled substats.
export function EchoCardTile({ slot, curves, statIcons, sets }: EchoCardTileProps) {
  const cost = slot.echo?.cost ?? null;
  const mainStatOptions = cost && curves ? curves.mainStatOptionsByCost[cost] : [];
  const selectedMainOption = mainStatOptions.find((o) => o.propId === slot.mainStatPropId) ?? null;
  const mainStatValue = selectedMainOption
    ? computeEchoMainStatValue(selectedMainOption, slot.level)
    : null;
  // Every echo has 2 main stats -- this fixed one (flat ATK for cost 3/4,
  // flat HP for cost 1) alongside the player-chosen one above.
  const staticOption = cost && curves ? curves.staticMainStatByCost[cost] : null;
  const staticValue = staticOption ? computeEchoMainStatValue(staticOption, slot.level) : null;
  const chosenSetIconUrl = sets.find((s) => s.name === slot.chosenSetName)?.iconUrl ?? null;

  if (!slot.echo) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1.5 border border-border bg-panel-alt p-2 text-center">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-panel text-sm text-text-muted">
          +
        </div>
        <span className="text-[10px] text-text-muted">Empty</span>
      </div>
    );
  }

  const rolledSubstats = slot.substats.filter(
    (s): s is { statName: string; value: number } => s.statName !== null && s.value !== null,
  );

  return (
    <div className="flex h-full flex-col gap-1.5 border border-border bg-panel-alt p-2">
      <div className="flex items-center gap-1.5">
        <div className="relative shrink-0">
          <div
            className={`flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border bg-panel ${cost ? COST_DISC_CLASS[cost] : "border-border text-text-muted"}`}
          >
            {slot.echo.pictureUrl ? (
              <img
                src={slot.echo.pictureUrl}
                alt={slot.echo.name}
                className="h-full w-full object-contain"
              />
            ) : (
              <span className="text-[10px] font-semibold">{cost}</span>
            )}
          </div>
          {/* Sonata-set badge overlapping the echo portrait's corner, same
              placement convention as the real in-game echo card. */}
          {chosenSetIconUrl && (
            <img
              src={chosenSetIconUrl}
              alt={slot.chosenSetName ?? ""}
              className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border border-border bg-panel"
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold text-gold-soft">{slot.echo.name}</p>
          {slot.chosenSetName && (
            <p className="truncate text-[9px] text-text-muted">{slot.chosenSetName}</p>
          )}
        </div>
      </div>

      {(staticValue !== null || (selectedMainOption && mainStatValue !== null)) && (
        <div className="flex flex-col gap-0.5 border-t border-border pt-1">
          {staticOption && staticValue !== null && (
            <div className="flex items-center justify-between gap-1.5 text-[10px]">
              <span className="flex min-w-0 items-center gap-1 truncate text-text-muted">
                <StatIcon icons={statIcons} name={staticOption.statName} />
                {staticOption.statName}
              </span>
              <span className="shrink-0 tabular-nums text-text">
                {formatStatValue(staticValue, staticOption.statName)}
              </span>
            </div>
          )}
          {selectedMainOption && mainStatValue !== null && (
            <div className="flex items-center justify-between gap-1.5 text-[10px]">
              <span className="flex min-w-0 items-center gap-1 truncate text-text-muted">
                <StatIcon icons={statIcons} name={selectedMainOption.statName} />
                {selectedMainOption.statName}
              </span>
              <span className="shrink-0 tabular-nums text-gold-soft">
                {formatStatValue(mainStatValue, selectedMainOption.statName)}
              </span>
            </div>
          )}
        </div>
      )}

      {rolledSubstats.length > 0 && (
        <div className="flex flex-col gap-0.5 border-t border-border pt-1">
          {rolledSubstats.map((sub, i) => (
            <div key={i} className="flex items-center justify-between gap-1.5 text-[9px]">
              <span className="flex min-w-0 items-center gap-1 truncate text-text-muted">
                <StatIcon icons={statIcons} name={sub.statName} />
                {sub.statName}
              </span>
              <span className="shrink-0 tabular-nums text-text">
                {formatStatValue(sub.value, sub.statName)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

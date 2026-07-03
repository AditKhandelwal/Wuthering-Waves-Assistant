import { useState } from "react";
import { Modal } from "./Modal";
import type { EchoCatalog } from "../lib/echoes";
import type { EchoCatalogEntry, EchoSet } from "../types/echo";

interface EchoPickerProps {
  catalog: EchoCatalog;
  sets: EchoSet[];
  slotCost: 1 | 3 | 4;
  recommendedSetNames: string[];
  onSelect: (echo: EchoCatalogEntry, chosenSetName: string) => void;
  onClose: () => void;
}

// Cost tier has no in-game color convention sourced from this app's data --
// this is a UI-only design choice (gold = rarest/highest cost), not a game
// data claim. Spelled out literally per Tailwind v4's dynamic-class-string
// gotcha (see .claude/rules/frontend.md).
const COST_DISC_CLASS: Record<1 | 3 | 4, string> = {
  4: "border-gold text-gold-soft",
  3: "border-gold-soft/60 text-text",
  1: "border-border text-text-muted",
};

function EchoIcon({ echo }: { echo: EchoCatalogEntry }) {
  if (echo.pictureUrl) {
    return (
      <img
        src={echo.pictureUrl}
        alt={echo.name}
        className="h-12 w-12 shrink-0 object-contain"
      />
    );
  }
  return (
    <span
      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border bg-panel-alt text-xs font-semibold ${COST_DISC_CLASS[echo.cost]}`}
    >
      {echo.cost}
    </span>
  );
}

export function EchoPicker({
  catalog,
  sets,
  slotCost,
  recommendedSetNames,
  onSelect,
  onClose,
}: EchoPickerProps) {
  const [activeFilter, setActiveFilter] = useState<string | "all">(
    recommendedSetNames.length > 0 ? recommendedSetNames[0] : "all",
  );

  const echoesForCost = catalog.byCost[slotCost] ?? [];

  const setNamesForCost = [
    ...new Set(echoesForCost.flatMap((e) => e.setNames)),
  ].sort((a, b) => {
    const rank = (name: string) => (recommendedSetNames.includes(name) ? 0 : 1);
    const rankDiff = rank(a) - rank(b);
    if (rankDiff !== 0) return rankDiff;
    return a.localeCompare(b);
  });

  const visibleEchoes =
    activeFilter === "all"
      ? echoesForCost
      : echoesForCost.filter((e) => e.setNames.includes(activeFilter));

  return (
    <Modal onClose={onClose}>
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-text-muted">
        Select Echo
      </h2>

      <div className="mb-4 flex flex-wrap gap-1.5">
        <button
          onClick={() => setActiveFilter("all")}
          className={`rounded-sm border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition ${
            activeFilter === "all"
              ? "border-gold text-gold-soft"
              : "border-border text-text-muted hover:border-gold-soft"
          }`}
        >
          All Sets
        </button>
        {setNamesForCost.map((setName) => {
          const set = sets.find((s) => s.name === setName);
          const isRecommended = recommendedSetNames.includes(setName);
          return (
            <button
              key={setName}
              onClick={() => setActiveFilter(setName)}
              title={set?.effects.map((e) => `${e.pieceCount}pc: ${e.description}`).join("\n")}
              className={`rounded-sm border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition ${
                activeFilter === setName
                  ? "border-gold text-gold-soft"
                  : "border-border text-text-muted hover:border-gold-soft"
              }`}
            >
              {setName}
              {isRecommended && <span className="ml-1 text-gold-soft">★</span>}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        {visibleEchoes.map((echo) => (
          <button
            key={`${echo.name}-${activeFilter}`}
            onClick={() =>
              onSelect(echo, activeFilter === "all" ? echo.setNames[0] : activeFilter)
            }
            className="flex items-center gap-3 rounded-sm border border-border p-3 text-left transition hover:border-gold-soft hover:bg-panel-alt"
          >
            <EchoIcon echo={echo} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-text">{echo.name}</span>
                <span className="shrink-0 rounded-sm border border-border px-1.5 py-0.5 text-[10px] text-text-muted">
                  Cost {echo.cost}
                </span>
                {recommendedSetNames.some((s) => echo.setNames.includes(s)) && (
                  <span className="shrink-0 rounded-sm border border-gold px-1.5 py-0.5 text-[10px] text-gold-soft">
                    ★ Recommended
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-text-muted">{echo.setNames.join(" / ")}</p>
            </div>
          </button>
        ))}
      </div>
    </Modal>
  );
}

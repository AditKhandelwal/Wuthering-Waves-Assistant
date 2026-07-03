import { useState } from "react";
import { Modal } from "./Modal";
import { COST_DISC_CLASS, type EchoCatalog } from "../lib/echoes";
import type { EchoCatalogEntry, EchoSet } from "../types/echo";

interface EchoPickerProps {
  catalog: EchoCatalog;
  sets: EchoSet[];
  recommendedSetNames: string[];
  onSelect: (echo: EchoCatalogEntry, chosenSetName: string) => void;
  onClose: () => void;
}

// Slots aren't fixed to a cost -- real builds vary (4-3-3-1-1, 4-4-1-1-1,
// etc.) -- so every cost tier is always offered. Echoes are grouped by cost
// within the list (highest first) so a specific tier is still easy to scan.
const COST_TIERS = [4, 3, 1] as const;

const ALL_SETS = "all";

function SetIcon({ set }: { set: EchoSet | undefined }) {
  if (!set?.iconUrl) return null;
  return <img src={set.iconUrl} alt={set.name} className="h-4 w-4 shrink-0" />;
}

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
  recommendedSetNames,
  onSelect,
  onClose,
}: EchoPickerProps) {
  const [activeFilter, setActiveFilter] = useState<string>(
    recommendedSetNames.length > 0 ? recommendedSetNames[0] : ALL_SETS,
  );
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const allEchoes = [...catalog.byCost[4], ...catalog.byCost[3], ...catalog.byCost[1]];

  const allSetNames = Object.keys(catalog.bySetName).sort((a, b) => {
    const rank = (name: string) => (recommendedSetNames.includes(name) ? 0 : 1);
    const rankDiff = rank(a) - rank(b);
    if (rankDiff !== 0) return rankDiff;
    return a.localeCompare(b);
  });

  const visibleEchoes =
    activeFilter === ALL_SETS ? allEchoes : allEchoes.filter((e) => e.setNames.includes(activeFilter));

  function selectEcho(echo: EchoCatalogEntry) {
    const chosenSetName = activeFilter !== ALL_SETS ? activeFilter : echo.setNames[0];
    onSelect(echo, chosenSetName);
  }

  const activeFilterLabel = activeFilter === ALL_SETS ? "All Sets" : activeFilter;
  const activeFilterIsRecommended = recommendedSetNames.includes(activeFilter);

  return (
    <Modal onClose={onClose} panelClassName="flex h-[42rem] w-[36rem] max-w-[90vw] flex-col">
      <h2 className="mb-4 shrink-0 text-xs font-semibold uppercase tracking-widest text-text-muted">
        Select Echo
      </h2>

      <div
        className="relative mb-4 shrink-0"
        tabIndex={-1}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setIsFilterOpen(false);
        }}
      >
        <button
          onClick={() => setIsFilterOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-2 rounded-sm border border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-text transition hover:border-gold-soft"
        >
          <span className="flex items-center gap-1.5">
            {activeFilter !== ALL_SETS && (
              <SetIcon set={sets.find((s) => s.name === activeFilter)} />
            )}
            {activeFilterLabel}
            {activeFilterIsRecommended && <span className="text-gold-soft">★</span>}
          </span>
          <svg
            viewBox="0 0 20 20"
            className={`h-3 w-3 shrink-0 fill-text-muted transition-transform ${isFilterOpen ? "rotate-180" : ""}`}
          >
            <path d="M5 7l5 6 5-6z" />
          </svg>
        </button>

        {isFilterOpen && (
          <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto border border-border bg-panel-alt">
            <button
              onClick={() => {
                setActiveFilter(ALL_SETS);
                setIsFilterOpen(false);
              }}
              className={`block w-full px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide transition hover:bg-panel ${
                activeFilter === ALL_SETS ? "text-gold-soft" : "text-text-muted"
              }`}
            >
              All Sets
            </button>
            {allSetNames.map((setName) => {
              const set = sets.find((s) => s.name === setName);
              const isRecommended = recommendedSetNames.includes(setName);
              return (
                <button
                  key={setName}
                  onClick={() => {
                    setActiveFilter(setName);
                    setIsFilterOpen(false);
                  }}
                  title={set?.effects.map((e) => `${e.pieceCount}pc: ${e.description}`).join("\n")}
                  className={`flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide transition hover:bg-panel ${
                    activeFilter === setName ? "text-gold-soft" : "text-text-muted"
                  }`}
                >
                  <SetIcon set={set} />
                  {setName}
                  {isRecommended && <span className="text-gold-soft">★</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {visibleEchoes.length === 0 && (
          <p className="text-xs text-text-muted">No echoes match this filter.</p>
        )}
        {COST_TIERS.map((tier) => {
          const group = visibleEchoes.filter((e) => e.cost === tier);
          if (group.length === 0) return null;
          return (
            <div key={tier} className="mb-4">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                Cost {tier}
              </p>
              <div className="flex flex-col gap-2">
                {group.map((echo) => (
                  <button
                    key={echo.name}
                    onClick={() => selectEcho(echo)}
                    className="flex items-center gap-3 rounded-sm border border-border p-3 text-left transition hover:border-gold-soft hover:bg-panel-alt"
                  >
                    <EchoIcon echo={echo} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-text">{echo.name}</span>
                        {recommendedSetNames.some((s) => echo.setNames.includes(s)) && (
                          <span className="shrink-0 rounded-sm border border-gold px-1.5 py-0.5 text-[10px] text-gold-soft">
                            ★ Recommended
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                        {echo.setNames.map((setName, i) => (
                          <span key={setName} className="flex items-center gap-1 text-xs text-text-muted">
                            <SetIcon set={sets.find((s) => s.name === setName)} />
                            {setName}
                            {i < echo.setNames.length - 1 && <span className="text-text-muted">/</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

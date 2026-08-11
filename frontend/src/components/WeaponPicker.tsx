import { useState } from "react";
import { Modal } from "./Modal";
import type { WeaponCatalogEntry } from "../types/weapon";

interface WeaponPickerProps {
  weapons: WeaponCatalogEntry[];
  // Ordered by the character's own guide (weapon.items[]) -- the first
  // entry is treated as best-in-slot, the rest as also-recommended. This is
  // an inference (no explicit rank field exists in the source data), based
  // on Kuro's guide consistently listing the top pick first.
  recommendedOrder: string[];
  onSelect: (weapon: WeaponCatalogEntry) => void;
  onClose: () => void;
}

export function WeaponPicker({
  weapons,
  recommendedOrder,
  onSelect,
  onClose,
}: WeaponPickerProps) {
  const [query, setQuery] = useState("");

  const bestInSlotId = recommendedOrder[0];
  const recommendedIds = new Set(recommendedOrder.slice(1));

  const sorted = [...weapons].sort((a, b) => {
    const rank = (gbId: string) => (gbId === bestInSlotId ? 0 : recommendedIds.has(gbId) ? 1 : 2);
    const rankDiff = rank(a.gbId) - rank(b.gbId);
    if (rankDiff !== 0) return rankDiff;
    return b.star - a.star || a.name.localeCompare(b.name);
  });

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? sorted.filter((weapon) => weapon.name.toLowerCase().includes(normalizedQuery))
    : sorted;

  return (
    <Modal onClose={onClose}>
      <div className="sticky top-0 z-10 -mt-5 -mx-5 bg-panel px-5 pt-5 pb-3">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-text-muted">
          Select Weapon
        </h2>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search weapons..."
          autoFocus
          className="w-full rounded-sm border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-gold-soft focus:outline-none"
        />
      </div>
      <div className="h-3" />
      {filtered.length === 0 && (
        <p className="py-6 text-center text-sm text-text-muted">No weapons match "{query}".</p>
      )}
      <div className="flex flex-col gap-2">
        {filtered.map((weapon) => (
          <button
            key={weapon.gbId}
            onClick={() => onSelect(weapon)}
            className="flex items-start gap-3 rounded-sm border border-border p-3 text-left transition hover:border-gold-soft hover:bg-panel-alt"
          >
            <img
              src={weapon.pictureUrl}
              alt={weapon.name}
              className="h-12 w-12 shrink-0 object-contain"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-text">{weapon.name}</span>
                {weapon.gbId === bestInSlotId ? (
                  <span className="shrink-0 rounded-sm border border-gold px-1.5 py-0.5 text-[10px] text-gold-soft">
                    ★ Best in Slot
                  </span>
                ) : (
                  recommendedIds.has(weapon.gbId) && (
                    <span className="shrink-0 rounded-sm border border-gold px-1.5 py-0.5 text-[10px] text-gold-soft">
                      Recommended
                    </span>
                  )
                )}
              </div>
              <p className="mt-1 text-xs text-text-muted">{weapon.effectDescription}</p>
            </div>
          </button>
        ))}
      </div>
    </Modal>
  );
}

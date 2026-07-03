import { Modal } from "./Modal";
import type { WeaponCatalogEntry } from "../types/weapon";

interface WeaponPickerProps {
  weapons: WeaponCatalogEntry[];
  recommendedIds: Set<string>;
  onSelect: (weapon: WeaponCatalogEntry) => void;
  onClose: () => void;
}

export function WeaponPicker({ weapons, recommendedIds, onSelect, onClose }: WeaponPickerProps) {
  const sorted = [...weapons].sort((a, b) => {
    const aRec = recommendedIds.has(a.gbId) ? 0 : 1;
    const bRec = recommendedIds.has(b.gbId) ? 0 : 1;
    if (aRec !== bRec) return aRec - bRec;
    return b.star - a.star || a.name.localeCompare(b.name);
  });

  return (
    <Modal onClose={onClose}>
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-text-muted">
        Select Weapon
      </h2>
      <div className="flex flex-col gap-2">
        {sorted.map((weapon) => (
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
                {recommendedIds.has(weapon.gbId) && (
                  <span className="shrink-0 rounded-sm border border-gold px-1.5 py-0.5 text-[10px] text-gold-soft">
                    Recommended
                  </span>
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

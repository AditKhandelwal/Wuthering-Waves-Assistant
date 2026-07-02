import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadRoster } from "../lib/characters";
import type { Character, ElementName, RosterData, WeaponTypeName } from "../types/character";
import { CharacterCard } from "../components/CharacterCard";
import { IconToggleRow } from "../components/IconToggleRow";

const ELEMENT_ORDER: ElementName[] = [
  "Spectro",
  "Havoc",
  "Glacio",
  "Fusion",
  "Electro",
  "Aero",
];

const WEAPON_TYPE_ORDER: WeaponTypeName[] = [
  "Sword",
  "Broadblade",
  "Pistols",
  "Gauntlets",
  "Rectifier",
];

export function CharacterSelectPage() {
  const [roster, setRoster] = useState<RosterData | null>(null);
  const [elementFilter, setElementFilter] = useState<ElementName | null>(null);
  const [weaponTypeFilter, setWeaponTypeFilter] = useState<WeaponTypeName | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadRoster().then(setRoster);
  }, []);

  const filtered = useMemo<Character[]>(() => {
    if (!roster) return [];
    return roster.characters.filter(
      (c) =>
        (!elementFilter || c.element === elementFilter) &&
        (!weaponTypeFilter || c.weaponType === weaponTypeFilter),
    );
  }, [roster, elementFilter, weaponTypeFilter]);

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-wide text-gold-soft">
          SELECT RESONATOR
        </h1>
        <span className="text-sm text-text-muted">
          {roster ? `${filtered.length} / ${roster.characters.length}` : "..."}
        </span>
      </header>

      {roster && (
        <div className="mb-8 flex flex-col gap-3 border-b border-border pb-6">
          <IconToggleRow
            options={ELEMENT_ORDER.map((el) => ({
              value: el,
              label: el,
              icon: roster.elementIcons[el],
            }))}
            selected={elementFilter}
            onChange={setElementFilter}
          />
          <IconToggleRow
            options={WEAPON_TYPE_ORDER.map((wt) => ({
              value: wt,
              label: wt,
              icon: roster.weaponTypeIcons[wt],
            }))}
            selected={weaponTypeFilter}
            onChange={setWeaponTypeFilter}
          />
        </div>
      )}

      {!roster ? (
        <p className="text-text-muted">Loading roster...</p>
      ) : (
        <div className="grid grid-cols-4 gap-x-6 gap-y-8 sm:grid-cols-6 md:grid-cols-8">
          {filtered.map((character) => (
            <CharacterCard
              key={character.roleGbId}
              character={character}
              onSelect={(c) => navigate(`/build/${c.roleGbId}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

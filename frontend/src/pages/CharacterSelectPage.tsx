import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCharacters } from "../lib/characters";
import type { Character } from "../types/character";
import { CharacterCard } from "../components/CharacterCard";

export function CharacterSelectPage() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    getCharacters().then((data) => {
      setCharacters(data);
      setLoading(false);
    });
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <header className="mb-8 flex items-center justify-between border-b border-border pb-4">
        <h1 className="text-lg font-semibold tracking-wide text-gold-soft">
          SELECT RESONATOR
        </h1>
        <span className="text-sm text-text-muted">
          {characters.length} characters
        </span>
      </header>

      {loading ? (
        <p className="text-text-muted">Loading roster...</p>
      ) : (
        <div className="grid grid-cols-4 gap-x-6 gap-y-8 sm:grid-cols-6 md:grid-cols-8">
          {characters.map((character) => (
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

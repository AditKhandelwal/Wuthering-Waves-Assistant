import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { loadRoster } from "../lib/characters";
import { computeStats, loadStatCurves } from "../lib/stats";
import type { Character } from "../types/character";
import type { StatCurveData } from "../types/stats";

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="clip-corner border border-border bg-panel p-5">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-text-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function BuildScreenPage() {
  const { characterId } = useParams();
  const [character, setCharacter] = useState<Character | null>(null);
  const [elementIcon, setElementIcon] = useState<string | null>(null);
  const [curves, setCurves] = useState<StatCurveData | null>(null);
  const [level, setLevel] = useState(1);

  useEffect(() => {
    loadRoster().then(({ characters, elementIcons }) => {
      const found = characters.find((c) => c.roleGbId === characterId) ?? null;
      setCharacter(found);
      setElementIcon(found ? elementIcons[found.element] : null);
    });
    loadStatCurves().then(setCurves);
    setLevel(1);
  }, [characterId]);

  const stats = character && curves ? computeStats(curves, character.roleGbId, level) : null;

  if (!character) {
    return (
      <div className="mx-auto max-w-6xl px-8 py-10">
        <p className="text-text-muted">Loading...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <Link
        to="/"
        className="mb-6 inline-block text-sm text-text-muted hover:text-gold-soft transition"
      >
        &larr; Characters
      </Link>

      <div className="grid grid-cols-[240px_1fr] gap-8">
        {/* Left: portrait + level */}
        <div className="flex flex-col gap-4">
          <div className="clip-corner overflow-hidden border border-border bg-panel">
            <img
              src={character.illustrationPictureUrl}
              alt={character.name}
              className="h-72 w-full object-cover"
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              {elementIcon && (
                <img src={elementIcon} alt={character.element} className="h-6 w-6" />
              )}
              <h1 className="text-xl font-semibold text-gold-soft">{character.name}</h1>
            </div>
            <p className="text-sm text-text-muted">{character.element}</p>
          </div>
          <Panel title="Level">
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={90}
                value={level}
                onChange={(e) => setLevel(Number(e.target.value))}
                className="min-w-0 flex-1 accent-gold"
              />
              <span className="w-16 shrink-0 whitespace-nowrap text-right text-sm text-gold-soft">
                {level} / 90
              </span>
            </div>

            {stats && (
              <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div>
                  <dt className="text-[10px] uppercase tracking-wide text-text-muted">HP</dt>
                  <dd className="text-sm text-text">{stats.hp.toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wide text-text-muted">ATK</dt>
                  <dd className="text-sm text-text">{stats.atk.toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wide text-text-muted">DEF</dt>
                  <dd className="text-sm text-text">{stats.def.toLocaleString()}</dd>
                </div>
              </dl>
            )}
          </Panel>
        </div>

        {/* Right: build sections (stubs for now) */}
        <div className="flex flex-col gap-6">
          <Panel title="Weapon">
            <p className="text-sm text-text-muted">Weapon picker — coming soon.</p>
          </Panel>

          <Panel title="Sequence Nodes">
            <div className="flex gap-2">
              {Array.from({ length: 6 }, (_, i) => (
                <span
                  key={i}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-xs text-text-muted"
                >
                  {i + 1}
                </span>
              ))}
            </div>
          </Panel>

          <Panel title="Talents">
            <p className="text-sm text-text-muted">
              Normal Attack, Resonance Skill, Forte Circuit, Resonance Liberation,
              Intro Skill — leveling coming soon.
            </p>
          </Panel>

          <Panel title="Echoes">
            <div className="flex gap-3">
              {Array.from({ length: 5 }, (_, i) => (
                <span
                  key={i}
                  className="flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-border text-2xl text-text-muted"
                >
                  +
                </span>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

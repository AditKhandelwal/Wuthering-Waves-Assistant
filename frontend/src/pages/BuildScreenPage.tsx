import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { SequenceNodeRow } from "../components/SequenceNodeRow";
import { StatBox } from "../components/StatBox";
import { WeaponPicker } from "../components/WeaponPicker";
import { loadRoster } from "../lib/characters";
import { loadSequenceNodes } from "../lib/sequenceNodes";
import { loadStatIcons } from "../lib/statIcons";
import { computeStats, loadStatCurves } from "../lib/stats";
import { renderRankScaledText } from "../lib/text";
import {
  computeWeaponAtk,
  computeWeaponSecondaryStat,
  loadWeaponCatalog,
  loadWeaponStatCurves,
} from "../lib/weapons";
import type { Character } from "../types/character";
import type { SequenceNode } from "../types/sequenceNode";
import type { StatCurveData } from "../types/stats";
import type { WeaponCatalog } from "../lib/weapons";
import type { WeaponCatalogEntry, WeaponStatCurves } from "../types/weapon";

function StatIcon({ icons, name }: { icons: Record<string, string> | null; name: string }) {
  const url = icons?.[name];
  if (!url) return null;
  return <img src={url} alt={name} className="h-3.5 w-3.5" />;
}

// box-shadow-based rings/glows don't follow clip-path -- they'd render as a
// plain rectangle around the angular clipped corners. `border` and
// `filter: drop-shadow` both respect clip-path, so use those instead to get
// a border+glow that actually hugs the clipped shape. Each class string is
// spelled out fully (not built via template-literal interpolation) because
// Tailwind statically scans source text for complete class names -- a
// dynamically-assembled string never generates any CSS.
const ELEMENT_PORTRAIT_CLASS: Record<Character["element"], string> = {
  Glacio:
    "[border-color:var(--color-element-glacio)] [filter:drop-shadow(0_0_10px_color-mix(in_srgb,var(--color-element-glacio)_45%,transparent))]",
  Fusion:
    "[border-color:var(--color-element-fusion)] [filter:drop-shadow(0_0_10px_color-mix(in_srgb,var(--color-element-fusion)_45%,transparent))]",
  Electro:
    "[border-color:var(--color-element-electro)] [filter:drop-shadow(0_0_10px_color-mix(in_srgb,var(--color-element-electro)_45%,transparent))]",
  Aero: "[border-color:var(--color-element-aero)] [filter:drop-shadow(0_0_10px_color-mix(in_srgb,var(--color-element-aero)_45%,transparent))]",
  Spectro:
    "[border-color:var(--color-element-spectro)] [filter:drop-shadow(0_0_10px_color-mix(in_srgb,var(--color-element-spectro)_45%,transparent))]",
  Havoc:
    "[border-color:var(--color-element-havoc)] [filter:drop-shadow(0_0_10px_color-mix(in_srgb,var(--color-element-havoc)_45%,transparent))]",
};

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
  const [curves, setCurves] = useState<StatCurveData | null>(null);
  const [statIcons, setStatIcons] = useState<Record<string, string> | null>(null);
  const [level, setLevel] = useState(1);

  const [weaponCatalog, setWeaponCatalog] = useState<WeaponCatalog | null>(null);
  const [weaponCurves, setWeaponCurves] = useState<WeaponStatCurves | null>(null);
  const [selectedWeapon, setSelectedWeapon] = useState<WeaponCatalogEntry | null>(null);
  const [weaponLevel, setWeaponLevel] = useState(1);
  const [weaponRank, setWeaponRank] = useState(1);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [sequenceNodes, setSequenceNodes] = useState<SequenceNode[]>([]);
  const [unlockedCount, setUnlockedCount] = useState(0);

  useEffect(() => {
    loadRoster().then(({ characters }) => {
      setCharacter(characters.find((c) => c.roleGbId === characterId) ?? null);
    });
    loadStatCurves().then(setCurves);
    setLevel(1);
    setSelectedWeapon(null);
    setWeaponLevel(1);
    setWeaponRank(1);
    setUnlockedCount(0);
    if (characterId) loadSequenceNodes(characterId).then(setSequenceNodes);
  }, [characterId]);

  useEffect(() => {
    loadWeaponCatalog().then(setWeaponCatalog);
    loadWeaponStatCurves().then(setWeaponCurves);
    loadStatIcons().then(setStatIcons);
  }, []);

  // Default to the character's own top recommended weapon once both the
  // character and catalog have loaded.
  useEffect(() => {
    if (!character || !weaponCatalog || selectedWeapon) return;
    const recommendedIds = weaponCatalog.recommendedByCharacter[character.roleGbId] ?? [];
    const weapons = weaponCatalog.byType[character.weaponType] ?? [];
    const defaultWeapon = weapons.find((w) => w.gbId === recommendedIds[0]) ?? null;
    if (defaultWeapon) setSelectedWeapon(defaultWeapon);
  }, [character, weaponCatalog, selectedWeapon]);

  const stats = character && curves ? computeStats(curves, character.roleGbId, level) : null;
  const weaponAtk =
    selectedWeapon && weaponCurves
      ? computeWeaponAtk(weaponCurves, selectedWeapon.gbId, weaponLevel)
      : null;
  const weaponSecondaryStat =
    selectedWeapon && weaponCurves
      ? computeWeaponSecondaryStat(weaponCurves, selectedWeapon.gbId, weaponLevel)
      : null;
  const recommendedWeaponIds = new Set(
    character && weaponCatalog ? (weaponCatalog.recommendedByCharacter[character.roleGbId] ?? []) : [],
  );

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
          <div
            className={`clip-corner overflow-hidden border-2 bg-panel ${ELEMENT_PORTRAIT_CLASS[character.element]}`}
          >
            <img
              src={character.illustrationPictureUrl}
              alt={character.name}
              className="h-72 w-full object-cover"
            />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gold-soft">{character.name}</h1>
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
                className="w-32 accent-gold"
              />
              <span className="w-16 shrink-0 whitespace-nowrap text-right text-sm text-gold-soft">
                {level} / 90
              </span>
            </div>

            {stats && (
              <div className="mt-4 flex flex-wrap gap-2">
                <StatBox
                  icon={<StatIcon icons={statIcons} name="HP" />}
                  label="HP"
                  value={stats.hp.toLocaleString()}
                />
                <StatBox
                  icon={<StatIcon icons={statIcons} name="ATK" />}
                  label="ATK"
                  value={stats.atk.toLocaleString()}
                />
                <StatBox
                  icon={<StatIcon icons={statIcons} name="DEF" />}
                  label="DEF"
                  value={stats.def.toLocaleString()}
                />
              </div>
            )}
          </Panel>
        </div>

        {/* Right: build sections (stubs for now) */}
        <div className="flex flex-col gap-6">
          <Panel title="Weapon">
            {selectedWeapon ? (
              <div className="flex gap-4">
                <img
                  src={selectedWeapon.pictureUrl}
                  alt={selectedWeapon.name}
                  className="h-16 w-16 shrink-0 object-contain"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-gold-soft">
                      {selectedWeapon.name}
                    </span>
                    <button
                      onClick={() => setPickerOpen(true)}
                      className="shrink-0 rounded-sm border border-gold-soft px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-gold-soft transition hover:bg-panel-alt"
                    >
                      Change
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-text-muted">
                    {renderRankScaledText(selectedWeapon.effectDescription, weaponRank)}
                  </p>

                  <div className="mt-3 flex items-center gap-3">
                    <input
                      type="range"
                      min={1}
                      max={90}
                      value={weaponLevel}
                      onChange={(e) => setWeaponLevel(Number(e.target.value))}
                      className="w-32 accent-gold"
                    />
                    <span className="w-16 shrink-0 whitespace-nowrap text-right text-sm text-gold-soft">
                      {weaponLevel} / 90
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2">
                    {weaponAtk !== null && (
                      <StatBox
                        icon={<StatIcon icons={statIcons} name="ATK" />}
                        label="ATK"
                        value={String(weaponAtk)}
                      />
                    )}
                    {weaponSecondaryStat && (
                      <StatBox
                        icon={<StatIcon icons={statIcons} name={weaponSecondaryStat.name} />}
                        label={weaponSecondaryStat.name}
                        value={weaponSecondaryStat.displayValue}
                      />
                    )}
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wide text-text-muted">Rank</span>
                    {[1, 2, 3, 4, 5].map((rank) => (
                      <button
                        key={rank}
                        onClick={() => setWeaponRank(rank)}
                        className={`flex h-6 w-6 items-center justify-center rounded-sm border text-[10px] transition ${
                          rank === weaponRank
                            ? "border-gold text-gold-soft"
                            : "border-border text-text-muted hover:border-gold-soft"
                        }`}
                      >
                        {rank}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setPickerOpen(true)}
                className="text-sm text-text-muted hover:text-gold-soft transition"
              >
                Select Weapon
              </button>
            )}
          </Panel>

          <Panel title="Sequence Nodes">
            <SequenceNodeRow
              nodes={sequenceNodes}
              unlockedCount={unlockedCount}
              onToggle={(sequence) =>
                setUnlockedCount((current) => (sequence === current ? sequence - 1 : sequence))
              }
            />
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

      {pickerOpen && weaponCatalog && character && (
        <WeaponPicker
          weapons={weaponCatalog.byType[character.weaponType] ?? []}
          recommendedIds={recommendedWeaponIds}
          onSelect={(weapon) => {
            setSelectedWeapon(weapon);
            setWeaponLevel(1);
            setWeaponRank(1);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

import { useState } from "react";
import { EchoCardTile } from "./EchoCardTile";
import { ElementIcon } from "./ElementIcon";
import { FinalStatsGrid } from "./FinalStatsGrid";
import { StatIcon } from "./StatIcon";
import { ELEMENT_PORTRAIT_BORDER_CLASS, ELEMENT_PORTRAIT_GLOW_CLASS } from "../lib/characters";
import { computeActiveSetBonuses, formatStatValue } from "../lib/echoes";
import { computeFinalStats } from "../lib/finalStats";
import { computeWeaponAtk, computeWeaponSecondaryStat } from "../lib/weapons";
import type { Character, ElementName } from "../types/character";
import type { EchoSet, EchoStatCurves, EquippedEcho } from "../types/echo";
import type { SequenceNode } from "../types/sequenceNode";
import type { StatCurveData } from "../types/stats";
import type { InherentSkill, KeynoteSkill, Talent } from "../types/talent";
import type { WeaponCatalogEntry, WeaponStatCurves } from "../types/weapon";

interface BuildCardProps {
  character: Character;
  level: number;
  curves: StatCurveData | null;
  statIcons: Record<string, string> | null;
  elementIcons: Record<ElementName, string> | null;

  selectedWeapon: WeaponCatalogEntry | null;
  weaponLevel: number;
  weaponRank: number;
  weaponCurves: WeaponStatCurves | null;

  sequenceNodes: SequenceNode[];
  unlockedCount: number;

  talents: Talent[];
  talentLevels: number[];
  inherentSkills: InherentSkill[];
  inherentActive: boolean[];
  keynoteSkills: KeynoteSkill[];

  equippedEchoes: EquippedEcho[];
  echoCurves: EchoStatCurves | null;
  echoSets: EchoSet[];
}

// Small solid-looking icon -- two stacked copies compound the source art's
// semi-transparent pixels into a solid white symbol instead of a faint one,
// same technique as SequenceNodeRow/TalentGrid (see .claude/rules/frontend.md).
function SolidIcon({ src, alt, className }: { src: string; alt: string; className: string }) {
  return (
    <span className={`relative ${className}`}>
      <img src={src} alt={alt} className="absolute inset-0 h-full w-full brightness-0 invert" />
      <img src={src} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full brightness-0 invert" />
    </span>
  );
}

function CompactSequenceRow({ nodes, unlockedCount }: { nodes: SequenceNode[]; unlockedCount: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {nodes.map((node) => {
        const unlocked = node.sequence <= unlockedCount;
        return (
          <span
            key={node.sequence}
            title={node.name}
            className={`flex h-8 w-8 shrink-0 rotate-45 items-center justify-center border bg-panel-alt ${
              unlocked
                ? "border-gold shadow-[0_0_8px_color-mix(in_srgb,var(--color-gold)_50%,transparent)]"
                : "border-border opacity-50"
            }`}
          >
            <SolidIcon src={node.pictureUrl} alt={node.name} className="-rotate-45 h-5 w-5" />
          </span>
        );
      })}
    </div>
  );
}

function Connector() {
  return <div className="h-4 w-px bg-border" />;
}

// Vertical offset per column, indexed by distance from the center column
// (Forte Circuit is always index 2 of the 5) -- 0 at the center, growing
// going outward, so the tree reads as a shallow arc/wing (center raised,
// outer columns lower) matching the real in-game Forte tree screenshot.
const ARC_OFFSET_BY_DISTANCE = [0, 14, 46];

// A compact re-creation of the in-game Forte tree: each of the 5 skill
// columns has its own vertical chain connected by a line down to the main
// skill diamond, with the whole column shifted down further the closer it
// is to either edge (see ARC_OFFSET_BY_DISTANCE). Forte Circuit's chain is
// the 2 real Inherent Skills; the other 4 columns show togglable placeholder
// nodes (no real data/icon yet, same "ready for when real data arrives"
// pattern as the original TalentGrid used in the editable view -- these
// represent the removed sequence_stat_nodes.json bonus-stat nodes, kept as
// inert scaffolding, see docs/DATA_REQUIREMENTS.md). Outro Skill and Tune
// Break (roleSkill.keynoteSkills[] -- real, distinct skill categories, not
// the same as Inherent Skills) are shown in their own row below the tree,
// matching a real in-game Forte-tree screenshot (2026-07-03).
function TalentTree({
  talents,
  talentLevels,
  inherentSkills,
  inherentActive,
  keynoteSkills,
}: {
  talents: Talent[];
  talentLevels: number[];
  inherentSkills: InherentSkill[];
  inherentActive: boolean[];
  keynoteSkills: KeynoteSkill[];
}) {
  const [placeholderActive, setPlaceholderActive] = useState<Record<string, boolean>>({});
  const togglePlaceholder = (key: string) =>
    setPlaceholderActive((current) => ({ ...current, [key]: !current[key] }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        {talents.map((talent, i) => {
          const offset = ARC_OFFSET_BY_DISTANCE[Math.abs(i - 2)] ?? 0;
          const isForteCircuit = talent.skillType === "Forte Circuit";
          return (
            <div
              key={talent.skillType}
              className="flex flex-col items-center"
              style={{ marginTop: offset }}
            >
              {isForteCircuit
                ? [...inherentSkills].reverse().map((skill, reverseIndex) => {
                    const index = inherentSkills.length - 1 - reverseIndex;
                    const active = inherentActive[index];
                    return (
                      <div key={skill.name} className="flex flex-col items-center">
                        <span
                          title={`${skill.name}${active ? "" : " (inactive)"}`}
                          className={`flex h-7 w-7 shrink-0 rotate-45 items-center justify-center border bg-panel ${
                            active
                              ? "border-gold shadow-[0_0_6px_color-mix(in_srgb,var(--color-gold)_50%,transparent)]"
                              : "border-border opacity-50"
                          }`}
                        >
                          <SolidIcon src={skill.pictureUrl} alt={skill.name} className="-rotate-45 h-4 w-4" />
                        </span>
                        <Connector />
                      </div>
                    );
                  })
                : [0, 1].map((j) => {
                    const key = `${talent.skillType}-${j}`;
                    const active = placeholderActive[key] ?? false;
                    return (
                      <div key={j} className="flex flex-col items-center">
                        <button
                          onClick={() => togglePlaceholder(key)}
                          title="Placeholder node -- no data yet"
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-panel transition ${
                            active
                              ? "border-gold shadow-[0_0_6px_color-mix(in_srgb,var(--color-gold)_50%,transparent)]"
                              : "border-border opacity-50 hover:border-gold-soft"
                          }`}
                        />
                        <Connector />
                      </div>
                    );
                  })}
              <span
                title={talent.name}
                className="flex h-8 w-8 shrink-0 rotate-45 items-center justify-center border border-gold bg-panel shadow-[0_0_8px_color-mix(in_srgb,var(--color-gold)_50%,transparent)]"
              >
                <SolidIcon src={talent.pictureUrl} alt={talent.name} className="-rotate-45 h-5 w-5" />
              </span>
              <span className="mt-1.5 text-center text-[9px] leading-tight uppercase tracking-wide text-text-muted">
                {talent.skillType}
              </span>
              <span className="text-[10px] tabular-nums text-gold-soft">Lv.{talentLevels[i] ?? 1}</span>
            </div>
          );
        })}
      </div>

      {keynoteSkills.length > 0 && (
        <div className="flex items-start justify-center gap-8 border-t border-border pt-3">
          {keynoteSkills.map((skill) => (
            <div key={skill.skillType} className="flex flex-col items-center gap-1">
              <span
                title={skill.name}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gold bg-panel shadow-[0_0_6px_color-mix(in_srgb,var(--color-gold)_50%,transparent)]"
              >
                <SolidIcon src={skill.pictureUrl} alt={skill.name} className="h-4.5 w-4.5" />
              </span>
              <span className="max-w-20 text-center text-[9px] leading-tight text-text-muted">
                {skill.skillType}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// A shareable, compact, read-only compilation of the current build -- reuses
// the same live state as the editable BuildScreenPage (no separate route/data
// reload, see .claude/rules/frontend.md's data-loading pattern note: this app
// has no persistence yet, so a route swap would lose in-progress edits).
// Unlike the editable view, everything here is display-only (no steppers/
// selects) since a shareable card isn't a place to keep editing from.
export function BuildCard({
  character,
  level,
  curves,
  statIcons,
  elementIcons,
  selectedWeapon,
  weaponLevel,
  weaponRank,
  weaponCurves,
  sequenceNodes,
  unlockedCount,
  talents,
  talentLevels,
  inherentSkills,
  inherentActive,
  keynoteSkills,
  equippedEchoes,
  echoCurves,
  echoSets,
}: BuildCardProps) {
  const activeSetBonuses = computeActiveSetBonuses(equippedEchoes, echoSets);
  const finalStats = curves
    ? computeFinalStats({
        character,
        level,
        curves,
        selectedWeapon,
        weaponLevel,
        weaponCurves,
        equippedEchoes,
        echoCurves,
      })
    : null;
  const weaponAtk =
    selectedWeapon && weaponCurves ? computeWeaponAtk(weaponCurves, selectedWeapon.gbId, weaponLevel) : null;
  const weaponSecondaryStat =
    selectedWeapon && weaponCurves
      ? computeWeaponSecondaryStat(weaponCurves, selectedWeapon.gbId, weaponLevel)
      : null;
  const elementIconUrl = elementIcons?.[character.element];

  return (
    <div
      className="card-atmosphere clip-corner border border-border p-4"
      style={{ "--card-glow-color": `var(--color-element-${character.element.toLowerCase()})` } as React.CSSProperties}
    >
      <div className="grid grid-cols-[240px_1fr] gap-4">
        <div className="min-w-0 flex flex-col gap-3">
          <div className={`min-h-0 flex-1 ${ELEMENT_PORTRAIT_GLOW_CLASS[character.element]}`}>
            <div
              className={`clip-corner h-full w-full overflow-hidden border-2 bg-panel-alt ${ELEMENT_PORTRAIT_BORDER_CLASS[character.element]}`}
            >
              <img
                src={character.illustrationPictureUrl}
                alt={character.name}
                className="h-full w-full object-cover"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            {elementIconUrl && (
              <ElementIcon element={character.element} iconUrl={elementIconUrl} className="h-5 w-5" />
            )}
            <h1 className="truncate text-sm font-semibold text-gold-soft">{character.name}</h1>
            <span className="shrink-0 text-[10px] text-text-muted">Lv.{level}</span>
          </div>

          {selectedWeapon && (
            <div className="flex items-center gap-3 border border-border bg-panel-alt px-3 py-3">
              <img
                src={selectedWeapon.pictureUrl}
                alt={selectedWeapon.name}
                className="h-16 w-16 shrink-0 object-contain"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gold-soft">
                  {selectedWeapon.name}
                </p>
                <p className="text-xs text-text-muted">
                  Lv.{weaponLevel} &middot; Rank {weaponRank}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                  {weaponAtk !== null && (
                    <span className="flex items-center gap-1 text-xs text-text">
                      <StatIcon icons={statIcons} name="ATK" />
                      {weaponAtk}
                    </span>
                  )}
                  {weaponSecondaryStat && (
                    <span className="flex items-center gap-1 text-xs text-text">
                      <StatIcon icons={statIcons} name={weaponSecondaryStat.name} />
                      {formatStatValue(weaponSecondaryStat.value, weaponSecondaryStat.name)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="min-w-0 flex flex-col gap-3">
          <div className="flex items-start gap-4 border-b border-border pb-3">
            <div className="flex flex-col gap-3">
              {finalStats && <FinalStatsGrid stats={finalStats} statIcons={statIcons} />}
              <CompactSequenceRow nodes={sequenceNodes} unlockedCount={unlockedCount} />
            </div>
            <div className="min-w-0 flex-1 border-l border-border pl-4">
              <TalentTree
                talents={talents}
                talentLevels={talentLevels}
                inherentSkills={inherentSkills}
                inherentActive={inherentActive}
                keynoteSkills={keynoteSkills}
              />
            </div>
          </div>

          {activeSetBonuses.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {activeSetBonuses.map((bonus) => (
                <span
                  key={bonus.setName}
                  className="rounded-sm border border-gold px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-gold-soft"
                >
                  {bonus.setName} ({bonus.count})
                </span>
              ))}
            </div>
          )}

          <div className="grid grid-cols-5 gap-1.5">
            {equippedEchoes.map((slot, i) => (
              <EchoCardTile key={i} slot={slot} curves={echoCurves} statIcons={statIcons} sets={echoSets} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

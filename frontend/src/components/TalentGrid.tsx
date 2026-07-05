import type { CharacterForteNodes, ForteNode } from "../types/forteNode";
import type { InherentSkill, KeynoteSkill, Talent } from "../types/talent";

interface TalentGridProps {
  talents: Talent[];
  levels: number[];
  onChange: (index: number, level: number) => void;
  inherentSkills: InherentSkill[];
  inherentActive: boolean[];
  onToggleInherent: (index: number) => void;
  keynoteSkills: KeynoteSkill[];
  forteNodes: CharacterForteNodes | null;
  // Flat array of 8 booleans: [col0-lower, col0-upper, col1-lower, col1-upper, ...]
  // Columns are in the same order as SKILL_TO_FORTE_COLUMN keys.
  forteNodeActive: boolean[];
  onToggleForteNode: (flatIndex: number) => void;
  statIcons: Record<string, string> | null;
}

function Connector() {
  return <div className="h-9 w-px bg-border" />;
}

// Vertical offset per column, indexed by distance from the center column
// (Forte Circuit is always index 2 of the 5) -- 0 at the center, growing
// going outward, so the tree reads as a shallow arc/wing (center raised,
// outer columns lower), matching a real in-game Forte-tree screenshot
// (2026-07-03) -- same layout as BuildCard's TalentTree, scaled up slightly
// for this view's larger nodes.
const ARC_OFFSET_BY_DISTANCE = [0, 20, 64];

// Maps the talent's skillType string to the forte node column key.
// Forte Circuit is omitted — that column uses Inherent Skills instead.
const SKILL_TO_FORTE_COLUMN: Record<string, keyof CharacterForteNodes> = {
  "Normal Attack": "normal_attack",
  "Resonance Skill": "resonance_skill",
  "Resonance Liberation": "resonance_liberation",
  "Intro Skill": "intro_skill",
};

// Column order for the flat forteNodeActive array (must match above, without Forte Circuit).
const FORTE_COLUMN_ORDER: Array<keyof CharacterForteNodes> = [
  "normal_attack",
  "resonance_skill",
  "resonance_liberation",
  "intro_skill",
];

function ForteNodeButton({
  node,
  active,
  onToggle,
  statIcons,
}: {
  node: ForteNode;
  active: boolean;
  onToggle: () => void;
  statIcons: Record<string, string> | null;
}) {
  const iconUrl = statIcons?.[node.stat];
  return (
    <div className="flex flex-col items-center">
      <button
        onClick={onToggle}
        title={`${node.stat} +${node.value.toFixed(1)}%`}
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-panel transition ${
          active
            ? "border-gold shadow-[0_0_8px_color-mix(in_srgb,var(--color-gold)_50%,transparent)]"
            : "border-border opacity-50 hover:border-gold-soft"
        }`}
      >
        {iconUrl ? (
          <span className="relative h-5 w-5">
            <img src={iconUrl} alt={node.stat} className="absolute inset-0 h-full w-full brightness-0 invert" />
            <img src={iconUrl} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full brightness-0 invert" />
          </span>
        ) : (
          <span className={`text-[7px] font-bold leading-none ${active ? "text-gold" : "text-text-muted"}`}>
            {node.stat.slice(0, 3)}
          </span>
        )}
      </button>
      <Connector />
    </div>
  );
}

export function TalentGrid({
  talents,
  levels,
  onChange,
  inherentSkills,
  inherentActive,
  onToggleInherent,
  keynoteSkills,
  forteNodes,
  forteNodeActive,
  onToggleForteNode,
  statIcons,
}: TalentGridProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        {talents.map((talent, i) => {
          const level = levels[i] ?? 1;
          const isForteCircuit = talent.skillType === "Forte Circuit";
          const offset = ARC_OFFSET_BY_DISTANCE[Math.abs(i - 2)] ?? 0;
          const forteColKey = SKILL_TO_FORTE_COLUMN[talent.skillType];
          const colNodes = forteNodes && forteColKey ? forteNodes[forteColKey] : null;
          const colOrderIndex = forteColKey ? FORTE_COLUMN_ORDER.indexOf(forteColKey) : -1;

          return (
            <div
              key={talent.skillType}
              className="flex flex-col items-center"
              style={{ marginTop: offset }}
            >
              {isForteCircuit
                ? // Real per-character data doesn't tell us which of the 5
                  // columns each Inherent Skill actually sits above in-game
                  // (confirmed varies per character, not text-inferable) --
                  // both are stacked above Forte Circuit as a deliberate
                  // simplification rather than guessing a possibly-wrong column.
                  [...inherentSkills].reverse().map((skill, reverseIndex) => {
                    const index = inherentSkills.length - 1 - reverseIndex;
                    const active = inherentActive[index];
                    return (
                      <div key={skill.name} className="flex flex-col items-center">
                        <button
                          onClick={() => onToggleInherent(index)}
                          title={`${skill.name}${active ? "" : " (inactive)"}`}
                          className={`flex h-10 w-10 shrink-0 rotate-45 items-center justify-center border bg-panel transition ${
                            active
                              ? "border-gold shadow-[0_0_8px_color-mix(in_srgb,var(--color-gold)_50%,transparent)]"
                              : "border-border opacity-50 hover:border-gold-soft"
                          }`}
                        >
                          <span className="relative h-6 w-6 -rotate-45">
                            <img
                              src={skill.pictureUrl}
                              alt={skill.name}
                              className="absolute inset-0 h-full w-full brightness-0 invert"
                            />
                            <img
                              src={skill.pictureUrl}
                              alt=""
                              aria-hidden="true"
                              className="absolute inset-0 h-full w-full brightness-0 invert"
                            />
                          </span>
                        </button>
                        <Connector />
                      </div>
                    );
                  })
                : colNodes
                  ? // Real forte node data — render upper (j=0) then lower (j=1)
                    // Upper (index 1 in data) renders first (top of column, further from skill).
                    // Lower (index 0 in data) renders second (closer to skill).
                    [1, 0].map((tierIndex) => {
                      const node = colNodes[tierIndex];
                      const flatIndex = colOrderIndex * 2 + tierIndex;
                      const active = forteNodeActive[flatIndex] ?? false;
                      return (
                        <ForteNodeButton
                          key={tierIndex}
                          node={node}
                          active={active}
                          onToggle={() => onToggleForteNode(flatIndex)}
                          statIcons={statIcons}
                        />
                      );
                    })
                  : // No forte data for this column — plain placeholder circles
                    [0, 1].map((j) => (
                      <div key={j} className="flex flex-col items-center">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-panel opacity-30" />
                        <Connector />
                      </div>
                    ))}

              <span
                title={talent.name}
                className="flex h-10 w-10 shrink-0 rotate-45 items-center justify-center border border-gold bg-panel shadow-[0_0_8px_color-mix(in_srgb,var(--color-gold)_50%,transparent)]"
              >
                {/* Two stacked copies compound the icon's semi-transparent
                    pixels into a solid-looking white symbol -- same technique
                    as SequenceNodeRow. */}
                <span className="relative h-6 w-6 -rotate-45">
                  <img
                    src={talent.pictureUrl}
                    alt={talent.name}
                    className="absolute inset-0 h-full w-full brightness-0 invert"
                  />
                  <img
                    src={talent.pictureUrl}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 h-full w-full brightness-0 invert"
                  />
                </span>
              </span>
              <span className="mt-4 text-center text-[9px] leading-tight uppercase tracking-wide text-text-muted">
                {talent.skillType}
              </span>
              <div className="mt-1 flex items-center gap-1">
                <button
                  onClick={() => onChange(i, level - 1)}
                  disabled={level <= 1}
                  className="flex h-5 w-5 items-center justify-center rounded-sm border border-border text-xs text-text-muted transition hover:border-gold-soft hover:text-gold-soft disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-border disabled:hover:text-text-muted"
                >
                  −
                </button>
                <span className="w-9 text-center text-xs tabular-nums text-gold-soft">
                  {level}/10
                </span>
                <button
                  onClick={() => onChange(i, level + 1)}
                  disabled={level >= 10}
                  className="flex h-5 w-5 items-center justify-center rounded-sm border border-border text-xs text-text-muted transition hover:border-gold-soft hover:text-gold-soft disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-border disabled:hover:text-text-muted"
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {keynoteSkills.length > 0 && (
        <div className="flex items-start justify-center gap-10 border-t border-border pt-4">
          {keynoteSkills.map((skill) => (
            <div key={skill.skillType} className="flex flex-col items-center gap-1.5">
              <span
                title={skill.name}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gold bg-panel shadow-[0_0_8px_color-mix(in_srgb,var(--color-gold)_50%,transparent)]"
              >
                <span className="relative h-6 w-6">
                  <img
                    src={skill.pictureUrl}
                    alt={skill.name}
                    className="absolute inset-0 h-full w-full brightness-0 invert"
                  />
                  <img
                    src={skill.pictureUrl}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 h-full w-full brightness-0 invert"
                  />
                </span>
              </span>
              <span className="max-w-24 text-center text-[10px] leading-tight text-text-muted">
                {skill.skillType}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import type { InherentSkill, Talent } from "../types/talent";

interface TalentGridProps {
  talents: Talent[];
  levels: number[];
  onChange: (index: number, level: number) => void;
  inherentSkills: InherentSkill[];
  inherentActive: boolean[];
  onToggleInherent: (index: number) => void;
}

function Connector() {
  return <div className="h-2 w-px bg-border" />;
}

export function TalentGrid({
  talents,
  levels,
  onChange,
  inherentSkills,
  inherentActive,
  onToggleInherent,
}: TalentGridProps) {
  return (
    <div className="flex items-end justify-between gap-2">
      {talents.map((talent, i) => {
        const level = levels[i] ?? 1;
        const isForteCircuit = talent.skillType === "Forte Circuit";

        return (
          <div key={talent.skillType} className="flex flex-col items-center">
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
                        className={`flex h-8 w-8 shrink-0 rotate-45 items-center justify-center border bg-panel transition ${
                          active
                            ? "border-gold shadow-[0_0_8px_color-mix(in_srgb,var(--color-gold)_50%,transparent)]"
                            : "border-border opacity-50 hover:border-gold-soft"
                        }`}
                      >
                        <span className="relative h-5 w-5 -rotate-45">
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
              : // Decorative placeholders -- no data source for these, so
                // they're inert (not clickable, no value) rather than faked.
                [0, 1].map((j) => (
                  <div key={j} className="flex flex-col items-center">
                    <span className="h-4 w-4 rounded-full border border-border opacity-40" />
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
            <span className="mt-1.5 text-center text-[9px] leading-tight uppercase tracking-wide text-text-muted">
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
  );
}

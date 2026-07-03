import type { Talent } from "../types/talent";

interface TalentGridProps {
  talents: Talent[];
  levels: number[];
  onChange: (index: number, level: number) => void;
}

export function TalentGrid({ talents, levels, onChange }: TalentGridProps) {
  return (
    <div className="flex justify-between gap-2">
      {talents.map((talent, i) => {
        const level = levels[i] ?? 1;
        return (
          <div key={talent.skillType} className="flex flex-col items-center gap-1.5">
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
            <span className="text-center text-[9px] leading-tight uppercase tracking-wide text-text-muted">
              {talent.skillType}
            </span>
            <div className="flex items-center gap-1">
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

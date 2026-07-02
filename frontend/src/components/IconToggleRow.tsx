interface IconOption<T extends string> {
  value: T;
  label: string;
  icon: string;
}

interface IconToggleRowProps<T extends string> {
  options: IconOption<T>[];
  selected: T | null;
  onChange: (value: T | null) => void;
}

export function IconToggleRow<T extends string>({
  options,
  selected,
  onChange,
}: IconToggleRowProps<T>) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange(null)}
        className={`rounded-sm border px-3 py-1 text-xs font-semibold tracking-wide transition ${
          selected === null
            ? "border-gold text-gold-soft"
            : "border-border text-text-muted hover:border-gold-soft hover:text-gold-soft"
        }`}
      >
        ALL
      </button>
      {options.map((opt) => {
        const active = selected === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            title={opt.label}
            aria-pressed={active}
            onClick={() => onChange(active ? null : opt.value)}
            className={`flex h-8 w-8 items-center justify-center rounded-full border transition ${
              active
                ? "border-gold bg-panel-alt"
                : "border-border opacity-50 hover:opacity-100 hover:border-gold-soft"
            }`}
          >
            <img src={opt.icon} alt={opt.label} className="h-5 w-5 object-contain" />
          </button>
        );
      })}
    </div>
  );
}

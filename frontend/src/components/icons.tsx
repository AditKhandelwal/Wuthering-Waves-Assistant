type IconProps = { className?: string };

export function HpIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 21s-7.5-4.6-10.1-9.3C.3 8.7 1.7 5 5.3 4.2c2.1-.5 4.2.4 5.3 2.1a1 1 0 0 0 1.6 0c1.1-1.7 3.2-2.6 5.3-2.1 3.6.8 5 4.5 3.4 7.5C19.5 16.4 12 21 12 21z" />
    </svg>
  );
}

export function AtkIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={className}
    >
      <path d="M6.5 17.5 17.5 6.5" />
      <path d="M14 4h6v6" />
      <path d="M6.5 6.5 4 4" />
      <path d="M17.5 17.5 20 20" />
    </svg>
  );
}

export function DefIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2 4 5v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V5l-8-3z" />
    </svg>
  );
}

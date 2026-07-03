interface ModalProps {
  onClose: () => void;
  children: React.ReactNode;
  // Overrides the panel's sizing classes entirely (default is a
  // content-hugging max-h/max-w). Callers that need a fixed size that
  // doesn't jump around as content changes (e.g. EchoPicker) should pass a
  // complete replacement, not an addition -- Tailwind utility classes don't
  // reliably "win" over each other by source order, so mixing default and
  // override sizing classes at once is fragile.
  panelClassName?: string;
}

const DEFAULT_PANEL_SIZE_CLASS = "max-h-[80vh] w-full max-w-lg";

export function Modal({ onClose, children, panelClassName }: ModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      onClick={onClose}
    >
      <div
        className={`clip-corner overflow-y-auto border border-border bg-panel p-5 ${panelClassName ?? DEFAULT_PANEL_SIZE_CLASS}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

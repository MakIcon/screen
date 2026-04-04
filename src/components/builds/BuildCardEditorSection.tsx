import type { ReactNode } from "react";

export type EditorSectionProps = {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
};

export type EditorRowProps = {
  label: string;
  children: ReactNode;
  alignTop?: boolean;
};

export function EditorSection({ title, open, onToggle, children }: EditorSectionProps) {
  return (
    <section className="bce-section">
      <button
        type="button"
        className="bce-section-toggle"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span>{title}</span>
        <svg
          className={`bce-section-chevron ${open ? "bce-section-chevron--open" : ""}`}
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="2 4 6 8 10 4" />
        </svg>
      </button>
      {open && <div className="bce-section-body">{children}</div>}
    </section>
  );
}

export function EditorRow({ label, children, alignTop = false }: EditorRowProps) {
  return (
    <div className={`bce-row ${alignTop ? "bce-row--top" : ""}`}>
      <span className="bce-row-label">{label}</span>
      <div className="bce-row-control">{children}</div>
    </div>
  );
}

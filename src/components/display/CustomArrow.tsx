import "./CustomArrow.css";

export function CustomArrow({ open }: { open: boolean }) {
  return (
    <span className={`custom-arrow ${open ? "open" : ""}`} aria-hidden="true">
      <span />
      <span />
    </span>
  );
}

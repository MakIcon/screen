import type { ReactNode } from "react";
import "./HoverRevealValue.css";

interface HoverRevealValueProps {
  value: string;
  children: ReactNode;
}

export function HoverRevealValue({ value, children }: HoverRevealValueProps) {
  const shownValue = value.trim();

  return (
    <div className="hover-reveal-value">
      <div className="hover-reveal-value-control">{children}</div>
      {shownValue ? (
        <div className="hover-reveal-value-tooltip" aria-hidden="true">
          {shownValue}
        </div>
      ) : null}
    </div>
  );
}

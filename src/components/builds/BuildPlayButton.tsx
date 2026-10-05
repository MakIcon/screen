import type { ButtonHTMLAttributes } from "react";

export type BuildPlayState = "idle" | "starting" | "running";

export function BuildPlayButton({
  state,
  idleLabel = "PLAY BUILD",
  startingLabel = "WORKING...",
  className = "",
  ...buttonProps
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  state: BuildPlayState;
  idleLabel?: string;
  startingLabel?: string;
}) {
  return (
    <button
      {...buttonProps}
      className={`primary-action build-play-action${state === "running" ? " kill-action" : ""}${className ? ` ${className}` : ""}`}
      type="button"
    >
      <span className="bpa-stack">
        <span className="bpa-label">
          {state === "running" ? "STOP GAME" : state === "starting" ? startingLabel : idleLabel}
        </span>
        <span className="bpa-sizer" aria-hidden="true">
          PLAY BUILD
        </span>
        <span className="bpa-sizer" aria-hidden="true">
          STOP GAME
        </span>
      </span>
    </button>
  );
}

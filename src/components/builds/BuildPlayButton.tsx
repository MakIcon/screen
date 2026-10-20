import type { ButtonHTMLAttributes } from "react";
import { useTranslation, type PlainMessageKey } from "../../i18n/locale";

export type BuildPlayState = "idle" | "starting" | "running";

export function BuildPlayButton({
  state,
  idleLabel = "buildPlay.playBuild",
  startingLabel = "buildPlay.starting",
  className = "",
  ...buttonProps
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  state: BuildPlayState;
  /** Message keys, so the button follows the interface language. */
  idleLabel?: PlainMessageKey;
  startingLabel?: PlainMessageKey;
}) {
  const tr = useTranslation();
  return (
    <button
      {...buttonProps}
      className={`primary-action build-play-action${state === "running" ? " kill-action" : ""}${className ? ` ${className}` : ""}`}
      type="button"
    >
      <span className="bpa-stack">
        <span className="bpa-label">
          {state === "running"
            ? tr("buildPlay.stopGame")
            : state === "starting"
              ? tr(startingLabel)
              : tr(idleLabel)}
        </span>
        <span className="bpa-sizer" aria-hidden="true">
          {tr("buildPlay.playBuild")}
        </span>
        <span className="bpa-sizer" aria-hidden="true">
          {tr("buildPlay.stopGame")}
        </span>
      </span>
    </button>
  );
}

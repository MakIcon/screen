import { TAB_TITLE } from "../constants/tabs";
import { useAppearanceText } from "./localization";
import type { AppearanceElementInteractionState, AppearanceElementTarget } from "./types";

export function ElementTargetSummary({
  target,
  interactionState,
}: {
  target: AppearanceElementTarget;
  interactionState?: AppearanceElementInteractionState;
}) {
  const copy = useAppearanceText();
  return (
    <div className="appearance-element-summary">
      <span>
        {target.tab ? TAB_TITLE[target.tab] : copy("ALL TABS")} ·{" "}
        {copy(target.kind === "input" ? "FIELD" : (target.kind ?? "element").toUpperCase())}
        {interactionState && <> · {copy(interactionState.toUpperCase())}</>}
      </span>
      <strong title={target.label}>{target.label}</strong>
      <small>{target.id}</small>
    </div>
  );
}

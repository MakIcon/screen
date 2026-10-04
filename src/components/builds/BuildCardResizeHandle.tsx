import { getBuildCardElementScale, type BuildCardAppearance } from "./BuildCardSettingsPopup";

type Props = {
  appearance: BuildCardAppearance;
  id: string;
};

export function BuildCardResizeHandle({ appearance, id }: Props) {
  return (
    <button
      type="button"
      className="bce-resize-handle"
      data-card-resize-id={id}
      aria-label="Resize element"
      data-tooltip="Drag to resize · Arrow keys to adjust size"
      style={{ transform: `scale(${1 / getBuildCardElementScale(appearance, id)})` }}
    />
  );
}

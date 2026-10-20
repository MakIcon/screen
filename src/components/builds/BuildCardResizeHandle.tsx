import { getBuildCardElementScale, type BuildCardAppearance } from "./BuildCardSettingsPopup";
import { useTranslation } from "../../i18n/locale";

type Props = {
  appearance: BuildCardAppearance;
  id: string;
};

export function BuildCardResizeHandle({ appearance, id }: Props) {
  const tr = useTranslation();
  return (
    <button
      type="button"
      className="bce-resize-handle"
      data-card-resize-id={id}
      aria-label={tr("buildCardResizeHandle.resizeElement")}
      data-tooltip={tr("buildCardResizeHandle.dragToResizeArrow")}
      style={{ transform: `scale(${1 / getBuildCardElementScale(appearance, id)})` }}
    />
  );
}

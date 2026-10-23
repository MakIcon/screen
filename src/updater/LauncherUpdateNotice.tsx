import { useTranslation } from "../i18n/locale";
import type { LauncherUpdateInfo } from "./useLauncherUpdater";

type Props = {
  currentVersion: string | null;
  update: LauncherUpdateInfo | null;
  onOpenRelease: () => void;
  onUpdate: () => void;
};

export function LauncherUpdateNotice({ currentVersion, update, onOpenRelease, onUpdate }: Props) {
  const tr = useTranslation();
  return (
    <div
      className={`settings-update-row${update ? " settings-update-release" : ""}`}
      data-guide-target="settings-updates"
    >
      <div className="settings-update-copy">
        <span className="settings-update-title">{tr("settings.launcherUpdates")}</span>
        {update ? (
          <a
            className="settings-update-note settings-update-release-link"
            href={update.releaseUrl}
            onClick={(event) => {
              event.preventDefault();
              onOpenRelease();
            }}
            aria-label={tr("settings.openRelease", { version: update.version })}
          >
            {tr("settings.viewReleaseOnGitHub")}
            <span aria-hidden="true">↗</span>
          </a>
        ) : (
          <span className="settings-update-note">
            {currentVersion ? `${tr("settings.version")} ${currentVersion}. ` : ""}
            {tr("settings.newVersionsAreChecked")}
          </span>
        )}
      </div>
      {update && (
        <button className="settings-update-action" type="button" onClick={onUpdate}>
          {tr("settings.updateToVersion", { version: update.version })}
        </button>
      )}
    </div>
  );
}

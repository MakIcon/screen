import type { InstanceItem, TabKey } from "../types";
import { BuildPlayButton } from "../components/builds/BuildPlayButton";
import { createPlaceholderAppearanceAttributes } from "../utils/placeholders";
import { useTranslation, Trans } from "../i18n/locale";

interface OverviewTabProps {
  selectedInstance: InstanceItem | null;
  isRunning: (id: string) => boolean;
  resolve: (template: string) => string;
  handleStopGame: (id: string) => void;
  handleLaunchSelected: () => void;
  working: boolean;
  setTabAnimated: (tab: TabKey) => void;
}

export function OverviewTab({
  selectedInstance,
  isRunning,
  resolve,
  handleStopGame,
  handleLaunchSelected,
  working,
  setTabAnimated,
}: OverviewTabProps) {
  const tr = useTranslation();
  if (!selectedInstance) {
    return (
      <section className="launcher-panel">
        <div className="panel-grid panel-grid-overview-minimal">
          <div
            className="panel-card hero-card overview-minimal-card"
            data-guide-target="overview-hero"
          >
            <span className="panel-label">{tr("overview.noBuilds")}</span>

            <h2>
              <Trans k="overview.createFirstBuild" values={{ br: <br /> }} />
            </h2>

            <p className="panel-text">{tr("overview.createAMinecraftBuild")}</p>

            <div className="action-row">
              <button
                className="primary-action play-last-button"
                type="button"
                onClick={() => setTabAnimated("instances")}
                data-mascot-stealable
                data-mascot-label={tr("overview.openBuilds")}
              >
                {tr("overview.openBuilds")}
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="launcher-panel">
      <div className="panel-grid panel-grid-overview-minimal">
        <div
          className="panel-card hero-card overview-minimal-card"
          data-guide-target="overview-hero"
        >
          <span className="panel-label">{tr("overview.lastSession")}</span>

          <h2>
            <Trans k="overview.playLastBuild" values={{ br: <br /> }} />
          </h2>

          <p className="panel-text">{tr("overview.minecraftFilesDownloadAutomatically")}</p>

          <div className="hero-meta two-col-meta">
            <div className="meta-block">
              <span className="meta-title">{tr("common.buildCaps")}</span>
              <strong {...createPlaceholderAppearanceAttributes("%build_name%", resolve)}>
                {resolve("%build_name%")}
              </strong>
            </div>

            <div className="meta-block">
              <span className="meta-title">{tr("overview.mcLoader")}</span>
              <strong
                {...createPlaceholderAppearanceAttributes(
                  "%build_version% / %build_loader%",
                  resolve,
                )}
              >
                {resolve("%build_version% / %build_loader%")}
              </strong>
            </div>

            <div className="meta-block">
              <span className="meta-title">{tr("overview.lastPlayed")}</span>
              <strong {...createPlaceholderAppearanceAttributes("%build_last_played%", resolve)}>
                {resolve("%build_last_played%")}
              </strong>
            </div>

            <div className="meta-block">
              <span className="meta-title">{tr("overview.timeInGame")}</span>
              <strong {...createPlaceholderAppearanceAttributes("%build_playtime%", resolve)}>
                {resolve("%build_playtime%")}
              </strong>
            </div>
          </div>

          <div className="action-row">
            {isRunning(selectedInstance.id) ? (
              <BuildPlayButton
                state="running"
                className="play-last-button"
                onClick={() => handleStopGame(selectedInstance.id)}
              />
            ) : (
              <BuildPlayButton
                state={working ? "starting" : "idle"}
                idleLabel="overview.playLast2"
                className="play-last-button"
                onClick={() => handleLaunchSelected()}
                disabled={working}
                data-mascot-stealable
                data-mascot-label={tr("overview.playLast2")}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

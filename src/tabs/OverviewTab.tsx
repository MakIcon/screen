import type { InstanceItem, TabKey } from "../types";

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
  if (!selectedInstance) {
    return (
      <section className="launcher-panel">
        <div className="panel-grid panel-grid-overview-minimal">
          <div className="panel-card hero-card overview-minimal-card">
            <span className="panel-label">NO BUILDS</span>

            <h2>
              Create your
              <br />
              first build.
            </h2>

            <p className="panel-text">
              BUILDS теперь создают реальные инстансы, скачивают official files и могут запускаться в
              offline mode.
            </p>

            <div className="action-row">
              <button
                className="primary-action play-last-button"
                type="button"
                onClick={() => setTabAnimated("instances")}
                data-mascot-stealable
                data-mascot-label="OPEN BUILDS"
              >
                OPEN BUILDS
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
        <div className="panel-card hero-card overview-minimal-card">
          <span className="panel-label">LAST SESSION</span>

          <h2>
            Play last
            <br />
            build.
          </h2>

          <p className="panel-text">
            Реальный offline launcher: client, libraries, natives и assets скачиваются автоматически
            перед стартом.
          </p>

          <div className="hero-meta two-col-meta">
            <div className="meta-block">
              <span className="meta-title">BUILD</span>
              <strong>{resolve("%build_name%")}</strong>
            </div>

            <div className="meta-block">
              <span className="meta-title">MC / LOADER</span>
              <strong>{resolve("%build_version% / %build_loader%")}</strong>
            </div>

            <div className="meta-block">
              <span className="meta-title">LAST PLAYED</span>
              <strong>{resolve("%build_last_played%")}</strong>
            </div>

            <div className="meta-block">
              <span className="meta-title">TIME IN GAME</span>
              <strong>{resolve("%build_playtime%")}</strong>
            </div>
          </div>

          <div className="action-row">
            {isRunning(selectedInstance.id) ? (
              <button
                className="primary-action play-last-button kill-action build-play-action"
                type="button"
                onClick={() => handleStopGame(selectedInstance.id)}
              >
                <span className="bpa-stack">
                  <span className="bpa-label">■ STOP GAME</span>
                  <span className="bpa-sizer" aria-hidden="true">■ STOP GAME</span>
                </span>
              </button>
            ) : (
              <button
                className="primary-action play-last-button build-play-action"
                type="button"
                onClick={() => handleLaunchSelected()}
                disabled={working}
                data-mascot-stealable
                data-mascot-label="PLAY LAST"
              >
                <span className="bpa-stack">
                  <span className="bpa-label">{working ? "WORKING..." : "PLAY LAST"}</span>
                  <span className="bpa-sizer" aria-hidden="true">■ STOP GAME</span>
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

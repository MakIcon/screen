import type { DiscordRpcPluginSettings } from "../../../types";
import type { PluginSettingsProps } from "../pluginTypes";
import "./DiscordRpcPlugin.css";

type DiscordRpcDisplayMode = DiscordRpcPluginSettings["displayMode"];

const DISCORD_RPC_DISPLAY_MODES: {
  id: DiscordRpcDisplayMode;
  label: string;
}[] = [
  { id: "minecraft", label: "MINECRAFT" },
  { id: "launcher", label: "LAUNCHER" },
  { id: "combined", label: "BOTH" },
];

function DiscordRpcSettingsEditor({
  settings,
  onChange,
}: {
  settings: DiscordRpcPluginSettings;
  onChange: (settings: DiscordRpcPluginSettings) => void;
}) {
  const update = (patch: Partial<DiscordRpcPluginSettings>) => {
    onChange({ ...settings, ...patch });
  };

  const modeTemplates =
    settings.displayMode === "launcher"
      ? {
          detailsKey: "launcherDetailsTemplate" as const,
          stateKey: "launcherStateTemplate" as const,
          detailsPlaceholder: "In ScreenLauncher",
          statePlaceholder: "Managing %total_builds% builds",
        }
      : settings.displayMode === "combined"
        ? {
            detailsKey: "combinedDetailsTemplate" as const,
            stateKey: "combinedStateTemplate" as const,
            detailsPlaceholder: "Playing %build_name%",
            statePlaceholder: "%build_version% / %build_loader% via ScreenLauncher",
          }
        : {
            detailsKey: "detailsTemplate" as const,
            stateKey: "stateTemplate" as const,
            detailsPlaceholder: "Playing %build_name%",
            statePlaceholder: "%build_version% / %build_loader% via ScreenLauncher",
          };

  const hasButton = settings.buttonLabel.trim().length > 0;

  return (
    <div className="discord-rpc-editor">
      <div className="drpc-config">
        <label className="drpc-config-field drpc-config-field--app">
          <span>APPLICATION ID</span>
          <input
            value={settings.applicationId}
            placeholder="Discord application id"
            onChange={(event) => update({ applicationId: event.target.value })}
          />
        </label>

        <div className="drpc-config-field drpc-config-field--grow">
          <span>DISPLAY MODE</span>
          <div className="discord-rpc-segmented-control" role="group">
            {DISCORD_RPC_DISPLAY_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={settings.displayMode === mode.id ? "active" : ""}
                onClick={() => update({ displayMode: mode.id })}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="drpc-preview-head">
        <span>LIVE PREVIEW</span>
        <small>How it shows on your Discord profile — edit any field right here</small>
      </div>

      <div className="drpc-card">
        <div className="drpc-card-title">PLAYING A GAME</div>

        <div className="drpc-card-row">
          <div className="drpc-assets">
            <div
              className={`drpc-large${settings.largeImageKey.trim() ? " is-set" : ""}`}
              title="Large image — asset key from the Developer Portal"
            >
              <input
                value={settings.largeImageKey}
                placeholder="image"
                onChange={(event) => update({ largeImageKey: event.target.value })}
              />
            </div>
            <div
              className={`drpc-small${settings.smallImageKey.trim() ? " is-set" : ""}`}
              title="Small image — asset key (corner badge)"
            >
              <input
                value={settings.smallImageKey}
                placeholder="+"
                onChange={(event) => update({ smallImageKey: event.target.value })}
              />
            </div>
          </div>

          <div className="drpc-lines">
            <input
              className="drpc-line drpc-line--name"
              value={settings.activityNameTemplate}
              placeholder="ScreenLauncher"
              onChange={(event) => update({ activityNameTemplate: event.target.value })}
            />
            <input
              className="drpc-line drpc-line--details"
              value={settings[modeTemplates.detailsKey]}
              placeholder={modeTemplates.detailsPlaceholder}
              onChange={(event) => update({ [modeTemplates.detailsKey]: event.target.value })}
            />
            <input
              className="drpc-line drpc-line--state"
              value={settings[modeTemplates.stateKey]}
              placeholder={modeTemplates.statePlaceholder}
              onChange={(event) => update({ [modeTemplates.stateKey]: event.target.value })}
            />
            <span className="drpc-timer is-on">
              <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="2" y="6" width="20" height="14" rx="2" fill="currentColor" />
                <path d="M7 6V4h10v2" stroke="currentColor" strokeWidth="2" fill="none" />
              </svg>
              0:00 elapsed
            </span>
          </div>
        </div>

        <div className={`drpc-card-button${hasButton ? " is-set" : ""}`}>
          <input
            className="drpc-btn-label"
            value={settings.buttonLabel}
            placeholder="+ Add a button (optional)"
            onChange={(event) => update({ buttonLabel: event.target.value })}
          />
          {hasButton && (
            <input
              className="drpc-btn-url"
              value={settings.buttonUrl}
              placeholder="https://link-the-button-opens"
              onChange={(event) => update({ buttonUrl: event.target.value })}
            />
          )}
        </div>
      </div>

      <p className="drpc-hint">
        Placeholders: <code>%build_name%</code> <code>%build_version%</code>{" "}
        <code>%build_loader%</code> <code>%total_builds%</code>. Image fields take the{" "}
        <em>asset name</em> you uploaded under Rich Presence → Art Assets in the Discord Developer
        Portal.
      </p>
    </div>
  );
}

export function DiscordRpcSettings({ plugins, onChange }: PluginSettingsProps) {
  return (
    <DiscordRpcSettingsEditor
      settings={plugins.discordRpc}
      onChange={(discordRpc) => onChange({ ...plugins, discordRpc })}
    />
  );
}

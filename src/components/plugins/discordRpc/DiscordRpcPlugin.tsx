import { TextField } from "../../inputs/TextField";
import type { DiscordRpcPluginSettings } from "../../../types";
import type { PluginSettingsProps } from "../pluginTypes";
import { PluginSettingsGroup } from "../PluginSettingsGroup";
import { PlaceholderGuideButton } from "../../placeholders/PlaceholderGuideButton";
import "./DiscordRpcPlugin.css";
import { useTranslation } from "../../../i18n/locale";

type DiscordRpcDisplayMode = DiscordRpcPluginSettings["displayMode"];

const DISCORD_RPC_DISPLAY_MODES: DiscordRpcDisplayMode[] = ["minecraft", "launcher", "combined"];

function DiscordRpcSettingsEditor({
  settings,
  onChange,
}: {
  settings: DiscordRpcPluginSettings;
  onChange: (settings: DiscordRpcPluginSettings) => void;
}) {
  const tr = useTranslation();
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

  return (
    <div className="discord-rpc-editor">
      <PluginSettingsGroup
        title={tr("discordRpc.connectToDiscord")}
        description={tr("discordRpc.discordApplicationAndDisplay")}
        collapsible={false}
      >
        <div className="drpc-config">
          <label className="drpc-config-field drpc-config-field--app">
            <span>{tr("ui.applicationId")}</span>
            <TextField
              value={settings.applicationId}
              placeholder={tr("discordRpc.discordApplicationId")}
              spellCheck={false}
              onChange={(event) => update({ applicationId: event.target.value })}
            />
          </label>
          <div className="drpc-config-field drpc-config-field--grow">
            <span>{tr("discordRpc.whatToShowIn")}</span>
            <div
              className="discord-rpc-segmented-control"
              role="group"
              aria-label={tr("discordRpc.displayMode")}
            >
              {DISCORD_RPC_DISPLAY_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={settings.displayMode === mode}
                  className={settings.displayMode === mode ? "active" : ""}
                  onClick={() => update({ displayMode: mode })}
                >
                  {tr(`discordRpc.mode.${mode}`)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </PluginSettingsGroup>
      <PluginSettingsGroup
        title={tr("discordRpc.statusText")}
        description={tr("discordRpc.activityNameAndTwo")}
        collapsible={false}
      >
        <label className="drpc-config-field">
          <span>{tr("discordRpc.activityName")}</span>
          <TextField
            value={settings.activityNameTemplate}
            placeholder="ScreenLauncher"
            onChange={(event) => update({ activityNameTemplate: event.target.value })}
          />
        </label>
        <label className="drpc-config-field">
          <span>{tr("discordRpc.mainLine")}</span>
          <TextField
            value={settings[modeTemplates.detailsKey]}
            placeholder={modeTemplates.detailsPlaceholder}
            onChange={(event) => update({ [modeTemplates.detailsKey]: event.target.value })}
          />
        </label>
        <label className="drpc-config-field">
          <span>{tr("discordRpc.secondLine")}</span>
          <TextField
            value={settings[modeTemplates.stateKey]}
            placeholder={modeTemplates.statePlaceholder}
            onChange={(event) => update({ [modeTemplates.stateKey]: event.target.value })}
          />
        </label>
        <PlaceholderGuideButton />
        <div className="drpc-card" aria-label={tr("discordRpc.statusTemplatePreview")}>
          <div className="drpc-card-title">{tr("discordRpc.templatePreview")}</div>
          <div className="drpc-line drpc-line--name">
            {settings.activityNameTemplate || "ScreenLauncher"}
          </div>
          <div className="drpc-line drpc-line--details">
            {settings[modeTemplates.detailsKey] || modeTemplates.detailsPlaceholder}
          </div>
          <div className="drpc-line drpc-line--state">
            {settings[modeTemplates.stateKey] || modeTemplates.statePlaceholder}
          </div>
          <span className="drpc-timer is-on">{tr("discordRpc.000InGame")}</span>
        </div>
      </PluginSettingsGroup>
      <PluginSettingsGroup title={tr("discordRpc.imagesAndButton")} collapsible={false}>
        <div className="plugin-settings-fields">
          <label className="drpc-config-field">
            <span>{tr("discordRpc.largeImageKey")}</span>
            <TextField
              value={settings.largeImageKey}
              placeholder="minecraft"
              onChange={(event) => update({ largeImageKey: event.target.value })}
            />
          </label>
          <label className="drpc-config-field">
            <span>{tr("discordRpc.smallImageKey")}</span>
            <TextField
              value={settings.smallImageKey}
              placeholder="launcher"
              onChange={(event) => update({ smallImageKey: event.target.value })}
            />
          </label>
          <label className="drpc-config-field">
            <span>{tr("discordRpc.buttonText")}</span>
            <TextField
              value={settings.buttonLabel}
              placeholder={tr("discordRpc.optional")}
              onChange={(event) => update({ buttonLabel: event.target.value })}
            />
          </label>
          <label className="drpc-config-field">
            <span>{tr("discordRpc.buttonLink")}</span>
            <TextField
              value={settings.buttonUrl}
              placeholder="https://example.com"
              onChange={(event) => update({ buttonUrl: event.target.value })}
            />
          </label>
        </div>
        <p className="drpc-hint">{tr("discordRpc.enterTheNamesOf")}</p>
      </PluginSettingsGroup>
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

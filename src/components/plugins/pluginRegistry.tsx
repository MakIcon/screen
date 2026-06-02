import type { ReactNode } from "react";
import discordIcon from "../../assets/plugins/discord.svg";
import type {
  DiscordRpcPluginSettings,
  LauncherPluginsSettings,
} from "../../types";

export type PluginId = keyof LauncherPluginsSettings;
type DiscordRpcDisplayMode = DiscordRpcPluginSettings["displayMode"];

const DISCORD_RPC_DISPLAY_MODES: {
  id: DiscordRpcDisplayMode;
  label: string;
}[] = [
  { id: "minecraft", label: "MINECRAFT" },
  { id: "launcher", label: "LAUNCHER" },
  { id: "combined", label: "BOTH" },
];

export const DEFAULT_DISCORD_RPC_SETTINGS: DiscordRpcPluginSettings = {
  enabled: false,
  applicationId: "",
  displayMode: "minecraft",
  activityNameTemplate: "",
  detailsTemplate: "Playing %build_name%",
  stateTemplate: "%build_version% / %build_loader% via ScreenLauncher",
  launcherDetailsTemplate: "In ScreenLauncher",
  launcherStateTemplate: "Managing %total_builds% builds",
  combinedDetailsTemplate: "Playing %build_name%",
  combinedStateTemplate: "%build_version% / %build_loader% via ScreenLauncher",
  showElapsedTime: true,
  largeImageKey: "",
  largeImageTextTemplate: "ScreenLauncher",
  smallImageKey: "",
  smallImageTextTemplate: "Minecraft %build_version%",
  buttonLabel: "",
  buttonUrl: "",
};

export const DEFAULT_LAUNCHER_PLUGINS_SETTINGS: LauncherPluginsSettings = {
  discordRpc: { ...DEFAULT_DISCORD_RPC_SETTINGS },
};

export type PluginDefinition = {
  id: PluginId;
  title: string;
  tag: string;
  mark?: string;
  icon?: {
    src: string;
    alt: string;
  };
  description: string;
  getEnabled: (plugins: LauncherPluginsSettings) => boolean;
  getStatus: (plugins: LauncherPluginsSettings) => string;
  setEnabled: (
    plugins: LauncherPluginsSettings,
    enabled: boolean,
  ) => LauncherPluginsSettings;
  renderSettings: (
    plugins: LauncherPluginsSettings,
    onChange: (plugins: LauncherPluginsSettings) => void,
  ) => ReactNode;
};

function normalizeText(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function normalizeDiscordRpcDisplayMode(value: unknown): DiscordRpcDisplayMode {
  return DISCORD_RPC_DISPLAY_MODES.some((mode) => mode.id === value)
    ? (value as DiscordRpcDisplayMode)
    : DEFAULT_DISCORD_RPC_SETTINGS.displayMode;
}

export function normalizeDiscordRpcSettings(
  value: unknown,
): DiscordRpcPluginSettings {
  const draft =
    value && typeof value === "object"
      ? (value as Partial<DiscordRpcPluginSettings>)
      : {};

  return {
    enabled:
      typeof draft.enabled === "boolean"
        ? draft.enabled
        : DEFAULT_DISCORD_RPC_SETTINGS.enabled,
    applicationId: normalizeText(
      draft.applicationId,
      DEFAULT_DISCORD_RPC_SETTINGS.applicationId,
    ),
    displayMode: normalizeDiscordRpcDisplayMode(draft.displayMode),
    activityNameTemplate: normalizeText(
      draft.activityNameTemplate,
      DEFAULT_DISCORD_RPC_SETTINGS.activityNameTemplate,
    ),
    detailsTemplate: normalizeText(
      draft.detailsTemplate,
      DEFAULT_DISCORD_RPC_SETTINGS.detailsTemplate,
    ),
    stateTemplate: normalizeText(
      draft.stateTemplate,
      DEFAULT_DISCORD_RPC_SETTINGS.stateTemplate,
    ),
    launcherDetailsTemplate: normalizeText(
      draft.launcherDetailsTemplate,
      DEFAULT_DISCORD_RPC_SETTINGS.launcherDetailsTemplate,
    ),
    launcherStateTemplate: normalizeText(
      draft.launcherStateTemplate,
      DEFAULT_DISCORD_RPC_SETTINGS.launcherStateTemplate,
    ),
    combinedDetailsTemplate: normalizeText(
      draft.combinedDetailsTemplate,
      DEFAULT_DISCORD_RPC_SETTINGS.combinedDetailsTemplate,
    ),
    combinedStateTemplate: normalizeText(
      draft.combinedStateTemplate,
      DEFAULT_DISCORD_RPC_SETTINGS.combinedStateTemplate,
    ),
    showElapsedTime:
      typeof draft.showElapsedTime === "boolean"
        ? draft.showElapsedTime
        : DEFAULT_DISCORD_RPC_SETTINGS.showElapsedTime,
    largeImageKey: normalizeText(
      draft.largeImageKey,
      DEFAULT_DISCORD_RPC_SETTINGS.largeImageKey,
    ),
    largeImageTextTemplate: normalizeText(
      draft.largeImageTextTemplate,
      DEFAULT_DISCORD_RPC_SETTINGS.largeImageTextTemplate,
    ),
    smallImageKey: normalizeText(
      draft.smallImageKey,
      DEFAULT_DISCORD_RPC_SETTINGS.smallImageKey,
    ),
    smallImageTextTemplate: normalizeText(
      draft.smallImageTextTemplate,
      DEFAULT_DISCORD_RPC_SETTINGS.smallImageTextTemplate,
    ),
    buttonLabel: normalizeText(
      draft.buttonLabel,
      DEFAULT_DISCORD_RPC_SETTINGS.buttonLabel,
    ),
    buttonUrl: normalizeText(
      draft.buttonUrl,
      DEFAULT_DISCORD_RPC_SETTINGS.buttonUrl,
    ),
  };
}

export function normalizeLauncherPluginsSettings(
  value: unknown,
): LauncherPluginsSettings {
  const draft =
    value && typeof value === "object"
      ? (value as Partial<LauncherPluginsSettings>)
      : {};

  return {
    discordRpc: normalizeDiscordRpcSettings(draft.discordRpc),
  };
}

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
          title: "LAUNCHER PRESENCE",
          detailsKey: "launcherDetailsTemplate" as const,
          stateKey: "launcherStateTemplate" as const,
          detailsPlaceholder: "In ScreenLauncher",
          statePlaceholder: "Managing %total_builds% builds",
        }
      : settings.displayMode === "combined"
        ? {
            title: "GAME PRESENCE",
            detailsKey: "combinedDetailsTemplate" as const,
            stateKey: "combinedStateTemplate" as const,
            detailsPlaceholder: "Playing %build_name%",
            statePlaceholder:
              "%build_version% / %build_loader% via ScreenLauncher",
          }
        : {
            title: "GAME PRESENCE",
            detailsKey: "detailsTemplate" as const,
            stateKey: "stateTemplate" as const,
            detailsPlaceholder: "Playing %build_name%",
            statePlaceholder:
              "%build_version% / %build_loader% via ScreenLauncher",
          };

  return (
    <div className="plugin-settings-grid">
      <label className="plugin-field plugin-field--full">
        <span>APPLICATION ID</span>
        <input
          value={settings.applicationId}
          placeholder="Discord application id"
          onChange={(event) => update({ applicationId: event.target.value })}
        />
      </label>

      <div className="plugin-field plugin-field--full plugin-segment-field">
        <span>DISPLAY MODE</span>
        <div className="plugin-segmented-control" role="group">
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

      <label className="plugin-field plugin-field--full">
        <span>ACTIVITY NAME</span>
        <input
          value={settings.activityNameTemplate}
          placeholder="Auto by mode"
          onChange={(event) =>
            update({ activityNameTemplate: event.target.value })
          }
        />
      </label>

      <div className="plugin-settings-subhead">{modeTemplates.title}</div>

      <label className="plugin-field">
        <span>DETAILS TEMPLATE</span>
        <input
          value={settings[modeTemplates.detailsKey]}
          placeholder={modeTemplates.detailsPlaceholder}
          onChange={(event) =>
            update({ [modeTemplates.detailsKey]: event.target.value })
          }
        />
      </label>

      <label className="plugin-field">
        <span>STATE TEMPLATE</span>
        <input
          value={settings[modeTemplates.stateKey]}
          placeholder={modeTemplates.statePlaceholder}
          onChange={(event) =>
            update({ [modeTemplates.stateKey]: event.target.value })
          }
        />
      </label>

      <div className="plugin-settings-subhead">ASSETS</div>

      <label className="plugin-field">
        <span>LARGE IMAGE KEY</span>
        <input
          value={settings.largeImageKey}
          placeholder="discord app asset key"
          onChange={(event) => update({ largeImageKey: event.target.value })}
        />
      </label>

      <label className="plugin-field">
        <span>LARGE IMAGE TEXT</span>
        <input
          value={settings.largeImageTextTemplate}
          placeholder="ScreenLauncher"
          onChange={(event) =>
            update({ largeImageTextTemplate: event.target.value })
          }
        />
      </label>

      <label className="plugin-field">
        <span>SMALL IMAGE KEY</span>
        <input
          value={settings.smallImageKey}
          placeholder="discord app asset key"
          onChange={(event) => update({ smallImageKey: event.target.value })}
        />
      </label>

      <label className="plugin-field">
        <span>SMALL IMAGE TEXT</span>
        <input
          value={settings.smallImageTextTemplate}
          placeholder="Minecraft %build_version%"
          onChange={(event) =>
            update({ smallImageTextTemplate: event.target.value })
          }
        />
      </label>

      <div className="plugin-settings-subhead">BUTTON</div>

      <label className="plugin-field">
        <span>BUTTON LABEL</span>
        <input
          value={settings.buttonLabel}
          placeholder="Open launcher"
          onChange={(event) => update({ buttonLabel: event.target.value })}
        />
      </label>

      <label className="plugin-field">
        <span>BUTTON URL</span>
        <input
          value={settings.buttonUrl}
          placeholder="https://example.com"
          onChange={(event) => update({ buttonUrl: event.target.value })}
        />
      </label>

      <label className="plugin-check-row">
        <input
          type="checkbox"
          checked={settings.showElapsedTime}
          onChange={(event) => update({ showElapsedTime: event.target.checked })}
        />
        <span>SHOW ELAPSED TIME</span>
      </label>
    </div>
  );
}

export const PLUGIN_DEFINITIONS: PluginDefinition[] = [
  {
    id: "discordRpc",
    title: "DISCORD RPC",
    tag: "PRESENCE",
    mark: "RPC",
    icon: {
      src: discordIcon,
      alt: "Discord",
    },
    description: "Shows the active build, version, loader and play time in Discord.",
    getEnabled: (plugins) => plugins.discordRpc.enabled,
    getStatus: (plugins) => {
      if (!plugins.discordRpc.enabled) return "OFF";
      return plugins.discordRpc.applicationId.trim() ? "ON" : "NEEDS APP ID";
    },
    setEnabled: (plugins, enabled) => ({
      ...plugins,
      discordRpc: {
        ...plugins.discordRpc,
        enabled,
      },
    }),
    renderSettings: (plugins, onChange) => (
      <DiscordRpcSettingsEditor
        settings={plugins.discordRpc}
        onChange={(discordRpc) => onChange({ ...plugins, discordRpc })}
      />
    ),
  },
];

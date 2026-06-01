import type { ReactNode } from "react";
import type {
  DiscordRpcPluginSettings,
  LauncherPluginsSettings,
} from "../../types";

export type PluginId = keyof LauncherPluginsSettings;

export const DEFAULT_DISCORD_RPC_SETTINGS: DiscordRpcPluginSettings = {
  enabled: false,
  applicationId: "",
  detailsTemplate: "Playing %build_name%",
  stateTemplate: "%build_version% / %build_loader%",
  showElapsedTime: true,
};

export const DEFAULT_LAUNCHER_PLUGINS_SETTINGS: LauncherPluginsSettings = {
  discordRpc: { ...DEFAULT_DISCORD_RPC_SETTINGS },
};

export type PluginDefinition = {
  id: PluginId;
  title: string;
  tag: string;
  mark: string;
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
    detailsTemplate: normalizeText(
      draft.detailsTemplate,
      DEFAULT_DISCORD_RPC_SETTINGS.detailsTemplate,
    ),
    stateTemplate: normalizeText(
      draft.stateTemplate,
      DEFAULT_DISCORD_RPC_SETTINGS.stateTemplate,
    ),
    showElapsedTime:
      typeof draft.showElapsedTime === "boolean"
        ? draft.showElapsedTime
        : DEFAULT_DISCORD_RPC_SETTINGS.showElapsedTime,
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

  return (
    <div className="plugin-settings-grid">
      <label className="plugin-field">
        <span>APPLICATION ID</span>
        <input
          value={settings.applicationId}
          placeholder="Discord application id"
          onChange={(event) => update({ applicationId: event.target.value })}
        />
      </label>

      <label className="plugin-field">
        <span>DETAILS TEMPLATE</span>
        <input
          value={settings.detailsTemplate}
          placeholder="Playing %build_name%"
          onChange={(event) => update({ detailsTemplate: event.target.value })}
        />
      </label>

      <label className="plugin-field">
        <span>STATE TEMPLATE</span>
        <input
          value={settings.stateTemplate}
          placeholder="%build_version% / %build_loader%"
          onChange={(event) => update({ stateTemplate: event.target.value })}
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

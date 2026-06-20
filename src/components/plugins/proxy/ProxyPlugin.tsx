import type {
  LauncherPluginsSettings,
  ProxyPluginSettings,
} from "../../../types";
import type { PluginDefinition } from "../pluginTypes";
import "./ProxyPlugin.css";

export const DEFAULT_PROXY_SETTINGS: ProxyPluginSettings = {
  enabled: false,
  url: "",
};

export function normalizeProxySettings(value: unknown): ProxyPluginSettings {
  const draft =
    value && typeof value === "object"
      ? (value as Partial<ProxyPluginSettings>)
      : {};

  return {
    enabled:
      typeof draft.enabled === "boolean"
        ? draft.enabled
        : DEFAULT_PROXY_SETTINGS.enabled,
    url: typeof draft.url === "string" ? draft.url : DEFAULT_PROXY_SETTINGS.url,
  };
}

function ProxySettingsEditor({
  settings,
  onChange,
}: {
  settings: ProxyPluginSettings;
  onChange: (settings: ProxyPluginSettings) => void;
}) {
  const update = (patch: Partial<ProxyPluginSettings>) => {
    onChange(normalizeProxySettings({ ...settings, ...patch }));
  };

  return (
    <div className="proxy-settings">
      <label className="proxy-field">
        <span>PROXY URL</span>
        <input
          value={settings.url}
          placeholder="socks5://127.0.0.1:1080"
          spellCheck={false}
          onChange={(event) => update({ url: event.target.value })}
        />
      </label>

      <p className="proxy-hint">
        Маршрутизирует все запросы лаунчера через прокси — нужно для хостов,
        которые не зеркалит BMCLAPI (например, Quilt) в заблокированных регионах.
        Поддерживаются схемы <code>http://</code>, <code>https://</code> и{" "}
        <code>socks5://</code>. Применяется ко всем загрузкам после сохранения.
      </p>
    </div>
  );
}

export const PROXY_PLUGIN_DEFINITION: PluginDefinition = {
  id: "proxy",
  title: "PROXY",
  tag: "NETWORK",
  mark: "PXY",
  description:
    "Tunnels every launcher download through your proxy (HTTP / SOCKS5).",
  getEnabled: (plugins) => plugins.proxy.enabled,
  getStatus: (plugins) => {
    if (!plugins.proxy.enabled) return "OFF";
    return plugins.proxy.url.trim() ? "ON" : "NEEDS URL";
  },
  setEnabled: (plugins, enabled) => ({
    ...plugins,
    proxy: {
      ...plugins.proxy,
      enabled,
    },
  }),
  renderSettings: (
    plugins: LauncherPluginsSettings,
    onChange: (plugins: LauncherPluginsSettings) => void,
  ) => (
    <ProxySettingsEditor
      settings={plugins.proxy}
      onChange={(proxy) => onChange({ ...plugins, proxy })}
    />
  ),
};

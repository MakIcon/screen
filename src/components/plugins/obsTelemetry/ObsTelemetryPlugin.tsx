import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import obsMinecraftIcon from "../../../assets/plugins/obs-minecraft.svg";
import type {
  LauncherPluginsSettings,
  ObsTelemetryPayload,
  ObsTelemetryPluginSettings,
  ObsTelemetryStatus,
} from "../../../types";
import type { PluginDefinition } from "../pluginTypes";
import "./ObsTelemetryPlugin.css";

const DEFAULT_OBS_PORT = 18991;

export const DEFAULT_OBS_TELEMETRY_SETTINGS: ObsTelemetryPluginSettings = {
  enabled: false,
  port: DEFAULT_OBS_PORT,
};

function normalizePort(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_OBS_PORT;
  return Math.max(1, Math.min(Math.round(parsed), 65535));
}

export function normalizeObsTelemetrySettings(
  value: unknown,
): ObsTelemetryPluginSettings {
  const draft =
    value && typeof value === "object"
      ? (value as Partial<ObsTelemetryPluginSettings>)
      : {};

  return {
    enabled:
      typeof draft.enabled === "boolean"
        ? draft.enabled
        : DEFAULT_OBS_TELEMETRY_SETTINGS.enabled,
    port: normalizePort(draft.port),
  };
}

function formatStatusValue(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return "NONE";
  return String(value);
}

function formatAge(ageMs?: number | null) {
  if (ageMs === null || ageMs === undefined) return "NONE";
  if (ageMs < 1000) return `${ageMs}ms`;
  return `${(ageMs / 1000).toFixed(1)}s`;
}

function formatHealth(payload?: ObsTelemetryPayload | null) {
  if (!payload) return "NONE";
  return `${payload.health.toFixed(1)} / ${payload.maxHealth.toFixed(1)}`;
}

function formatCoords(payload?: ObsTelemetryPayload | null) {
  if (!payload) return "NONE";
  return `${payload.blockPosition.x} ${payload.blockPosition.y} ${payload.blockPosition.z}`;
}

function formatItemName(payload?: ObsTelemetryPayload | null) {
  const item = payload?.heldItem;
  if (!item?.displayName) return "EMPTY";
  return item.count > 1 ? `${item.displayName} x${item.count}` : item.displayName;
}

function ObsTelemetrySettingsEditor({
  settings,
  onChange,
}: {
  settings: ObsTelemetryPluginSettings;
  onChange: (settings: ObsTelemetryPluginSettings) => void;
}) {
  const [status, setStatus] = useState<ObsTelemetryStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [copied, setCopied] = useState(false);
  const overlayUrl = useMemo(
    () => status?.overlayUrl ?? `http://127.0.0.1:${settings.port}/overlay`,
    [settings.port, status?.overlayUrl],
  );
  const overlayUrls = status?.overlayUrls ?? {
    all: overlayUrl,
    settings: `http://127.0.0.1:${settings.port}/settings`,
    health: `http://127.0.0.1:${settings.port}/health`,
    food: `http://127.0.0.1:${settings.port}/food`,
    xp: `http://127.0.0.1:${settings.port}/xp`,
    armor: `http://127.0.0.1:${settings.port}/armor`,
    helmet: `http://127.0.0.1:${settings.port}/helmet`,
    chestplate: `http://127.0.0.1:${settings.port}/chestplate`,
    leggings: `http://127.0.0.1:${settings.port}/leggings`,
    boots: `http://127.0.0.1:${settings.port}/boots`,
    coords: `http://127.0.0.1:${settings.port}/coords`,
    items: `http://127.0.0.1:${settings.port}/items`,
    mainHand: `http://127.0.0.1:${settings.port}/mainhand`,
    offhand: `http://127.0.0.1:${settings.port}/offhand`,
    dimension: `http://127.0.0.1:${settings.port}/dimension`,
  };
  const jsonUrl = useMemo(
    () => status?.jsonUrl ?? `http://127.0.0.1:${settings.port}/state.json`,
    [settings.port, status?.jsonUrl],
  );
  const lastUpdateAgeMs = status?.lastUpdateAgeMs;
  const isLive =
    Boolean(status?.lastPayload) &&
    lastUpdateAgeMs !== null &&
    lastUpdateAgeMs !== undefined &&
    lastUpdateAgeMs <= 3000;

  const update = (patch: Partial<ObsTelemetryPluginSettings>) => {
    onChange(normalizeObsTelemetrySettings({ ...settings, ...patch }));
  };

  const refreshStatus = async () => {
    try {
      const next = await invoke<ObsTelemetryStatus>("get_obs_telemetry_status");
      setStatus(next);
      setActionError("");
    } catch (error) {
      setActionError(String(error));
    }
  };

  useEffect(() => {
    void refreshStatus();
    const timer = window.setInterval(() => void refreshStatus(), 1500);
    return () => window.clearInterval(timer);
  }, []);

  const startServer = async () => {
    if (!settings.enabled || busy) return;
    try {
      setBusy(true);
      setActionError("");
      const next = await invoke<ObsTelemetryStatus>("start_obs_telemetry");
      setStatus(next);
    } catch (error) {
      setActionError(String(error));
    } finally {
      setBusy(false);
    }
  };

  const stopServer = async () => {
    if (busy || !status?.running) return;
    try {
      setBusy(true);
      setActionError("");
      const next = await invoke<ObsTelemetryStatus>("stop_obs_telemetry");
      setStatus(next);
    } catch (error) {
      setActionError(String(error));
    } finally {
      setBusy(false);
    }
  };

  const openOverlay = async () => {
    try {
      setBusy(true);
      setActionError("");
      await invoke("open_obs_telemetry_overlay");
    } catch (error) {
      setActionError(String(error));
    } finally {
      setBusy(false);
    }
  };

  const copyOverlayUrl = async () => {
    try {
      await navigator.clipboard.writeText(overlayUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch (error) {
      setActionError(String(error));
    }
  };

  return (
    <div className="obs-telemetry-settings">
      <label className="obs-telemetry-field">
        <span>OBS PORT</span>
        <input
          value={settings.port}
          inputMode="numeric"
          onChange={(event) => update({ port: Number(event.target.value) })}
        />
      </label>

      <label className="obs-telemetry-field obs-telemetry-field--wide">
        <span>MAIN BROWSER SOURCE URL</span>
        <input value={overlayUrl} readOnly spellCheck={false} />
      </label>

      <div className="obs-telemetry-links">
        {Object.entries(overlayUrls).map(([key, url]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(url);
            }}
          >
            <span>{key.toUpperCase()}</span>
            <strong>{url}</strong>
          </button>
        ))}
      </div>

      <div className="obs-telemetry-subhead">CONTROL</div>

      <div className="obs-telemetry-controls">
        <button
          type="button"
          disabled={!settings.enabled || busy || status?.running}
          onClick={() => void startServer()}
        >
          {busy ? "WORKING" : "START"}
        </button>
        <button
          type="button"
          disabled={busy || !status?.running}
          onClick={() => void stopServer()}
        >
          STOP
        </button>
        <button type="button" disabled={busy} onClick={() => void refreshStatus()}>
          REFRESH
        </button>
        <button type="button" disabled={busy} onClick={() => void openOverlay()}>
          OPEN
        </button>
        <button type="button" onClick={() => void copyOverlayUrl()}>
          {copied ? "COPIED" : "COPY URL"}
        </button>
      </div>

      <div className="obs-telemetry-status">
        <div>
          <span>SERVER</span>
          <strong>{formatStatusValue(status?.state)}</strong>
        </div>
        <div>
          <span>LIVE</span>
          <strong>{isLive ? "YES" : "NO"}</strong>
        </div>
        <div>
          <span>PLAYER</span>
          <strong>{formatStatusValue(status?.lastPlayerName)}</strong>
        </div>
        <div>
          <span>LAST UPDATE</span>
          <strong>{formatAge(status?.lastUpdateAgeMs)}</strong>
        </div>
        <div>
          <span>JSON</span>
          <strong>{jsonUrl}</strong>
        </div>
      </div>

      <div className="obs-telemetry-readout">
        <div>
          <span>HEALTH</span>
          <strong>{formatHealth(status?.lastPayload)}</strong>
        </div>
        <div>
          <span>ARMOR</span>
          <strong>{formatStatusValue(status?.lastPayload?.armor)}</strong>
        </div>
        <div>
          <span>FOOD</span>
          <strong>{formatStatusValue(status?.lastPayload?.food)}</strong>
        </div>
        <div>
          <span>COORDS</span>
          <strong>{formatCoords(status?.lastPayload)}</strong>
        </div>
        <div>
          <span>HAND</span>
          <strong>{formatItemName(status?.lastPayload)}</strong>
        </div>
      </div>

      {(actionError || status?.lastError) && (
        <div className="obs-telemetry-error">
          {actionError || status?.lastError}
        </div>
      )}

      <div className="obs-telemetry-log" aria-live="polite">
        {(status?.logs ?? []).length === 0 ? (
          <span>NO LOGS</span>
        ) : (
          status?.logs.slice(-12).map((line, index) => (
            <span key={`${line}-${index}`}>{line}</span>
          ))
        )}
      </div>
    </div>
  );
}

export const OBS_TELEMETRY_PLUGIN_DEFINITION: PluginDefinition = {
  id: "obsTelemetry",
  title: "OBS TELEMETRY",
  tag: "STREAM",
  mark: "OBS",
  icon: {
    src: obsMinecraftIcon,
    alt: "OBS Minecraft",
  },
  description: "Shows live player health, armor, food and coordinates in OBS.",
  getEnabled: (plugins) => plugins.obsTelemetry.enabled,
  getStatus: (plugins) => {
    if (!plugins.obsTelemetry.enabled) return "OFF";
    return plugins.obsTelemetry.port ? "ON" : "NEEDS PORT";
  },
  setEnabled: (plugins, enabled) => ({
    ...plugins,
    obsTelemetry: {
      ...plugins.obsTelemetry,
      enabled,
    },
  }),
  renderSettings: (
    plugins: LauncherPluginsSettings,
    onChange: (plugins: LauncherPluginsSettings) => void,
  ) => (
    <ObsTelemetrySettingsEditor
      settings={plugins.obsTelemetry}
      onChange={(obsTelemetry) => onChange({ ...plugins, obsTelemetry })}
    />
  ),
};

import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import blueMapIcon from "../../../assets/plugins/bluemap.svg";
import type {
  BlueMapPluginSettings,
  BlueMapStatus,
  LauncherPluginsSettings,
} from "../../../types";
import { ElementCheckbox } from "../../inputs/ElementCheckbox";
import type { PluginDefinition } from "../pluginTypes";
import "./BlueMapPlugin.css";

const DEFAULT_MAP_URL = "http://127.0.0.1:8100/";

export const DEFAULT_BLUE_MAP_SETTINGS: BlueMapPluginSettings = {
  enabled: false,
  mapUrl: DEFAULT_MAP_URL,
  cliJarPath: "",
  workingDir: "",
  javaPath: "java",
  renderOnStart: true,
  updateOnStart: true,
};

function normalizeText(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeBlueMapSettings(value: unknown): BlueMapPluginSettings {
  const draft =
    value && typeof value === "object"
      ? (value as Partial<BlueMapPluginSettings>)
      : {};

  return {
    enabled:
      typeof draft.enabled === "boolean"
        ? draft.enabled
        : DEFAULT_BLUE_MAP_SETTINGS.enabled,
    mapUrl: normalizeText(draft.mapUrl, DEFAULT_BLUE_MAP_SETTINGS.mapUrl),
    cliJarPath: normalizeText(
      draft.cliJarPath,
      DEFAULT_BLUE_MAP_SETTINGS.cliJarPath,
    ),
    workingDir: normalizeText(
      draft.workingDir,
      DEFAULT_BLUE_MAP_SETTINGS.workingDir,
    ),
    javaPath: normalizeText(draft.javaPath, DEFAULT_BLUE_MAP_SETTINGS.javaPath),
    renderOnStart: normalizeBoolean(
      draft.renderOnStart,
      DEFAULT_BLUE_MAP_SETTINGS.renderOnStart,
    ),
    updateOnStart: normalizeBoolean(
      draft.updateOnStart,
      DEFAULT_BLUE_MAP_SETTINGS.updateOnStart,
    ),
  };
}

function formatStatusValue(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return "NONE";
  return String(value);
}

function mapPreviewUrl(mapUrl: string) {
  const trimmed = mapUrl.trim();
  if (!trimmed) return DEFAULT_MAP_URL;
  if (trimmed.includes("://")) return trimmed;
  return `http://${trimmed}`;
}

function BlueMapSettingsEditor({
  settings,
  onChange,
}: {
  settings: BlueMapPluginSettings;
  onChange: (settings: BlueMapPluginSettings) => void;
}) {
  const [status, setStatus] = useState<BlueMapStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [actionError, setActionError] = useState("");
  const previewUrl = useMemo(() => mapPreviewUrl(settings.mapUrl), [settings.mapUrl]);
  const canOpen = settings.enabled && Boolean(settings.mapUrl.trim()) && !busy;
  const canStart = settings.enabled && !status?.running && !busy;
  const canSetup = settings.enabled && !status?.running && !busy;
  const canStop = Boolean(status?.running) && !busy;

  const update = (patch: Partial<BlueMapPluginSettings>) => {
    onChange(normalizeBlueMapSettings({ ...settings, ...patch }));
  };

  const applyStatus = (next: BlueMapStatus) => {
    setStatus(next);

    const patch: Partial<BlueMapPluginSettings> = {};
    if (next.url && next.url !== settings.mapUrl) {
      patch.mapUrl = next.url;
    }
    if (next.cliJarPath && next.cliJarPath !== settings.cliJarPath) {
      patch.cliJarPath = next.cliJarPath;
    }
    if (next.workingDir && next.workingDir !== settings.workingDir) {
      patch.workingDir = next.workingDir;
    }

    if (Object.keys(patch).length > 0) {
      update(patch);
    }
  };

  const refreshStatus = async () => {
    try {
      const next = await invoke<BlueMapStatus>("get_bluemap_status");
      setStatus(next);
      setActionError("");
    } catch (error) {
      setActionError(String(error));
    }
  };

  useEffect(() => {
    void refreshStatus();
    const timer = window.setInterval(() => void refreshStatus(), 2500);
    return () => window.clearInterval(timer);
  }, []);

  const setupBlueMap = async () => {
    if (!canSetup) return;
    try {
      setBusy(true);
      setActionError("");
      const next = await invoke<BlueMapStatus>("prepare_bluemap");
      applyStatus(next);
    } catch (error) {
      setActionError(String(error));
    } finally {
      setBusy(false);
    }
  };

  const startBlueMap = async () => {
    if (!canStart) return;
    try {
      setBusy(true);
      setActionError("");
      const next = await invoke<BlueMapStatus>("start_bluemap");
      applyStatus(next);
    } catch (error) {
      setActionError(String(error));
    } finally {
      setBusy(false);
    }
  };

  const stopBlueMap = async () => {
    if (!canStop) return;
    try {
      setBusy(true);
      setActionError("");
      const next = await invoke<BlueMapStatus>("stop_bluemap");
      applyStatus(next);
    } catch (error) {
      setActionError(String(error));
    } finally {
      setBusy(false);
    }
  };

  const openBrowser = async () => {
    if (!canOpen) return;
    try {
      setBusy(true);
      setActionError("");
      await invoke("open_bluemap_browser");
    } catch (error) {
      setActionError(String(error));
    } finally {
      setBusy(false);
    }
  };

  const openWindow = async () => {
    if (!canOpen) return;
    try {
      setBusy(true);
      setActionError("");
      await invoke("open_bluemap_window");
    } catch (error) {
      setActionError(String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="blue-map-settings">
      <label className="blue-map-field blue-map-field--full">
        <span>MAP URL</span>
        <input
          value={settings.mapUrl}
          placeholder={DEFAULT_MAP_URL}
          spellCheck={false}
          onChange={(event) => update({ mapUrl: event.target.value })}
        />
      </label>

      <label className="blue-map-field blue-map-field--full">
        <span>BLUE MAP CLI JAR</span>
        <input
          value={settings.cliJarPath}
          placeholder="C:\\Program Files\\BlueMap\\BlueMap-cli.jar"
          spellCheck={false}
          onChange={(event) => update({ cliJarPath: event.target.value })}
        />
      </label>

      <label className="blue-map-field">
        <span>WORKING DIR</span>
        <input
          value={settings.workingDir}
          placeholder="jar folder"
          spellCheck={false}
          onChange={(event) => update({ workingDir: event.target.value })}
        />
      </label>

      <label className="blue-map-field">
        <span>JAVA PATH</span>
        <input
          value={settings.javaPath}
          placeholder="java"
          spellCheck={false}
          onChange={(event) => update({ javaPath: event.target.value })}
        />
      </label>

      <div className="blue-map-checkboxes">
        <ElementCheckbox
          label="BACKGROUND RENDER"
          checked={settings.renderOnStart}
          onChange={(renderOnStart) => update({ renderOnStart })}
        />
        <ElementCheckbox
          label="LIVE UPDATE"
          checked={settings.updateOnStart}
          onChange={(updateOnStart) => update({ updateOnStart })}
        />
      </div>

      <div className="blue-map-subhead">CONTROL</div>

      <div className="blue-map-controls">
        <button type="button" disabled={!canSetup} onClick={() => void setupBlueMap()}>
          SETUP
        </button>
        <button type="button" disabled={!canStart} onClick={() => void startBlueMap()}>
          {busy ? "WORKING" : "START CLI"}
        </button>
        <button type="button" disabled={!canStop} onClick={() => void stopBlueMap()}>
          STOP
        </button>
        <button type="button" disabled={busy} onClick={() => void refreshStatus()}>
          REFRESH
        </button>
        <button
          type="button"
          disabled={!canOpen}
          onClick={() => setPreviewOpen((current) => !current)}
        >
          {previewOpen ? "HIDE" : "VIEW"}
        </button>
        <button type="button" disabled={!canOpen} onClick={() => void openBrowser()}>
          BROWSER
        </button>
        <button type="button" disabled={!canOpen} onClick={() => void openWindow()}>
          WINDOW
        </button>
      </div>

      <div className="blue-map-status">
        <div>
          <span>STATE</span>
          <strong>{formatStatusValue(status?.state)}</strong>
        </div>
        <div>
          <span>PID</span>
          <strong>{formatStatusValue(status?.pid)}</strong>
        </div>
        <div>
          <span>URL</span>
          <strong>{formatStatusValue(status?.url ?? previewUrl)}</strong>
        </div>
        <div>
          <span>WORK DIR</span>
          <strong>{formatStatusValue(status?.workingDir || settings.workingDir)}</strong>
        </div>
        <div>
          <span>WORLD</span>
          <strong>{formatStatusValue(status?.worldPath)}</strong>
        </div>
      </div>

      {(actionError || status?.lastError) && (
        <div className="blue-map-error">{actionError || status?.lastError}</div>
      )}

      {previewOpen && (
        <div className="blue-map-preview">
          <iframe src={previewUrl} title="BlueMap" />
        </div>
      )}

      <div className="blue-map-log" aria-live="polite">
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

export const BLUE_MAP_PLUGIN_DEFINITION: PluginDefinition = {
  id: "blueMap",
  title: "BLUE MAP",
  tag: "MAP",
  mark: "MAP",
  icon: {
    src: blueMapIcon,
    alt: "BlueMap",
  },
  description: "Runs a local BlueMap web map and opens it from the launcher.",
  getEnabled: (plugins) => plugins.blueMap.enabled,
  getStatus: (plugins) => {
    if (!plugins.blueMap.enabled) return "OFF";
    if (!plugins.blueMap.mapUrl.trim()) return "NEEDS URL";
    return plugins.blueMap.cliJarPath.trim() ? "ON" : "AUTO";
  },
  setEnabled: (plugins, enabled) => ({
    ...plugins,
    blueMap: {
      ...plugins.blueMap,
      enabled,
    },
  }),
  renderSettings: (
    plugins: LauncherPluginsSettings,
    onChange: (plugins: LauncherPluginsSettings) => void,
  ) => (
    <BlueMapSettingsEditor
      settings={plugins.blueMap}
      onChange={(blueMap) => onChange({ ...plugins, blueMap })}
    />
  ),
};

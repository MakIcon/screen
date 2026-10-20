import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { BlueMapPluginSettings, BlueMapStatus } from "../../../types";
import { ElementCheckbox } from "../../inputs/ElementCheckbox";
import { toErrorMessage } from "../../../utils/errors";
import { useRuntimeMonitor } from "../../../hooks/useRuntimeMonitor";
import type { PluginSettingsProps } from "../pluginTypes";
import { PluginSettingsGroup } from "../PluginSettingsGroup";
import { DEFAULT_BLUE_MAP_SETTINGS, normalizeBlueMapSettings } from "../pluginSettings";
import "./BlueMapPlugin.css";
import { useTranslation } from "../../../i18n/locale";

const DEFAULT_MAP_URL = DEFAULT_BLUE_MAP_SETTINGS.mapUrl;

function formatStatusValue(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return "—";
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
  const tr = useTranslation();
  const monitor = useRuntimeMonitor();
  const status = monitor.snapshot?.blueMap ?? null;
  const packageInstalled = Boolean(
    monitor.snapshot?.optionalExtensions.find((item) => item.id === "blue-map-server")?.installed,
  );
  const [busy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [actionError, setActionError] = useState("");
  const previewUrl = useMemo(() => mapPreviewUrl(settings.mapUrl), [settings.mapUrl]);
  const canOpen = settings.enabled && Boolean(settings.mapUrl.trim()) && !busy;
  const canStart = settings.enabled && packageInstalled && !status?.running && !busy;
  const canSetup = settings.enabled && packageInstalled && !status?.running && !busy;
  const canStop = Boolean(status?.running) && !busy;

  const update = (patch: Partial<BlueMapPluginSettings>) => {
    onChange(normalizeBlueMapSettings({ ...settings, ...patch }));
  };

  const applyStatus = (next: BlueMapStatus) => {
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

  const setupBlueMap = async () => {
    if (!canSetup) return;
    try {
      setBusy(true);
      setActionError("");
      const next = await invoke<BlueMapStatus>("prepare_bluemap");
      applyStatus(next);
      await monitor.refresh();
    } catch (error) {
      setActionError(toErrorMessage(error));
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
      await monitor.refresh();
    } catch (error) {
      setActionError(toErrorMessage(error));
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
      await monitor.refresh();
    } catch (error) {
      setActionError(toErrorMessage(error));
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
      setActionError(toErrorMessage(error));
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
      setActionError(toErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="blue-map-settings">
      <PluginSettingsGroup
        title={tr("blueMap.worldMap")}
        description={tr("blueMap.addressOfTheInteractive")}
        collapsible={false}
      >
        <label className="blue-map-field blue-map-field--full">
          <span>{tr("blueMap.mapAddress")}</span>
          <input
            value={settings.mapUrl}
            placeholder={DEFAULT_MAP_URL}
            spellCheck={false}
            onChange={(event) => update({ mapUrl: event.target.value })}
          />
        </label>
      </PluginSettingsGroup>
      <PluginSettingsGroup
        title={tr("blueMap.serverAndJava")}
        description={tr("blueMap.bluemapPathWorkingFolder")}
      >
        <label className="blue-map-field blue-map-field--full">
          <span>{tr("blueMap.bluemapCliFileJar")}</span>
          <input
            value={settings.cliJarPath}
            placeholder="C:\\Program Files\\BlueMap\\BlueMap-cli.jar"
            spellCheck={false}
            onChange={(event) => update({ cliJarPath: event.target.value })}
          />
        </label>

        <label className="blue-map-field">
          <span>{tr("blueMap.workingFolder")}</span>
          <input
            value={settings.workingDir}
            placeholder={tr("blueMap.folderContainingTheJar")}
            spellCheck={false}
            onChange={(event) => update({ workingDir: event.target.value })}
          />
        </label>

        <label className="blue-map-field">
          <span>{tr("common.javaPath")}</span>
          <input
            value={settings.javaPath}
            placeholder="java"
            spellCheck={false}
            onChange={(event) => update({ javaPath: event.target.value })}
          />
        </label>

        <div className="blue-map-checkboxes">
          <ElementCheckbox
            label={tr("blueMap.backgroundRender")}
            checked={settings.renderOnStart}
            onChange={(renderOnStart) => update({ renderOnStart })}
          />
          <ElementCheckbox
            label={tr("blueMap.mapUpdate")}
            checked={settings.updateOnStart}
            onChange={(updateOnStart) => update({ updateOnStart })}
          />
        </div>
      </PluginSettingsGroup>
      <div className="blue-map-subhead">{tr("blueMap.mapControls")}</div>

      <div className="blue-map-controls">
        <button type="button" disabled={!canSetup} onClick={() => void setupBlueMap()}>
          {tr("blueMap.prepare")}
        </button>
        <button type="button" disabled={!canStart} onClick={() => void startBlueMap()}>
          {busy ? tr("blueMap.working") : tr("blueMap.start")}
        </button>
        <button type="button" disabled={!canStop} onClick={() => void stopBlueMap()}>
          {tr("blueMap.stop")}
        </button>
        <button type="button" disabled={busy} onClick={() => void monitor.refresh()}>
          {tr("common.refresh")}
        </button>
        <button
          type="button"
          disabled={!canOpen}
          onClick={() => setPreviewOpen((current) => !current)}
        >
          {previewOpen ? tr("blueMap.hideMap") : tr("blueMap.showMap")}
        </button>
        <button type="button" disabled={!canOpen} onClick={() => void openBrowser()}>
          {tr("blueMap.inBrowser")}
        </button>
        <button type="button" disabled={!canOpen} onClick={() => void openWindow()}>
          {tr("blueMap.inWindow")}
        </button>
      </div>

      <div className="blue-map-status">
        <div>
          <span>{tr("blueMap.state")}</span>
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
          <span>{tr("blueMap.workingFolder")}</span>
          <strong>{formatStatusValue(status?.workingDir || settings.workingDir)}</strong>
        </div>
        <div>
          <span>{tr("blueMap.world")}</span>
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

      <PluginSettingsGroup
        title={tr("blueMap.serverLog")}
        description={tr("blueMap.eventsBluemapMessages", { value: status?.logs.length ?? 0 })}
      >
        <div className="blue-map-log" aria-live="polite">
          {(status?.logs ?? []).length === 0 ? (
            <span>{tr("common.noEventsYet")}</span>
          ) : (
            status?.logs
              .slice(-12)
              .map((line, index) => <span key={`${line}-${index}`}>{line}</span>)
          )}
        </div>
      </PluginSettingsGroup>
    </div>
  );
}

export function BlueMapSettings({ plugins, onChange }: PluginSettingsProps) {
  return (
    <BlueMapSettingsEditor
      settings={plugins.blueMap}
      onChange={(blueMap) => onChange({ ...plugins, blueMap })}
    />
  );
}

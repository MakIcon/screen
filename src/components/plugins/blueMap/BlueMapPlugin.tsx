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
        title="КАРТА МИРА"
        description="Адрес интерактивной карты"
        collapsible={false}
      >
        <label className="blue-map-field blue-map-field--full">
          <span>АДРЕС КАРТЫ</span>
          <input
            value={settings.mapUrl}
            placeholder={DEFAULT_MAP_URL}
            spellCheck={false}
            onChange={(event) => update({ mapUrl: event.target.value })}
          />
        </label>
      </PluginSettingsGroup>
      <PluginSettingsGroup
        title="СЕРВЕР И JAVA"
        description="Путь к BlueMap, рабочая папка и параметры обновления"
      >
        <label className="blue-map-field blue-map-field--full">
          <span>ФАЙЛ BLUEMAP CLI · JAR</span>
          <input
            value={settings.cliJarPath}
            placeholder="C:\\Program Files\\BlueMap\\BlueMap-cli.jar"
            spellCheck={false}
            onChange={(event) => update({ cliJarPath: event.target.value })}
          />
        </label>

        <label className="blue-map-field">
          <span>РАБОЧАЯ ПАПКА</span>
          <input
            value={settings.workingDir}
            placeholder="Папка с JAR-файлом"
            spellCheck={false}
            onChange={(event) => update({ workingDir: event.target.value })}
          />
        </label>

        <label className="blue-map-field">
          <span>ПУТЬ К JAVA</span>
          <input
            value={settings.javaPath}
            placeholder="java"
            spellCheck={false}
            onChange={(event) => update({ javaPath: event.target.value })}
          />
        </label>

        <div className="blue-map-checkboxes">
          <ElementCheckbox
            label="ФОНОВЫЙ РЕНДЕР"
            checked={settings.renderOnStart}
            onChange={(renderOnStart) => update({ renderOnStart })}
          />
          <ElementCheckbox
            label="ОБНОВЛЕНИЕ КАРТЫ"
            checked={settings.updateOnStart}
            onChange={(updateOnStart) => update({ updateOnStart })}
          />
        </div>
      </PluginSettingsGroup>
      <div className="blue-map-subhead">УПРАВЛЕНИЕ КАРТОЙ</div>

      <div className="blue-map-controls">
        <button type="button" disabled={!canSetup} onClick={() => void setupBlueMap()}>
          ПОДГОТОВИТЬ
        </button>
        <button type="button" disabled={!canStart} onClick={() => void startBlueMap()}>
          {busy ? "Выполняется…" : "ЗАПУСТИТЬ"}
        </button>
        <button type="button" disabled={!canStop} onClick={() => void stopBlueMap()}>
          ОСТАНОВИТЬ
        </button>
        <button type="button" disabled={busy} onClick={() => void monitor.refresh()}>
          ОБНОВИТЬ
        </button>
        <button
          type="button"
          disabled={!canOpen}
          onClick={() => setPreviewOpen((current) => !current)}
        >
          {previewOpen ? "СКРЫТЬ КАРТУ" : "ПОКАЗАТЬ КАРТУ"}
        </button>
        <button type="button" disabled={!canOpen} onClick={() => void openBrowser()}>
          В БРАУЗЕРЕ
        </button>
        <button type="button" disabled={!canOpen} onClick={() => void openWindow()}>
          В ОКНЕ
        </button>
      </div>

      <div className="blue-map-status">
        <div>
          <span>СОСТОЯНИЕ</span>
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
          <span>РАБОЧАЯ ПАПКА</span>
          <strong>{formatStatusValue(status?.workingDir || settings.workingDir)}</strong>
        </div>
        <div>
          <span>МИР</span>
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
        title="ЖУРНАЛ СЕРВЕРА"
        description={`${status?.logs.length ?? 0} событий · сообщения BlueMap`}
      >
        <div className="blue-map-log" aria-live="polite">
          {(status?.logs ?? []).length === 0 ? (
            <span>Пока нет событий</span>
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

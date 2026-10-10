import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  ObsTelemetryPayload,
  ObsTelemetryPluginSettings,
  ObsTelemetryStatus,
} from "../../../types";
import type { PluginSettingsProps } from "../pluginTypes";
import { PluginSettingsGroup } from "../PluginSettingsGroup";
import { normalizeObsTelemetrySettings } from "../pluginSettings";
import { toErrorMessage } from "../../../utils/errors";
import { useRuntimeMonitor } from "../../../hooks/useRuntimeMonitor";
import "./ObsTelemetryPlugin.css";

const OVERLAY_LABELS: Record<string, string> = {
  all: "Весь оверлей",
  settings: "Настройки оверлея",
  health: "Здоровье",
  food: "Еда",
  xp: "Опыт",
  armor: "Броня",
  helmet: "Шлем",
  chestplate: "Нагрудник",
  leggings: "Поножи",
  boots: "Ботинки",
  coords: "Координаты",
  items: "Предметы",
  mainHand: "Основная рука",
  offhand: "Вторая рука",
  dimension: "Измерение",
};

function formatStatusValue(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function formatAge(ageMs?: number | null) {
  if (ageMs === null || ageMs === undefined) return "—";
  if (ageMs < 1000) return `${ageMs}ms`;
  return `${(ageMs / 1000).toFixed(1)}s`;
}

function formatHealth(payload?: ObsTelemetryPayload | null) {
  if (!payload) return "—";
  return `${payload.health.toFixed(1)} / ${payload.maxHealth.toFixed(1)}`;
}

function formatCoords(payload?: ObsTelemetryPayload | null) {
  if (!payload) return "—";
  return `${payload.blockPosition.x} ${payload.blockPosition.y} ${payload.blockPosition.z}`;
}

function formatItemName(payload?: ObsTelemetryPayload | null) {
  const item = payload?.heldItem;
  if (!item?.displayName) return "Пусто";
  return item.count > 1 ? `${item.displayName} x${item.count}` : item.displayName;
}

function ObsTelemetrySettingsEditor({
  settings,
  onChange,
}: {
  settings: ObsTelemetryPluginSettings;
  onChange: (settings: ObsTelemetryPluginSettings) => void;
}) {
  const monitor = useRuntimeMonitor();
  const status = monitor.snapshot?.obsTelemetry ?? null;
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [copiedUrl, setCopiedUrl] = useState("");
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
    const next = await monitor.refresh();
    if (next) {
      setActionError("");
    }
  };

  const startServer = async () => {
    if (!settings.enabled || busy) return;
    try {
      setBusy(true);
      setActionError("");
      await invoke<ObsTelemetryStatus>("start_obs_telemetry");
      await monitor.refresh();
    } catch (error) {
      setActionError(toErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const stopServer = async () => {
    if (busy || !status?.running) return;
    try {
      setBusy(true);
      setActionError("");
      await invoke<ObsTelemetryStatus>("stop_obs_telemetry");
      await monitor.refresh();
    } catch (error) {
      setActionError(toErrorMessage(error));
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
      setActionError(toErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const copySourceUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      window.setTimeout(() => setCopiedUrl((current) => (current === url ? "" : current)), 1200);
    } catch (error) {
      setActionError(toErrorMessage(error));
    }
  };

  return (
    <div className="obs-telemetry-settings">
      <PluginSettingsGroup
        title="ИСТОЧНИК ДЛЯ OBS"
        description="Добавьте этот адрес как источник «Браузер» в OBS"
        collapsible={false}
      >
        <label className="obs-telemetry-field">
          <span>ПОРТ OBS</span>
          <input
            value={settings.port}
            inputMode="numeric"
            onChange={(event) => update({ port: Number(event.target.value) })}
          />
        </label>

        <label className="obs-telemetry-field obs-telemetry-field--wide">
          <span>АДРЕС ОСНОВНОГО ОВЕРЛЕЯ</span>
          <input value={overlayUrl} readOnly spellCheck={false} />
        </label>
      </PluginSettingsGroup>
      <div className="obs-telemetry-subhead">УПРАВЛЕНИЕ ОВЕРЛЕЕМ</div>

      <div className="obs-telemetry-controls">
        <button
          type="button"
          disabled={!settings.enabled || busy || status?.running}
          onClick={() => void startServer()}
        >
          {busy ? "Выполняется…" : "ЗАПУСТИТЬ"}
        </button>
        <button type="button" disabled={busy || !status?.running} onClick={() => void stopServer()}>
          ОСТАНОВИТЬ
        </button>
        <button type="button" disabled={busy} onClick={() => void refreshStatus()}>
          ОБНОВИТЬ
        </button>
        <button type="button" disabled={busy} onClick={() => void openOverlay()}>
          ОТКРЫТЬ
        </button>
        <button type="button" onClick={() => void copySourceUrl(overlayUrl)}>
          {copiedUrl === overlayUrl ? "СКОПИРОВАНО" : "КОПИРОВАТЬ АДРЕС"}
        </button>
      </div>

      <PluginSettingsGroup
        title="ОТДЕЛЬНЫЕ ВИДЖЕТЫ"
        description="Здоровье, броня, координаты и другие источники · нажмите, чтобы скопировать адрес"
      >
        <div className="obs-telemetry-links">
          {Object.entries(overlayUrls).map(([key, url]) => (
            <button key={key} type="button" onClick={() => void copySourceUrl(url)}>
              <span>{copiedUrl === url ? "Скопировано" : (OVERLAY_LABELS[key] ?? key)}</span>
              <strong>{url}</strong>
            </button>
          ))}
        </div>
      </PluginSettingsGroup>
      <PluginSettingsGroup
        title="ДАННЫЕ И ЖУРНАЛ"
        description="Состояние сервера и последние данные игрока"
      >
        <div className="obs-telemetry-status">
          <div>
            <span>СЕРВЕР</span>
            <strong>{formatStatusValue(status?.state)}</strong>
          </div>
          <div>
            <span>ДАННЫЕ В ЭФИРЕ</span>
            <strong>{isLive ? "Да" : "Нет"}</strong>
          </div>
          <div>
            <span>ИГРОК</span>
            <strong>{formatStatusValue(status?.lastPlayerName)}</strong>
          </div>
          <div>
            <span>ОБНОВЛЕНИЕ</span>
            <strong>{formatAge(status?.lastUpdateAgeMs)}</strong>
          </div>
          <div>
            <span>JSON</span>
            <strong>{jsonUrl}</strong>
          </div>
        </div>

        <div className="obs-telemetry-readout">
          <div>
            <span>ЗДОРОВЬЕ</span>
            <strong>{formatHealth(status?.lastPayload)}</strong>
          </div>
          <div>
            <span>БРОНЯ</span>
            <strong>{formatStatusValue(status?.lastPayload?.armor)}</strong>
          </div>
          <div>
            <span>ЕДА</span>
            <strong>{formatStatusValue(status?.lastPayload?.food)}</strong>
          </div>
          <div>
            <span>КООРДИНАТЫ</span>
            <strong>{formatCoords(status?.lastPayload)}</strong>
          </div>
          <div>
            <span>В РУКЕ</span>
            <strong>{formatItemName(status?.lastPayload)}</strong>
          </div>
        </div>

        <div className="obs-telemetry-log" aria-live="polite">
          {(status?.logs ?? []).length === 0 ? (
            <span>Пока нет событий</span>
          ) : (
            status?.logs
              .slice(-12)
              .map((line, index) => <span key={`${line}-${index}`}>{line}</span>)
          )}
        </div>
      </PluginSettingsGroup>
      {(actionError || status?.lastError) && (
        <div className="obs-telemetry-error">{actionError || status?.lastError}</div>
      )}
    </div>
  );
}

export function ObsTelemetrySettings({ plugins, onChange }: PluginSettingsProps) {
  return (
    <ObsTelemetrySettingsEditor
      settings={plugins.obsTelemetry}
      onChange={(obsTelemetry) => onChange({ ...plugins, obsTelemetry })}
    />
  );
}

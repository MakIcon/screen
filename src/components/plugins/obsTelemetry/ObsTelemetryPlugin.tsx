import { TextField } from "../../inputs/TextField";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { isPlainMessageKey, translate, useTranslation } from "../../../i18n/locale";

function overlayLabel(key: string, tr: ReturnType<typeof useTranslation>) {
  const messageKey = `obsTelemetry.overlay.${key}`;
  return isPlainMessageKey(messageKey) ? tr(messageKey) : key;
}

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
  if (!item?.displayName) return translate("common.empty");
  return item.count > 1 ? `${item.displayName} x${item.count}` : item.displayName;
}

function ObsTelemetrySettingsEditor({
  settings,
  onChange,
}: {
  settings: ObsTelemetryPluginSettings;
  onChange: (settings: ObsTelemetryPluginSettings) => void;
}) {
  const tr = useTranslation();
  const monitor = useRuntimeMonitor();
  const status = monitor.snapshot?.obsTelemetry ?? null;
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [copiedUrl, setCopiedUrl] = useState("");
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );
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
    Boolean(status?.running) &&
    Boolean(status?.lastPayload) &&
    lastUpdateAgeMs !== null &&
    lastUpdateAgeMs !== undefined &&
    lastUpdateAgeMs <= 3000;
  const connectionLabel = isLive
    ? tr("obsTelemetry.connected")
    : status?.running
      ? tr("obsTelemetry.waiting")
      : tr("obsTelemetry.stopped");

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
    if (busy || !status?.running) return;
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
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopiedUrl(""), 1600);
    } catch (error) {
      setActionError(toErrorMessage(error));
    }
  };

  return (
    <div className="obs-telemetry-settings">
      <div className={`obs-telemetry-connection${isLive ? " is-live" : ""}`}>
        <div>
          <span className="obs-telemetry-eyebrow">{tr("obsTelemetry.title")}</span>
          <strong>{connectionLabel}</strong>
          <span>{tr("obsTelemetry.setupHint")}</span>
        </div>
        <span className="obs-telemetry-connection-badge">
          <i aria-hidden="true" />
          {isLive ? status?.lastPlayerName : tr("obsTelemetry.compatibility")}
        </span>
      </div>
      <PluginSettingsGroup
        title={tr("obsTelemetry.obsSource")}
        description={tr("obsTelemetry.addThisAddressAs")}
        collapsible={false}
      >
        <label className="obs-telemetry-field">
          <span>{tr("obsTelemetry.obsPort")}</span>
          <TextField
            value={settings.port}
            inputMode="numeric"
            disabled={Boolean(status?.running)}
            onChange={(event) => update({ port: Number(event.target.value) })}
          />
        </label>

        <label className="obs-telemetry-field obs-telemetry-field--wide">
          <span>{tr("obsTelemetry.mainOverlayAddress")}</span>
          <TextField value={overlayUrl} readOnly spellCheck={false} />
        </label>
      </PluginSettingsGroup>
      <div className="obs-telemetry-subhead">{tr("obsTelemetry.overlayControls")}</div>

      <div className="obs-telemetry-controls">
        <button
          type="button"
          disabled={!settings.enabled || busy || status?.running}
          onClick={() => void startServer()}
        >
          {busy ? tr("obsTelemetry.working") : tr("obsTelemetry.start")}
        </button>
        <button type="button" disabled={busy || !status?.running} onClick={() => void stopServer()}>
          {tr("obsTelemetry.stop")}
        </button>
        <button type="button" disabled={busy} onClick={() => void refreshStatus()}>
          {tr("common.refresh")}
        </button>
        <button
          type="button"
          disabled={busy || !status?.running}
          onClick={() => void openOverlay()}
        >
          {tr("obsTelemetry.open")}
        </button>
        <button type="button" onClick={() => void copySourceUrl(overlayUrl)}>
          {copiedUrl === overlayUrl ? tr("obsTelemetry.copied") : tr("obsTelemetry.copyAddress")}
        </button>
      </div>

      <PluginSettingsGroup
        title={tr("obsTelemetry.individualWidgets")}
        description={tr("obsTelemetry.healthArmorCoordinatesAnd")}
      >
        <div className="obs-telemetry-links">
          {Object.entries(overlayUrls).map(([key, url]) => (
            <button key={key} type="button" onClick={() => void copySourceUrl(url)}>
              <span>{copiedUrl === url ? tr("obsTelemetry.copied2") : overlayLabel(key, tr)}</span>
              <strong>{url}</strong>
            </button>
          ))}
        </div>
      </PluginSettingsGroup>
      <PluginSettingsGroup
        title={tr("obsTelemetry.dataAndLog")}
        description={tr("obsTelemetry.serverStateAndThe")}
        defaultExpanded
      >
        <div className="obs-telemetry-status">
          <div>
            <span>{tr("obsTelemetry.server")}</span>
            <strong>{connectionLabel}</strong>
          </div>
          <div>
            <span>{tr("obsTelemetry.liveData")}</span>
            <strong>{isLive ? tr("obsTelemetry.yes") : tr("obsTelemetry.no")}</strong>
          </div>
          <div>
            <span>{tr("obsTelemetry.player")}</span>
            <strong>{formatStatusValue(status?.lastPlayerName)}</strong>
          </div>
          <div>
            <span>{tr("obsTelemetry.updated")}</span>
            <strong>{formatAge(status?.lastUpdateAgeMs)}</strong>
          </div>
          <div>
            <span>JSON</span>
            <strong>{jsonUrl}</strong>
          </div>
        </div>

        <div className="obs-telemetry-readout">
          <div>
            <span>{tr("obsTelemetry.health")}</span>
            <strong>{formatHealth(status?.lastPayload)}</strong>
          </div>
          <div>
            <span>{tr("obsTelemetry.armor")}</span>
            <strong>{formatStatusValue(status?.lastPayload?.armor)}</strong>
          </div>
          <div>
            <span>{tr("obsTelemetry.food")}</span>
            <strong>{formatStatusValue(status?.lastPayload?.food)}</strong>
          </div>
          <div>
            <span>{tr("obsTelemetry.coordinates")}</span>
            <strong>{formatCoords(status?.lastPayload)}</strong>
          </div>
          <div>
            <span>{tr("obsTelemetry.inHand")}</span>
            <strong>{formatItemName(status?.lastPayload)}</strong>
          </div>
        </div>

        <div className="obs-telemetry-log" aria-live="polite">
          {(status?.logs ?? []).length === 0 ? (
            <span>{tr("common.noEventsYet")}</span>
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

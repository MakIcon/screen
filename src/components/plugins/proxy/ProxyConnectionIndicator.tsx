import { useEffect, useState } from "react";
import { useTranslation } from "../../../i18n/locale";
import type { ProxyPluginSettings } from "../../../types";
import { bypassEntries, proxyEndpoint } from "./proxyAddress";
import { watchProxyConnection, type ProxyConnectionState } from "./proxyConnection";
import "./ProxyConnectionIndicator.css";

export function ProxyConnectionIndicator({
  settings,
  onOpenSettings,
}: {
  settings?: ProxyPluginSettings;
  onOpenSettings: () => void;
}) {
  const tr = useTranslation();
  const endpoint = proxyEndpoint(settings?.url ?? "");
  const direct = bypassEntries(settings?.bypass ?? "").includes("*");
  const proxyUrl = settings?.enabled && endpoint && !direct ? settings.url.trim() : null;
  const [connection, setConnection] = useState<{
    url: string;
    state: ProxyConnectionState;
  } | null>(null);

  useEffect(() => {
    if (!proxyUrl) return;
    return watchProxyConnection(proxyUrl, (state) => setConnection({ url: proxyUrl, state }));
  }, [proxyUrl]);

  if (!settings?.enabled) return null;

  const state: ProxyConnectionState =
    connection?.url === proxyUrl ? connection.state : { status: "checking" };
  const status = direct ? "direct" : !endpoint ? "unavailable" : state.status;
  const label = tr(
    direct
      ? "proxy.indicatorDirect"
      : !endpoint
        ? "proxy.needsAddress"
        : status === "connected"
          ? "proxy.indicatorConnected"
          : status === "checking"
            ? "proxy.indicatorChecking"
            : "proxy.indicatorUnavailable",
  );
  const latency =
    status === "connected" && state.status === "connected"
      ? tr("proxy.indicatorLatency", { latency: state.latencyMs })
      : "";
  const tooltip = [
    label,
    direct ? tr("proxy.bypassAllHint") : endpoint,
    latency,
    tr("proxy.openSettings"),
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <button
      className="proxy-connection-indicator"
      type="button"
      data-status={status}
      data-tooltip={tooltip}
      aria-label={`${label}. ${tr("proxy.openSettings")}`}
      aria-haspopup="dialog"
      onClick={onOpenSettings}
    >
      <span className="proxy-connection-symbol" aria-hidden="true">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3 4.5 6v5.5c0 4.3 3.1 7.6 7.5 9.5 4.4-1.9 7.5-5.2 7.5-9.5V6L12 3Z" />
          {status === "connected" && <path d="m8.5 11.8 2.3 2.3 4.7-4.7" />}
          {(status === "unavailable" || status === "direct") && <path d="m9 9 6 6m0-6-6 6" />}
        </svg>
        {status === "checking" && <span className="proxy-connection-spinner" />}
      </span>
    </button>
  );
}

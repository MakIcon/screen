import { toErrorMessage } from "../../../utils/errors";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ProxyPluginSettings } from "../../../types";
import type { PluginSettingsProps } from "../pluginTypes";
import { PluginSettingsGroup } from "../PluginSettingsGroup";
import { normalizeProxySettings } from "../pluginSettings";
import "./ProxyPlugin.css";
import { useTranslation, Trans } from "../../../i18n/locale";

type ProxyTestResult = {
  ok: boolean;
  status?: number | null;
  latencyMs: number;
  message: string;
};

function ProxySettingsEditor({
  settings,
  onChange,
}: {
  settings: ProxyPluginSettings;
  onChange: (settings: ProxyPluginSettings) => void;
}) {
  const tr = useTranslation();
  const [showProxyUrl, setShowProxyUrl] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ProxyTestResult | null>(null);

  const update = (patch: Partial<ProxyPluginSettings>) => {
    onChange(normalizeProxySettings({ ...settings, ...patch }));
  };

  useEffect(() => {
    setTestResult(null);
  }, [settings.url]);

  const testConnection = async () => {
    if (!settings.url.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(
        await invoke<ProxyTestResult>("test_proxy_connection", {
          proxyUrl: settings.url,
        }),
      );
    } catch (error) {
      setTestResult({ ok: false, latencyMs: 0, message: String(error) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="proxy-settings">
      <PluginSettingsGroup
        title={tr("proxy.connectThroughAProxy")}
        description={tr("proxy.addressCredentialsAndConnection")}
        collapsible={false}
      >
        <label className="proxy-field proxy-url-field">
          <span>{tr("proxy.proxyAddress")}</span>
          <span className="proxy-secret-input">
            <input
              type={showProxyUrl ? "text" : "password"}
              value={settings.url}
              placeholder="socks5://user:password@127.0.0.1:1080"
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => update({ url: event.target.value })}
            />
            <button
              type="button"
              className={showProxyUrl ? "active" : ""}
              aria-label={
                showProxyUrl ? tr("proxy.hideProxyDetails") : tr("proxy.showProxyDetails")
              }
              aria-pressed={showProxyUrl}
              onClick={() => setShowProxyUrl((visible) => !visible)}
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M1.5 8s2.4-4 6.5-4 6.5 4 6.5 4-2.4 4-6.5 4-6.5-4-6.5-4Z"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            </button>
          </span>
        </label>

        <div className="proxy-test-row">
          <button
            className="proxy-test-button"
            type="button"
            disabled={testing || !settings.url.trim()}
            onClick={() => void testConnection()}
          >
            {testing ? tr("proxy.testing") : tr("proxy.testConnection")}
          </button>
          {testResult && (
            <div className={`proxy-test-result ${testResult.ok ? "success" : "error"}`}>
              <strong>
                {testResult.ok ? tr("proxy.connectionEstablished") : tr("proxy.connectionFailed")}
              </strong>
              <span>
                {testResult.ok ? "" : toErrorMessage(testResult.message)}
                {testResult.latencyMs > 0
                  ? ` · ${testResult.latencyMs} ${tr("ui.milliseconds")}`
                  : ""}
              </span>
            </div>
          )}
        </div>

        <p className="proxy-hint">
          <Trans
            k="proxy.supportedSchemes"
            values={{
              http: <code>http://</code>,
              https: <code>https://</code>,
              socks: <code>socks5://</code>,
            }}
          />
        </p>
      </PluginSettingsGroup>
      <PluginSettingsGroup
        title={tr("proxy.directConnection")}
        description={tr("proxy.domainsAndNetworksTo")}
      >
        <label className="proxy-field">
          <span>{tr("proxy.proxyExceptions")}</span>
          <textarea
            value={settings.bypass}
            placeholder={"localhost, 127.0.0.1, .example.com\n10.0.0.0/8"}
            spellCheck={false}
            onChange={(event) => update({ bypass: event.target.value })}
          />
        </label>

        <p className="proxy-hint">{tr("proxy.separateAddressesWithCommas")}</p>
      </PluginSettingsGroup>
    </div>
  );
}

export function ProxySettings({ plugins, onChange }: PluginSettingsProps) {
  return (
    <ProxySettingsEditor
      settings={plugins.proxy}
      onChange={(proxy) => onChange({ ...plugins, proxy })}
    />
  );
}

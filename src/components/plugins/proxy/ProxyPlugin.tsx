import { useEffect, useId, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ProxyPluginSettings } from "../../../types";
import type { PluginSettingsProps } from "../pluginTypes";
import { PluginSettingsGroup } from "../PluginSettingsGroup";
import { normalizeProxySettings } from "../pluginSettings";
import { useTranslation } from "../../../i18n/locale";
import {
  PROXY_PROTOCOLS,
  EMPTY_PROXY_FIELDS,
  LOCAL_BYPASS,
  PRIVATE_BYPASS,
  buildProxyAddress,
  parseProxyAddress,
  proxyEndpoint,
  defaultProxyPort,
  isSocks4,
  bypassEntries,
  toggleBypassPreset,
  type ProxyFields,
} from "./proxyAddress";
import "./ProxyPlugin.css";

type ProxyTestResult = {
  ok: boolean;
  status?: number | null;
  latencyMs: number;
  failure?: "timeout" | "authentication" | "http" | "connection" | null;
};

const GLYPHS = {
  route: "M3 5h5l8 14h5M3 19h5l8-14h5M18 2l3 3-3 3M18 16l3 3-3 3",
  check: "m5 12 4 4L19 6",
  eye: "M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  test: "m13 2-9 12h7l-1 8 10-13h-7l1-7Z",
  save: "M5 3h12l4 4v14H3V3h2Zm2 0v7h10V3M7 21v-7h10v7",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7",
  reset: "M4 9a8 8 0 1 1 0 7M4 3v6h6",
  arrow: "M4 12h16m-6-6 6 6-6 6",
} as const;

function Glyph({ name }: { name: keyof typeof GLYPHS }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={GLYPHS[name]} />
    </svg>
  );
}

function createDraft(settings: Pick<ProxyPluginSettings, "url" | "bypass">) {
  const parsed = parseProxyAddress(settings.url);
  return {
    fields: parsed.ok ? parsed.fields : { ...EMPTY_PROXY_FIELDS },
    raw: settings.url,
    bypass: settings.bypass,
    mode: settings.url && !parsed.ok ? ("url" as const) : ("fields" as const),
  };
}

function ProxySettingsEditor({
  settings,
  onChange,
}: {
  settings: ProxyPluginSettings;
  onChange: (settings: ProxyPluginSettings) => void;
}) {
  const tr = useTranslation();
  const id = useId();
  const [draft, setDraft] = useState(() => createDraft(settings));
  const [showSecret, setShowSecret] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [notice, setNotice] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ProxyTestResult | null>(null);
  const testSequence = useRef(0);
  const { url: savedUrl, bypass: savedBypass } = settings;

  useEffect(() => {
    setDraft(createDraft({ url: savedUrl, bypass: savedBypass }));
    testSequence.current += 1;
    setTesting(false);
    setTestResult(null);
    // Profile-only changes must not discard an unfinished connection edit.
  }, [savedUrl, savedBypass]);

  useEffect(
    () => () => {
      testSequence.current += 1;
    },
    [],
  );

  const address =
    draft.mode === "fields"
      ? buildProxyAddress(draft.fields)
      : parseProxyAddress(draft.raw, draft.fields.protocol);
  const savedAddress = parseProxyAddress(settings.url);
  const canonicalSaved = savedAddress.ok ? savedAddress.url : settings.url;
  const normalizedBypass = bypassEntries(draft.bypass).join(", ");
  const changed = address.ok
    ? address.url !== canonicalSaved ||
      normalizedBypass !== bypassEntries(settings.bypass).join(", ")
    : Boolean(draft.mode === "url" ? draft.raw : draft.fields.host) || Boolean(settings.url);
  const hasInput = Boolean(draft.mode === "url" ? draft.raw.trim() : draft.fields.host.trim());
  const endpoint = proxyEndpoint(settings.url);
  const allDirect = bypassEntries(settings.bypass).includes("*");
  const socks4 = isSocks4(draft.fields.protocol);

  const updateDraft = (patch: Partial<typeof draft>) => {
    testSequence.current += 1;
    setTesting(false);
    setTestResult(null);
    setNotice("");
    setDraft((current) => ({ ...current, ...patch }));
  };
  const updateFields = (patch: Partial<ProxyFields>) =>
    updateDraft({ fields: { ...draft.fields, ...patch } });

  const switchMode = (mode: typeof draft.mode) => {
    if (mode === draft.mode) return;
    updateDraft({
      mode,
      ...(address.ok ? { fields: address.fields, raw: address.url } : {}),
    });
  };

  const applyConnection = () => {
    if (!address.ok) return;
    onChange(normalizeProxySettings({ ...settings, url: address.url, bypass: normalizedBypass }));
    setNotice(tr("proxy.applied"));
  };

  const testConnection = async () => {
    if (!address.ok || testing) return;
    const sequence = ++testSequence.current;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await invoke<ProxyTestResult>("test_proxy_connection", {
        proxyUrl: address.url,
      });
      if (sequence === testSequence.current) setTestResult(result);
    } catch {
      if (sequence === testSequence.current)
        setTestResult({ ok: false, latencyMs: 0, failure: "connection" });
    } finally {
      if (sequence === testSequence.current) setTesting(false);
    }
  };

  const saveProfile = () => {
    if (!address.ok || !profileName.trim()) return;
    const name = profileName.trim();
    const existing = settings.profiles.find((profile) => profile.name === name);
    const profile = {
      id: existing?.id ?? crypto.randomUUID(),
      name,
      url: address.url,
      bypass: normalizedBypass,
    };
    const profiles = existing
      ? settings.profiles.map((item) => (item.id === existing.id ? profile : item))
      : [...settings.profiles, profile];
    onChange(normalizeProxySettings({ ...settings, profiles }));
    setProfileName("");
    setNotice(tr("proxy.profileSaved"));
  };

  return (
    <div className="proxy-settings">
      <div
        className="proxy-route"
        data-enabled={settings.enabled && Boolean(endpoint) && !allDirect}
      >
        <span className="proxy-route-icon">
          <Glyph name="route" />
        </span>
        <div className="proxy-route-copy">
          <strong>{tr("proxy.launcherTraffic")}</strong>
          <span>
            {settings.enabled && allDirect
              ? tr("proxy.bypassAllHint")
              : settings.enabled && endpoint
                ? endpoint
                : tr(settings.enabled ? "proxy.needsAddress" : "proxy.disabledRoute")}
          </span>
        </div>
        <span className="proxy-route-badge">
          {tr(settings.enabled && endpoint && !allDirect ? "proxy.viaProxy" : "proxy.direct")}
        </span>
      </div>

      <PluginSettingsGroup
        title={tr("proxy.connection")}
        description={tr("proxy.connectionDescription")}
        collapsible={false}
      >
        <form
          className="proxy-connection-form"
          onSubmit={(event) => {
            event.preventDefault();
            applyConnection();
          }}
        >
          <div className="proxy-mode-row">
            <div className="proxy-mode-switch" role="group" aria-label={tr("proxy.inputMode")}>
              <button
                type="button"
                aria-pressed={draft.mode === "fields"}
                onClick={() => switchMode("fields")}
              >
                {tr("proxy.byFields")}
              </button>
              <button
                type="button"
                aria-pressed={draft.mode === "url"}
                onClick={() => switchMode("url")}
              >
                {tr("proxy.byUrl")}
              </button>
            </div>
            <div className="proxy-connection-actions">
              <button
                className="proxy-button proxy-button--primary"
                type="submit"
                disabled={!address.ok || !changed}
              >
                <Glyph name="check" />
                {tr("proxy.apply")}
              </button>
              <button
                className="proxy-button"
                type="button"
                disabled={testing || !address.ok}
                onClick={() => void testConnection()}
              >
                {testing ? (
                  <span className="proxy-spinner" aria-hidden="true" />
                ) : (
                  <Glyph name="test" />
                )}
                {tr(testing ? "proxy.testing" : "proxy.testConnection")}
              </button>
              {changed && (
                <button
                  type="button"
                  className="proxy-icon-button proxy-reset"
                  aria-label={tr("proxy.resetDraft")}
                  title={tr("proxy.resetDraft")}
                  onClick={() => updateDraft(createDraft(settings))}
                >
                  <Glyph name="reset" />
                </button>
              )}
            </div>
          </div>

          <div className="proxy-test-live" aria-live="polite" aria-atomic="true">
            {testResult && (
              <div className={`proxy-test-result ${testResult.ok ? "success" : "error"}`}>
                <div className="proxy-test-result-heading">
                  <strong>
                    {tr(testResult.ok ? "proxy.connectionEstablished" : "proxy.connectionFailed")}
                  </strong>
                  <span className="proxy-test-metrics">
                    {[
                      testResult.status
                        ? tr("proxy.httpStatus", { status: testResult.status })
                        : "",
                      testResult.latencyMs > 0
                        ? `${testResult.latencyMs} ${tr("ui.milliseconds")}`
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                <p>
                  {tr(
                    testResult.ok
                      ? "proxy.testSuccessHint"
                      : testResult.failure === "timeout"
                        ? "proxy.testTimeout"
                        : testResult.failure === "authentication"
                          ? "proxy.testAuth"
                          : testResult.failure === "http"
                            ? "proxy.testHttp"
                            : "proxy.testFailedHint",
                  )}
                </p>
              </div>
            )}
          </div>

          {draft.mode === "fields" ? (
            <>
              <label className="proxy-field">
                <span>{tr("proxy.protocol")}</span>
                <select
                  value={draft.fields.protocol}
                  onChange={(event) => {
                    const protocol = event.target.value as ProxyFields["protocol"];
                    updateFields({
                      protocol,
                      ...(draft.fields.port === defaultProxyPort(draft.fields.protocol)
                        ? { port: defaultProxyPort(protocol) }
                        : {}),
                    });
                  }}
                >
                  {PROXY_PROTOCOLS.map((protocol) => (
                    <option key={protocol} value={protocol}>
                      {protocol.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
              <p className="proxy-hint proxy-protocol-hint">
                {tr(
                  draft.fields.protocol === "socks5h" || draft.fields.protocol === "socks4a"
                    ? "proxy.remoteDns"
                    : draft.fields.protocol.startsWith("socks")
                      ? "proxy.localDns"
                      : "proxy.httpTunnel",
                )}
              </p>
              <div className="proxy-address-grid">
                <label className="proxy-field">
                  <span>{tr("proxy.host")}</span>
                  <input
                    value={draft.fields.host}
                    placeholder="127.0.0.1"
                    spellCheck={false}
                    autoComplete="off"
                    autoCapitalize="none"
                    aria-invalid={!address.ok && address.error === "invalidHost"}
                    aria-describedby={`${id}-validation`}
                    onChange={(event) => updateFields({ host: event.target.value })}
                  />
                </label>
                <label className="proxy-field">
                  <span>{tr("proxy.port")}</span>
                  <input
                    value={draft.fields.port}
                    placeholder="1080"
                    inputMode="numeric"
                    maxLength={5}
                    aria-invalid={!address.ok && address.error === "invalidPort"}
                    aria-describedby={`${id}-validation`}
                    onChange={(event) => updateFields({ port: event.target.value })}
                  />
                </label>
              </div>
              <div className="proxy-credentials-grid">
                <label className="proxy-field">
                  <span>{tr("proxy.username")}</span>
                  <input
                    value={draft.fields.username}
                    placeholder={tr("proxy.optional")}
                    spellCheck={false}
                    autoComplete="off"
                    autoCapitalize="none"
                    onChange={(event) => updateFields({ username: event.target.value })}
                  />
                </label>
                <label className="proxy-field">
                  <span>{tr("proxy.password")}</span>
                  <span className="proxy-secret-input">
                    <input
                      type={showSecret ? "text" : "password"}
                      aria-label={tr("proxy.password")}
                      value={draft.fields.password}
                      placeholder={tr("proxy.optional")}
                      autoComplete="new-password"
                      spellCheck={false}
                      onChange={(event) => updateFields({ password: event.target.value })}
                    />
                    <button
                      type="button"
                      className="proxy-icon-button"
                      aria-label={tr(
                        showSecret ? "proxy.hideProxyDetails" : "proxy.showProxyDetails",
                      )}
                      aria-pressed={showSecret}
                      onClick={() => setShowSecret((visible) => !visible)}
                    >
                      <Glyph name="eye" />
                    </button>
                  </span>
                </label>
              </div>
              <p className="proxy-hint">{tr(socks4 ? "proxy.socks4Hint" : "proxy.authHint")}</p>
            </>
          ) : (
            <>
              <label className="proxy-field">
                <span>{tr("proxy.proxyAddress")}</span>
                <span className="proxy-secret-input">
                  <input
                    type={showSecret ? "text" : "password"}
                    aria-label={tr("proxy.proxyAddress")}
                    value={draft.raw}
                    placeholder="socks5h://user:password@127.0.0.1:1080"
                    spellCheck={false}
                    autoComplete="off"
                    autoCapitalize="none"
                    aria-invalid={hasInput && !address.ok}
                    aria-describedby={`${id}-validation`}
                    onChange={(event) => updateDraft({ raw: event.target.value })}
                  />
                  <button
                    type="button"
                    className="proxy-icon-button"
                    aria-label={tr(
                      showSecret ? "proxy.hideProxyDetails" : "proxy.showProxyDetails",
                    )}
                    aria-pressed={showSecret}
                    onClick={() => setShowSecret((visible) => !visible)}
                  >
                    <Glyph name="eye" />
                  </button>
                </span>
              </label>
              <p className="proxy-hint">{tr("proxy.importHint")}</p>
              <p className="proxy-hint">{tr("proxy.supportedProtocols")}</p>
            </>
          )}

          <div id={`${id}-validation`} className="proxy-validation" aria-live="polite">
            {hasInput && !address.ok && <span>{tr(`proxy.${address.error}`)}</span>}
          </div>
          <p className="proxy-hint proxy-apply-note">
            {tr(changed ? "proxy.pendingChanges" : "proxy.testHint")}
          </p>
        </form>
      </PluginSettingsGroup>

      <PluginSettingsGroup
        title={tr("proxy.directConnection")}
        description={tr("proxy.domainsAndNetworksTo")}
        defaultExpanded
      >
        <div className="proxy-presets">
          {(
            [
              ["proxy.localComputer", LOCAL_BYPASS],
              ["proxy.privateNetworks", PRIVATE_BYPASS],
            ] as const
          ).map(([key, preset]) => (
            <button
              key={key}
              type="button"
              aria-pressed={preset.every((entry) => bypassEntries(draft.bypass).includes(entry))}
              onClick={() => updateDraft({ bypass: toggleBypassPreset(draft.bypass, preset) })}
            >
              <Glyph name="check" />
              {tr(key)}
            </button>
          ))}
        </div>
        <label className="proxy-field">
          <span>{tr("proxy.proxyExceptions")}</span>
          <textarea
            value={draft.bypass}
            placeholder={"localhost, 127.0.0.1, .example.com\n10.0.0.0/8"}
            spellCheck={false}
            onChange={(event) => updateDraft({ bypass: event.target.value })}
          />
        </label>
        <p className="proxy-hint">{tr("proxy.separateAddressesWithCommas")}</p>
        {bypassEntries(draft.bypass).includes("*") && (
          <p className="proxy-validation">{tr("proxy.bypassAllHint")}</p>
        )}
        {changed && address.ok && (
          <button
            className="proxy-button proxy-bypass-apply"
            type="button"
            onClick={applyConnection}
          >
            <Glyph name="check" />
            {tr("proxy.apply")}
          </button>
        )}
      </PluginSettingsGroup>

      <PluginSettingsGroup
        title={tr("proxy.profiles")}
        description={tr("proxy.profilesDescription")}
        defaultExpanded
      >
        {settings.profiles.length > 0 ? (
          <ul className="proxy-profiles">
            {settings.profiles.map((profile) => {
              const parsed = parseProxyAddress(profile.url);
              const active =
                parsed.ok &&
                parsed.url === canonicalSaved &&
                bypassEntries(profile.bypass).join(", ") ===
                  bypassEntries(settings.bypass).join(", ");
              return (
                <li key={profile.id} className="proxy-profile" data-active={active}>
                  <span className="proxy-profile-icon">
                    <Glyph name="route" />
                  </span>
                  <div className="proxy-profile-copy">
                    <strong>{profile.name}</strong>
                    <span>
                      {parsed.ok
                        ? `${parsed.fields.protocol.toUpperCase()} · ${proxyEndpoint(profile.url)}`
                        : tr("proxy.invalidAddress")}
                    </span>
                  </div>
                  <button
                    className="proxy-button proxy-profile-use"
                    type="button"
                    disabled={!parsed.ok || active}
                    aria-label={tr("proxy.useNamedProfile", { name: profile.name })}
                    onClick={() => {
                      onChange(
                        normalizeProxySettings({
                          ...settings,
                          url: profile.url,
                          bypass: profile.bypass,
                        }),
                      );
                      setNotice(tr("proxy.profileApplied"));
                    }}
                  >
                    {active ? <Glyph name="check" /> : <Glyph name="arrow" />}
                    <span>{tr(active ? "proxy.selectedProfile" : "proxy.useProfile")}</span>
                  </button>
                  <button
                    type="button"
                    className="proxy-icon-button proxy-profile-delete"
                    aria-label={tr("proxy.deleteNamedProfile", { name: profile.name })}
                    onClick={() => {
                      onChange(
                        normalizeProxySettings({
                          ...settings,
                          profiles: settings.profiles.filter((item) => item.id !== profile.id),
                        }),
                      );
                      setNotice(tr("proxy.profileDeleted"));
                    }}
                  >
                    <Glyph name="trash" />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="proxy-profiles-empty">{tr("proxy.noProfiles")}</p>
        )}
        <form
          className="proxy-profile-save"
          onSubmit={(event) => {
            event.preventDefault();
            saveProfile();
          }}
        >
          <label className="proxy-field">
            <span>{tr("proxy.profileName")}</span>
            <input
              value={profileName}
              maxLength={64}
              placeholder={tr("proxy.profileNamePlaceholder")}
              onChange={(event) => setProfileName(event.target.value)}
            />
          </label>
          <button
            className="proxy-button"
            type="submit"
            disabled={!address.ok || !profileName.trim()}
          >
            <Glyph name="save" />
            {tr("proxy.saveProfile")}
          </button>
        </form>
        <p className="proxy-hint">{tr("proxy.saveProfileHint")}</p>
      </PluginSettingsGroup>
      <p className="proxy-notice" role="status">
        {notice}
      </p>
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

import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLocale, useTranslation } from "../../../i18n/locale";
import type {
  MineflayerBotPluginSettings,
  MineflayerBotStatus,
  MineflayerStorageGroup,
  MineflayerStorageScan,
  MinecraftCatalog,
} from "../../../types";
import bundledCatalog from "../../../data/minecraftCatalog.json";
import { toErrorMessage } from "../../../utils/errors";
import { CustomNumberInput } from "../../inputs/CustomNumberInput";
import { SearchableSelect } from "../../inputs/SearchableSelect";
import { flushPluginSettings } from "../pluginSettingsSync";
import { BotSessionContext, useBotId } from "./BotSessionContext";
import { useBotFleet } from "./BotFleetContext";
import { botConfiguration } from "./botFleet";
import { localizeCatalog } from "./catalogLocalization";
import { formatBlockCoordinates } from "./gatheringCoordinates";
import {
  mergeScannedStorageGroups,
  normalizeStorageGroups,
  storagePositionKey,
} from "./storageGroups";
import { MineflayerStorageGroups } from "./MineflayerStorageGroups";
import "./MineflayerStorageWorkspace.css";

type Scope = "one" | "group" | "all";
const DRAFTS_KEY = "screen:mineflayer:storage-drafts";
const IMPORTED_KEY = "screen:mineflayer:imported-storage-scans";
type Application = {
  saved: number;
  applied: number;
  offline: number;
  errors: Array<{ botId?: string; error: string }>;
  groupsByBot?: Record<string, MineflayerStorageGroup[]>;
  scan?: MineflayerStorageScan | null;
};
const serverKey = (settings: { host: string; port: number }) =>
  `${settings.host.trim().toLowerCase()}:${settings.port}`;

export function MineflayerStorageWorkspace({
  settings,
  status,
  refresh,
}: {
  settings: MineflayerBotPluginSettings;
  status: MineflayerBotStatus | null;
  refresh: () => Promise<unknown>;
}) {
  const tr = useTranslation(),
    locale = useLocale(),
    botId = useBotId(),
    fleet = useBotFleet();
  const profiles = fleet?.profiles ?? [{ id: botId, settings: botConfiguration(settings) }];
  const statuses = fleet?.statuses ?? (status ? [status] : []);
  const selected = fleet?.recipients ?? profiles;
  const [scope, setScope] = useState<Scope>(selected.length > 1 ? "group" : "one");
  const [singleId, setSingleId] = useState(botId);
  const [drafts, setDrafts] = useState<Record<string, MineflayerStorageGroup[]>>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(DRAFTS_KEY) || "{}");
      if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
      return Object.fromEntries(
        Object.entries(saved)
          .slice(-16)
          .filter(([, value]) => Array.isArray(value))
          .map(([key, value]) => [key, normalizeStorageGroups(value)]),
      );
    } catch {
      return {};
    }
  });
  const [savedGroups, setSavedGroups] = useState<Record<string, MineflayerStorageGroup[]>>({});
  const importedScans = useRef<Set<string> | null>(null);
  if (!importedScans.current) {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(IMPORTED_KEY) || "[]");
      importedScans.current = new Set(
        Array.isArray(saved)
          ? saved.filter((item): item is string => typeof item === "string").slice(-64)
          : [],
      );
    } catch {
      importedScans.current = new Set();
    }
  }
  function consumeScan(scanToken: string) {
    importedScans.current!.add(scanToken);
    try {
      localStorage.setItem(IMPORTED_KEY, JSON.stringify([...importedScans.current!].slice(-64)));
    } catch {
      /* Retain the current session's import marker. */
    }
  }
  useEffect(() => {
    try {
      localStorage.setItem(
        DRAFTS_KEY,
        JSON.stringify(Object.fromEntries(Object.entries(drafts).slice(-16))),
      );
    } catch {
      /* The open editor still retains its draft when browser storage is unavailable. */
    }
  }, [drafts]);
  const [radius, setRadius] = useState(24);
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [clearConfirmation, setClearConfirmation] = useState("");
  const [token, setToken] = useState("");
  const [lastScan, setLastScan] = useState<MineflayerStorageScan | null>(null);
  const [scanFailure, setScanFailure] = useState<{
    token: string;
    state: "cancelled" | "error";
  } | null>(null);
  const setStorageBusy = fleet?.setStorageBusy;
  useEffect(() => {
    setStorageBusy?.(Boolean(busy));
    return () => setStorageBusy?.(false);
  }, [busy, setStorageBusy]);
  const sending = useRef(false);
  const targets =
    scope === "all"
      ? profiles
      : scope === "group"
        ? selected
        : profiles.filter((bot) => bot.id === singleId);
  const source = targets[0] ?? profiles[0];
  const scopeKey = `${serverKey(source.settings)}:${scope}:${targets
    .map((bot) => bot.id)
    .sort()
    .join(",")}`;
  const groups =
    drafts[scopeKey] ?? savedGroups[source.id] ?? source.settings.gathering.storageGroups;
  const dirty = Object.prototype.hasOwnProperty.call(drafts, scopeKey);
  const statusFor = (id: string) => statuses.find((bot) => (bot.botId ?? "default") === id);
  const nameFor = (id: string) => {
    const bot = profiles.find((bot) => bot.id === id);
    return bot ? (fleet?.nameFor(bot) ?? bot.settings.botNickname) : id;
  };
  const candidates = profiles.filter(
    (bot) => serverKey(bot.settings) === serverKey(source.settings),
  );
  const candidateIds = new Set(candidates.map((bot) => bot.id));
  const scans = statuses
    .filter((bot) => candidateIds.has(bot.botId ?? "default"))
    .flatMap((bot) => {
      const scan = bot.inventory?.production?.storageScan;
      return scan?.originMode === "owner" ? [{ bot, scan }] : [];
    })
    .sort((a, b) => (b.scan.startedAt ?? 0) - (a.scan.startedAt ?? 0));
  const running = scans.find((entry) => entry.scan.state === "running");
  const observed = token
    ? scans.find((entry) => entry.scan.token === token)
    : (running ?? scans[0]);
  const team = scans.filter(
    (entry) => entry.scan.token === observed?.scan.token && observed?.scan.token,
  );
  const teamRecords = [
    ...new Map(
      team
        .flatMap((entry) => entry.scan.records)
        .map((record) => [storagePositionKey(record.position), record]),
    ).values(),
  ];
  const teamSize = Math.max(1, ...team.map((entry) => entry.scan.teamSize ?? 1), team.length);
  const scan: MineflayerStorageScan | null =
    lastScan && lastScan.token === token
      ? lastScan
      : observed
        ? {
            ...observed.scan,
            records: teamRecords,
            teamSize,
            total: Math.max(observed.scan.total, ...team.map((entry) => entry.scan.teamTotal ?? 0)),
            state:
              scanFailure && scanFailure.token === observed.scan.token
                ? scanFailure.state
                : team.some((entry) => entry.scan.state === "running") || busy === "scan"
                  ? "running"
                  : team.some((entry) => entry.scan.state === "cancelled")
                    ? "cancelled"
                    : team.some((entry) => entry.scan.state === "error")
                      ? "error"
                      : observed.scan.state,
          }
        : lastScan;
  const locked = Boolean(busy) || Boolean(fleet?.busy) || Boolean(running);
  const online = candidates.filter(
    (bot) => statusFor(bot.id)?.state === "connected" && statusFor(bot.id)?.running,
  );
  const different = targets.some(
    (bot) =>
      JSON.stringify(bot.settings.gathering.storageGroups) !==
      JSON.stringify(source.settings.gathering.storageGroups),
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const catalog = useMemo(() => localizeCatalog(bundledCatalog as MinecraftCatalog), [locale]);
  const label = (name: string) =>
    catalog.entries.find((entry) => entry.name === name)?.displayName || name;
  function resultMessage(result: Application) {
    if (result.groupsByBot) setSavedGroups((current) => ({ ...current, ...result.groupsByBot }));
    setError("");
    setFeedback(
      tr("bot.warehouse.applied", {
        saved: result.saved,
        applied: result.applied,
        offline: result.offline,
      }),
    );
    if (result.errors.length)
      setError(
        result.errors
          .map((entry) => `${entry.botId ? nameFor(entry.botId) + ": " : ""}${entry.error}`)
          .join("\n"),
      );
  }
  async function apply() {
    if (sending.current || locked || !targets.length) return;
    sending.current = true;
    setBusy("apply");
    setError("");
    setFeedback("");
    const key = scopeKey,
      ids = targets.map((bot) => bot.id),
      snapshot = structuredClone(groups);
    try {
      await flushPluginSettings();
      const result = await invoke<Application>("apply_mineflayer_storage", {
        botIds: ids,
        groups: snapshot,
        ...(scan?.token &&
        !scan.saved &&
        (!dirty || !groups.length) &&
        !importedScans.current!.has(scan.token) &&
        scan.records.some((record) => !record.error && record.contents)
          ? { scanToken: scan.token, candidateIds: candidates.map((bot) => bot.id) }
          : {}),
      });
      if (result.scan) {
        setLastScan(result.scan);
        setToken(result.scan.token ?? "");
        if (result.scan.token) consumeScan(result.scan.token);
      }
      setDrafts((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      resultMessage(result);
      await refresh();
    } catch (failure) {
      setError(toErrorMessage(failure));
    } finally {
      sending.current = false;
      setBusy("");
    }
  }
  async function discover() {
    if (sending.current || locked || !targets.length || !online.length) return;
    sending.current = true;
    setBusy("scan");
    setError("");
    setFeedback("");
    setLastScan(null);
    setScanFailure(null);
    const requestToken = crypto.randomUUID(),
      key = scopeKey;
    setToken(requestToken);
    try {
      await flushPluginSettings();
      const result = await invoke<{
        botId: string;
        scan: MineflayerStorageScan;
        application: Application | null;
      }>("scan_mineflayer_storage_near_player", {
        candidateIds: candidates.map((bot) => bot.id),
        botIds: targets.map((bot) => bot.id),
        radius,
        token: requestToken,
      });
      setLastScan(result.scan);
      if (result.scan.token) consumeScan(result.scan.token);
      setDrafts((current) =>
        current[key] || !result.application
          ? {
              ...current,
              [key]: mergeScannedStorageGroups(current[key] ?? groups, result.scan.groups),
            }
          : current,
      );
      if (result.application) resultMessage(result.application);
      else
        setFeedback(
          tr("bot.warehouse.partialReady", {
            checked: result.scan.records.filter((record) => !record.error).length,
            total: result.scan.total,
          }),
        );
      await refresh();
    } catch (failure) {
      const message = toErrorMessage(failure);
      setScanFailure({
        token: requestToken,
        state: /остановлен|отменен|отменён/i.test(message) ? "cancelled" : "error",
      });
      setError(message);
    } finally {
      sending.current = false;
      setBusy("");
    }
  }
  async function clearStorage() {
    if (sending.current || locked || !targets.length || clearConfirmation !== scopeKey) return;
    sending.current = true;
    setBusy("clear");
    setError("");
    setFeedback("");
    const ids = targets.map((bot) => bot.id);
    try {
      await flushPluginSettings();
      const result = await invoke<Application>("apply_mineflayer_storage", {
        botIds: ids,
        groups: [],
      });
      setDrafts((current) =>
        Object.fromEntries(
          Object.entries(current).filter(
            ([key]) =>
              !key
                .slice(key.lastIndexOf(":") + 1)
                .split(",")
                .some((id) => ids.includes(id)),
          ),
        ),
      );
      setLastScan(null);
      for (const entry of scans) if (entry.scan.token) consumeScan(entry.scan.token);
      setToken(`cleared-${crypto.randomUUID()}`);
      setClearConfirmation("");
      resultMessage(result);
      if (!result.errors.length) setFeedback(tr("bot.warehouse.cleared", { count: result.saved }));
      await refresh();
    } catch (failure) {
      setError(toErrorMessage(failure));
    } finally {
      sending.current = false;
      setBusy("");
    }
  }
  async function stopScan() {
    const member = running ?? observed;
    if (!member) return;
    try {
      await invoke("stop_mineflayer_storage_scan", { botId: member.bot.botId ?? "default" });
      await refresh();
    } catch (failure) {
      setError(toErrorMessage(failure));
    }
  }
  const editorStatus = statusFor(source.id) ?? null;
  return (
    <section className="mf-warehouses" aria-label={tr("bot.warehouse.title")}>
      <header className="mf-warehouse-heading">
        <span className="mf-warehouse-mark" aria-hidden="true">
          <span className="mineflayer-chest-icon" />
        </span>
        <div>
          <h2>{tr("bot.warehouse.title")}</h2>
          <p>{tr("bot.warehouse.description")}</p>
        </div>
      </header>
      <div className="mf-warehouse-scope">
        <strong>{tr("bot.warehouse.recipients")}</strong>
        <div
          className="mf-warehouse-scope-options"
          role="group"
          aria-label={tr("bot.warehouse.recipients")}
        >
          {(["one", "group", "all"] as const).map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={scope === value}
              disabled={locked}
              onClick={() => {
                setScope(value);
                setFeedback("");
                setError("");
              }}
            >
              {tr(`bot.warehouse.scope.${value}`, {
                count: value === "group" ? selected.length : profiles.length,
              })}
            </button>
          ))}
        </div>
        {scope === "one" ? (
          <SearchableSelect
            label={tr("bot.warehouse.chooseBot")}
            value={singleId}
            allowEmpty={false}
            variant="field"
            disabled={locked}
            onChange={(id) => {
              setSingleId(id);
              setFeedback("");
              setError("");
            }}
            options={profiles.map((bot) => ({ value: bot.id, label: nameFor(bot.id) }))}
          />
        ) : (
          <p>{scope === "group" ? tr("bot.warehouse.groupHint") : tr("bot.warehouse.allHint")}</p>
        )}
        <div className="mf-warehouse-recipient-list">
          {targets.slice(0, 8).map((bot) => (
            <span key={bot.id}>{nameFor(bot.id)}</span>
          ))}
          {targets.length > 8 && <span>+{targets.length - 8}</span>}
        </div>
        {different && (
          <p className="mf-warehouse-notice">
            {tr("bot.warehouse.different", { name: nameFor(source.id) })}
          </p>
        )}
        <div className="mf-warehouse-clear">
          {clearConfirmation === scopeKey ? (
            <>
              <p>{tr("bot.warehouse.clearConfirm", { count: targets.length })}</p>
              <div>
                <button
                  type="button"
                  className="mf-button mf-danger-button"
                  disabled={locked}
                  onClick={() => void clearStorage()}
                >
                  {busy === "clear"
                    ? tr("bot.warehouse.clearing")
                    : tr("bot.warehouse.clearConfirmAction")}
                </button>
                <button
                  type="button"
                  className="mf-button"
                  disabled={locked}
                  onClick={() => setClearConfirmation("")}
                >
                  {tr("bot.warehouse.clearCancel")}
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              className="mf-button mf-danger-button"
              disabled={
                locked ||
                !targets.length ||
                (!groups.length &&
                  !targets.some((bot) => bot.settings.gathering.storageGroups.length))
              }
              onClick={() => setClearConfirmation(scopeKey)}
            >
              {tr("bot.warehouse.clearAll")}
            </button>
          )}
        </div>
      </div>
      <div className="mf-warehouse-discovery">
        <div>
          <span className="mf-workspace-eyebrow">{tr("bot.warehouse.discoveryEyebrow")}</span>
          <h3>{tr("bot.warehouse.discovery")}</h3>
          <p>{tr("bot.warehouse.discoveryHint")}</p>
        </div>
        <div className="mf-warehouse-discovery-controls">
          <label className="mineflayer-bot-field">
            <span>{tr("bot.warehouse.radius")}</span>
            <CustomNumberInput
              ariaLabel={tr("bot.warehouse.radius")}
              background="transparent"
              min={4}
              max={64}
              value={radius}
              onChange={setRadius}
              disabled={locked}
            />
          </label>
          <button
            className="mf-button mf-warehouse-primary"
            type="button"
            disabled={locked || !targets.length || !online.length}
            onClick={() => void discover()}
          >
            {busy === "scan" || running ? tr("bot.warehouse.scanning") : tr("bot.warehouse.find")}
          </button>
        </div>
        {!online.length && <p>{tr("bot.warehouse.connectHint")}</p>}
        <small>{tr("bot.warehouse.discoveryPreserves")}</small>
        {busy === "scan" && !running && !scan && (
          <p role="status">{tr("bot.warehouse.selecting")}</p>
        )}
        {scan && (
          <div className="mf-warehouse-scan-summary" role="status" aria-live="polite">
            <strong>
              {(scan.teamSize ?? 1) > 1
                ? tr("bot.warehouse.team", { count: scan.teamSize ?? 1 })
                : observed
                  ? nameFor(observed.bot.botId ?? "default")
                  : tr("bot.warehouse.result")}
            </strong>
            <span>
              {scan.state === "running"
                ? scan.phase === "approaching"
                  ? tr("bot.warehouse.approaching")
                  : tr("bot.warehouse.inspecting", {
                      checked: scan.records.filter((record) => !record.error).length,
                      total: scan.total,
                    })
                : scan.state === "complete"
                  ? tr("bot.warehouse.complete", { total: scan.total, added: scan.added })
                  : tr(
                      scan.state === "cancelled"
                        ? "bot.warehouse.stoppedProgress"
                        : "bot.warehouse.incompleteProgress",
                      {
                        checked: scan.records.filter((record) => !record.error).length,
                        total: scan.total,
                      },
                    )}
              {scan.blockTotal && scan.blockTotal > scan.total
                ? ` ${tr("bot.warehouse.blockTotal", { count: scan.blockTotal })}`
                : ""}
            </span>
            {(running || busy === "scan") && observed && (
              <button type="button" className="mf-button" onClick={() => void stopScan()}>
                {tr("bot.storageGroups.stopScan")}
              </button>
            )}
          </div>
        )}
        {scan && scan.records.length > 0 && (
          <details className="mf-warehouse-results">
            <summary>
              {tr("bot.warehouse.results", {
                count: scan.records.filter((record) => !record.error).length,
              })}
            </summary>
            <div className="mineflayer-storage-scan-results">
              {scan.records.map((record) => (
                <div
                  key={storagePositionKey(record.position)}
                  className={record.error ? "is-error" : ""}
                >
                  <strong>{record.label}</strong>
                  <span>
                    {formatBlockCoordinates(record.position)} ·{" "}
                    {record.positions.length === 2
                      ? tr("bot.storageGroups.doubleChest")
                      : label(record.name)}
                  </span>
                  <small>
                    {record.error ||
                      `${tr("bot.storageGroups.freeSlots")}: ${record.freeSlots}/${record.totalSlots}${
                        record.contents?.length
                          ? " · " +
                            record.contents
                              .slice(0, 3)
                              .map((item) => `${label(item.name)} × ${item.count}`)
                              .join(", ")
                          : ""
                      }`}
                  </small>
                </div>
              ))}
            </div>
            {scan.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </details>
        )}
      </div>
      <BotSessionContext.Provider value={source.id}>
        <MineflayerStorageGroups
          groups={groups}
          onChange={(next) => setDrafts((current) => ({ ...current, [scopeKey]: next }))}
          catalog={catalog}
          connected={Boolean(editorStatus?.running && editorStatus.state === "connected")}
          disabled={locked}
          status={editorStatus}
          refresh={refresh}
        />
      </BotSessionContext.Provider>
      <footer className="mf-warehouse-apply">
        <div>
          <strong>{dirty ? tr("bot.warehouse.unsaved") : tr("bot.warehouse.ready")}</strong>
          <p>{tr("bot.warehouse.applyHint")}</p>
        </div>
        <button
          className="mf-button mf-warehouse-primary"
          type="button"
          disabled={locked || !targets.length}
          onClick={() => void apply()}
        >
          {busy === "apply"
            ? tr("bot.storageGroups.applying")
            : tr("bot.warehouse.apply", { count: targets.length })}
        </button>
      </footer>
      {(feedback || error) && (
        <div
          className={`mineflayer-bot-chat-feedback${error ? " is-error" : ""}`}
          role={error ? "alert" : "status"}
        >
          {error || feedback}
        </div>
      )}
    </section>
  );
}

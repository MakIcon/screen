import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import "./App.css";
import { TAB_INDEX, TAB_ORDER, TAB_TITLE } from "./constants/tabs";
import { useWindowPhase } from "./hooks/useWindowPhase";
import { clampRamToSystem } from "./utils/ram";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  BuildCardSettingsPopup,
  DEFAULT_BUILD_CARD_APPEARANCE,
  getBuildCardBadgeText,
  normalizeBuildCardAppearance,
  type BuildCardAppearance,
  type BuildCardPreviewSize,
} from "./components/builds/BuildCardSettingsPopup";
import { BuildStatsModal } from "./components/builds/BuildStatsModal";
import { BuildScreenshotsModal } from "./components/builds/BuildScreenshotsModal";
import { BuildLogsModal } from "./components/builds/BuildLogsModal";
import type {
  ActionResult,
  BuildRuntimeSettingsDraft,
  CreateInstancePayload,
  DropdownKey,
  ExportedItem,
  InstanceExportData,
  InstanceItem,
  InstallProgressPayload,
  LauncherPluginsSettings,
  LauncherSettings,
  LaunchLogSnapshot,
  LoaderType,
  MicrosoftAccount,
  MinecraftExitPayload,
  MinecraftManifest,
  TabKey,
  UpdateInstancePayload,
} from "./types";
import { MicrosoftAccountsModal } from "./components/modals/MicrosoftAccountsModal";
import { ToastStack } from "./components/notifications/ToastStack";
import { useToasts } from "./hooks/useToasts";
import { formatLastPlayed } from "./utils/playtime";
import { resolvePlaceholders } from "./utils/placeholders";
import { buildPlaceholderContext, type PlaceholderTarget, usePlaceholders } from "./hooks/usePlaceholders";
import { OverviewTab } from "./tabs/OverviewTab";
import { OverviewPanel } from "./tabs/OverviewPanel";
import { InstancesTab } from "./tabs/InstancesTab";
import { ModsTab } from "./tabs/ModsTab";
import { ResourcePacksTab } from "./tabs/ResourcePacksTab";
import { ShadersTab } from "./tabs/ShadersTab";
import { SettingsTab } from "./tabs/SettingsTab";
import { useModActions } from "./hooks/useModActions";
import { usePackActions } from "./hooks/usePackActions";
import { useShaderActions } from "./hooks/useShaderActions";
import { useTheme } from "./hooks/useTheme";
import { OptionToggle } from "./components/inputs/OptionToggle";
import {
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  getDefaultJavaArgsText,
  getDefaultRuntimeSettingsDraft,
  normalizeRuntimeSettingsDraft,
} from "./utils/javaArgs";

const ADVANCED_SETTINGS_STORAGE_KEY = "screenlauncher-advanced-settings-enabled";
const BUILD_CARD_BACKGROUNDS_STORAGE_KEY = "screenlauncher-build-card-backgrounds";
const SELECTED_INSTANCE_STORAGE_KEY = "screenlauncher-selected-instance-id";
const CREATE_BUILD_CARD_DRAFT_KEY = "__create__";
const LOG_WINDOW_STORAGE_PREFIX = "screenlauncher-log-window";
const LOG_WINDOW_REFRESH_EVENT = "launch-log-window-refresh";

function instanceLastPlayedTimestamp(instance: InstanceItem) {
  const parsed = Number.parseInt(instance.lastPlayed ?? "0", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pickPreferredInstance(instances: InstanceItem[], preferredId?: string | null) {
  if (instances.length === 0) return null;
  if (preferredId) {
    const preferred = instances.find((instance) => instance.id === preferredId);
    if (preferred) return preferred;
  }

  const played = [...instances]
    .filter((instance) => instanceLastPlayedTimestamp(instance) > 0)
    .sort((a, b) => instanceLastPlayedTimestamp(b) - instanceLastPlayedTimestamp(a));

  if (played[0]) return played[0];
  return instances[instances.length - 1] ?? instances[0] ?? null;
}

function ExportedItemIcon({
  src,
  title,
  source,
}: {
  src?: string | null;
  title: string;
  source: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const fallbackLabel =
    source === "modrinth"
      ? "M"
      : source.trim().slice(0, 1).toUpperCase() || title.trim().slice(0, 1).toUpperCase() || "?";

  if (src && !imageFailed) {
    return (
      <img
        className="eximp-list-preview-icon"
        src={src}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setImageFailed(true)}
      />
    );
  }

  return <span className="eximp-list-preview-icon-fallback">{fallbackLabel}</span>;
}

function readLogWindowRoute() {
  const params = new URLSearchParams(window.location.search);
  const instanceId = params.get("logWindow");
  const payloadKey = params.get("payloadKey");

  if (!instanceId || !payloadKey) return null;
  return { instanceId, payloadKey };
}

function makeLogWindowLabel(instanceId: string) {
  const safeId = instanceId.replace(/[^a-zA-Z0-9-/:_]/g, "_");
  return `build-log-${safeId}`;
}

function makeLogPayloadKey(instanceId: string) {
  const safeId = instanceId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${LOG_WINDOW_STORAGE_PREFIX}-${safeId}-${Date.now()}`;
}

function makeLogWindowUrl(instanceId: string, payloadKey: string) {
  return `/?logWindow=${encodeURIComponent(instanceId)}&payloadKey=${encodeURIComponent(payloadKey)}`;
}

function makeLogWindowInstance(instanceId: string, instanceName: string): InstanceItem {
  return {
    id: instanceId,
    name: instanceName || "Build logs",
    version: "",
    loader: "",
    status: "READY",
    ram: 0,
    javaArgs: null,
    javaPath: null,
    windowWidth: null,
    windowHeight: null,
    fullscreen: false,
    lastPlayed: "0",
    playtimeSecs: 0,
    createdAt: "0",
    gameDir: "",
  };
}

type StoredLogWindowPayload = {
  instanceId: string;
  initialLog?: LaunchLogSnapshot | MinecraftExitPayload | null;
};

function readStoredLogPayload(payloadKey: string): StoredLogWindowPayload | null {
  const raw = window.localStorage.getItem(payloadKey);
  if (!raw) return null;
  window.localStorage.removeItem(payloadKey);

  try {
    return JSON.parse(raw) as StoredLogWindowPayload;
  } catch {
    return null;
  }
}

function BuildLogsWindowApp({
  instanceId,
  payloadKey,
}: {
  instanceId: string;
  payloadKey: string;
}) {
  useTheme();
  const [instance, setInstance] = useState<InstanceItem | null>(null);
  const [initialLog, setInitialLog] = useState<LaunchLogSnapshot | MinecraftExitPayload | null>(null);

  useEffect(() => {
    const windowHandle = getCurrentWindow();
    let alive = true;

    const loadPayload = async (nextPayloadKey: string) => {
      const stored = readStoredLogPayload(nextPayloadKey);
      const resolvedInstanceId = stored?.instanceId || instanceId;

      if (stored?.initialLog) {
        if (!alive) return;
        setInitialLog(stored.initialLog);
        setInstance(makeLogWindowInstance(
          stored.initialLog.instanceId,
          stored.initialLog.instanceName,
        ));
        return;
      }

      try {
        const latest = await invoke<LaunchLogSnapshot>("read_instance_launch_log", {
          instanceId: resolvedInstanceId,
        });
        if (!alive) return;
        setInitialLog(latest);
        setInstance(makeLogWindowInstance(latest.instanceId, latest.instanceName));
      } catch (err) {
        if (!alive) return;
        setInitialLog({
          instanceId: resolvedInstanceId,
          instanceName: "Build logs",
          logPath: null,
          minecraftLogPath: null,
          crashReportPath: null,
          logTail: String(err),
          crashReportTail: null,
          hint: null,
        });
        setInstance(makeLogWindowInstance(resolvedInstanceId, "Build logs"));
      }
    };

    void loadPayload(payloadKey);
    const unlisten = windowHandle.listen<{ payloadKey: string }>(
      LOG_WINDOW_REFRESH_EVENT,
      (event) => {
        void loadPayload(event.payload.payloadKey);
      },
    );

    return () => {
      alive = false;
      void unlisten.then((dispose) => dispose());
    };
  }, [instanceId, payloadKey]);

  if (!instance) {
    return (
      <div className="build-logs-window-root">
        <div className="build-logs-modal build-logs-modal--standalone">
          <div className="build-logs-empty">LOADING LOGS...</div>
        </div>
      </div>
    );
  }

  return (
    <BuildLogsModal
      instance={instance}
      initialLog={initialLog}
      standalone
      onClose={() => {
        void getCurrentWindow().close();
      }}
    />
  );
}

export default function App() {
  const logWindowRoute = readLogWindowRoute();
  if (logWindowRoute) {
    return <BuildLogsWindowApp {...logWindowRoute} />;
  }

  const [phase, setPhase] = useState("init");
  const [isClosing, setIsClosing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [tabAnimating, setTabAnimating] = useState(false);

  const [manifest, setManifest] = useState<MinecraftManifest | null>(null);
  const [, setManifestLoading] = useState(true);

  const [instances, setInstances] = useState<InstanceItem[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState("");

  const [wheelTabSwitching, setWheelTabSwitching] = useState(true);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [showPreReleases, setShowPreReleases] = useState(false);

  const [systemRamGb, setSystemRamGb] = useState(8);
  const [launcherSettings, setLauncherSettings] = useState<LauncherSettings | null>(null);
  const [createRamGb, setCreateRamGb] = useState(4);
  const [settingsRamDraft, setSettingsRamDraft] = useState(4);
  const [createRuntimeSettings, setCreateRuntimeSettings] = useState<Omit<BuildRuntimeSettingsDraft, "ram">>({
    javaArgs: "",
    javaPath: "",
    windowWidth: DEFAULT_WINDOW_WIDTH,
    windowHeight: DEFAULT_WINDOW_HEIGHT,
    fullscreen: false,
  });
  const [createRuntimeSettingsTouched, setCreateRuntimeSettingsTouched] = useState(false);

  const [createMode, setCreateMode] = useState(false);
  const [createBuildName, setCreateBuildName] = useState("");
  const [createVersion, setCreateVersion] = useState("");
  const [createLoader, setCreateLoader] = useState<LoaderType>("Vanilla");
  const [loaderVersions, setLoaderVersions] = useState<string[]>([]);
  const [loaderVersionsLoading, setLoaderVersionsLoading] = useState(false);
  const [createLoaderVersion, setCreateLoaderVersion] = useState("");
  const [createError, setCreateError] = useState("");

  const [busyMessage, setBusyMessage] = useState("");
  const [actionError, setActionError] = useState("");
  // Drag-and-drop overlay state: "build" → whole-launcher drop hint,
  // "content" → per-card hint on the build under the cursor.
  const [dragKind, setDragKind] = useState<null | "build" | "content">(null);
  const [dragOverInstanceId, setDragOverInstanceId] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const [nickname, setNickname] = useState("PLAYER");
  const [accountType, setAccountType] = useState("OFFLINE");
  const [msAccounts, setMsAccounts] = useState<MicrosoftAccount[]>([]);
  const [activeMsAccountId, setActiveMsAccountId] = useState<string | null>(null);
  const [showMsModal, setShowMsModal] = useState(false);

  // mod / pack / shader state lives in their hooks — wired up after selectedModTarget/selectedShaderTarget are derived

  const [installProgress, setInstallProgress] = useState<InstallProgressPayload | null>(null);
  const [statsInstanceId, setStatsInstanceId] = useState<string | null>(null);
  const [screenshotsInstanceId, setScreenshotsInstanceId] = useState<string | null>(null);

  const [runningInstances, setRunningInstances] = useState<Map<string, number>>(new Map());
  // helpers
  const isRunning = (id: string) => runningInstances.has(id);
  const addRunning = (id: string, pid: number) => {
    launchTimestampsRef.current.set(id, Math.floor(Date.now() / 1000));
    setRunningInstances((prev) => new Map(prev).set(id, pid));
  };
  const removeRunning = (id: string) =>
    setRunningInstances((prev) => { const m = new Map(prev); m.delete(id); return m; });
  const applyDiscordRpcPresence = (
    settings = launcherSettings,
    activeRunning = runningInstances,
  ) => {
    const discordRpc = settings?.plugins.discordRpc;
    if (!discordRpc?.enabled || !discordRpc.applicationId.trim()) {
      void invoke("stop_discord_rpc_for_instance", { instanceId: null }).catch((error) => {
        console.error("stop_discord_rpc_for_instance failed", error);
      });
      return;
    }

    const rpcTargetId =
      (selectedInstanceId && activeRunning.has(selectedInstanceId)
        ? selectedInstanceId
        : Array.from(activeRunning.keys())[0]) ?? null;

    if (rpcTargetId && discordRpc.displayMode !== "launcher") {
      void invoke("start_discord_rpc_for_instance", {
        instanceId: rpcTargetId,
        accountType,
      }).catch((error) => {
        console.error("start_discord_rpc_for_instance failed", error);
      });
      return;
    }

    if (discordRpc.displayMode !== "minecraft") {
      void invoke("start_discord_rpc_for_launcher", {
        accountType,
      }).catch((error) => {
        console.error("start_discord_rpc_for_launcher failed", error);
      });
      return;
    }

    void invoke("stop_discord_rpc_for_instance", { instanceId: null }).catch((error) => {
      console.error("stop_discord_rpc_for_instance failed", error);
    });
  };
  const handleInstanceStopped = async (id: string) => {
    const launchTs = launchTimestampsRef.current.get(id);
    launchTimestampsRef.current.delete(id);
    removeRunning(id);
    try {
      await invoke("stop_discord_rpc_for_instance", { instanceId: id });
    } catch (err) {
      console.error("stop_discord_rpc_for_instance failed", err);
    }
    if (launchTs !== undefined) {
      const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - launchTs);
      try {
        await invoke("record_playtime", { instanceId: id, elapsedSecs: elapsed });
        await refreshInstances(id);
      } catch (err) { console.error("record_playtime failed", err); }
    }
  };

  const openBuildLogs = async (
    id: string,
    initialSnapshot: LaunchLogSnapshot | MinecraftExitPayload | null = null,
  ) => {
    try {
      const payloadKey = makeLogPayloadKey(id);
      window.localStorage.setItem(
        payloadKey,
        JSON.stringify({ instanceId: id, initialLog: initialSnapshot } satisfies StoredLogWindowPayload),
      );

      const label = makeLogWindowLabel(id);
      const existing = await WebviewWindow.getByLabel(label);

      if (existing) {
        await existing.emit(LOG_WINDOW_REFRESH_EVENT, { payloadKey });
        await existing.setFocus();
        return;
      }

      const instanceName =
        initialSnapshot?.instanceName ||
        instances.find((instance) => instance.id === id)?.name ||
        "Build logs";

      const logWindow = new WebviewWindow(label, {
        url: makeLogWindowUrl(id, payloadKey),
        title: `${instanceName} logs`,
        width: 1040,
        height: 740,
        minWidth: 720,
        minHeight: 480,
        center: true,
        focus: true,
        resizable: true,
        decorations: false,
      });

      void logWindow.once("tauri://created", () => {
        void logWindow.setFocus();
      });
      void logWindow.once("tauri://error", (event) => {
        console.error("log window create failed", event.payload);
        setActionError(`Log window failed: ${String(event.payload)}`);
      });
    } catch (error) {
      console.error("open build logs failed", error);
      setActionError(`Log window failed: ${String(error)}`);
    }
  };

  const [confirmPendingId, setConfirmPendingId] = useState<string | null>(null);
  const [confirmPendingName, setConfirmPendingName] = useState("");

  // Export modal
  const [exportInstanceId, setExportInstanceId] = useState<string | null>(null);
  const [exportData, setExportData] = useState<InstanceExportData | null>(null);
  const [exportOptions, setExportOptions] = useState({
    name: true,
    ram: true,
    javaArgs: true,
    javaPath: true,
    window: true,
    mods: true,
    shaders: true,
    resourcePacks: true,
  });
  const [exportWorking, setExportWorking] = useState(false);
  const [exportError, setExportError] = useState("");

  // Alt+hover list preview (shared between export/import)
  const altHoverRef = useRef<{ items: ExportedItem[]; label: string; el: HTMLElement } | null>(null);
  const [listPreview, setListPreview] = useState<{ items: ExportedItem[]; label: string; rect: DOMRect } | null>(null);
  const [modrinthProjectIcons, setModrinthProjectIcons] = useState<Record<string, string | null>>({});
  const requestedModrinthProjectIconIdsRef = useRef<Set<string>>(new Set());

  // Import modal
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importData, setImportData] = useState<InstanceExportData | null>(null);
  const [importOptions, setImportOptions] = useState({
    name: true,
    ram: true,
    javaArgs: true,
    javaPath: true,
    window: true,
    mods: true,
    shaders: true,
    resourcePacks: true,
  });
  const [importCustomName, setImportCustomName] = useState("");
  const [importWorking, setImportWorking] = useState(false);
  const [importError, setImportError] = useState("");
  const [importSourcePath, setImportSourcePath] = useState("");
  const [importSourceFormat, setImportSourceFormat] = useState<"slbuild" | "mrpack">("slbuild");

  const [openDropdown, setOpenDropdown] = useState<DropdownKey>(null);

  const [advancedSettingsEnabled, setAdvancedSettingsEnabled] = useState(false);
  const [buildCardAppearances, setBuildCardAppearances] = useState<Record<string, BuildCardAppearance>>({});
  const [buildSettingsTargetId, setBuildSettingsTargetId] = useState<string | null>(null);
  const [buildCardSettingsOpen, setBuildCardSettingsOpen] = useState(false);
  const [buildCardSettingsDraft, setBuildCardSettingsDraft] = useState<BuildCardAppearance>({ ...DEFAULT_BUILD_CARD_APPEARANCE });
  const [buildRuntimeSettingsDraft, setBuildRuntimeSettingsDraft] = useState<BuildRuntimeSettingsDraft>(
    () => getDefaultRuntimeSettingsDraft(4, 8, true),
  );
  const [buildCardPreviewSize, setBuildCardPreviewSize] = useState<BuildCardPreviewSize | null>(null);


  const { theme, setTheme } = useTheme();
  const { toasts, pushToast, dismissToast } = useToasts();
  const win = getCurrentWindow();
  const wheelLockRef = useRef(false);
  const instanceCardRefs = useRef(new Map<string, HTMLButtonElement>());
  const launchTimestampsRef = useRef<Map<string, number>>(new Map());
  const dragEventRef = useRef<(payload: any) => void>(() => {});
  const intentionalStopsRef = useRef<Set<string>>(new Set());
  const createCardMeasureRef = useRef<HTMLDivElement | null>(null);

  const persistBuildCardAppearances = (next: Record<string, BuildCardAppearance>) => {
    setBuildCardAppearances(next);
    window.localStorage.setItem(BUILD_CARD_BACKGROUNDS_STORAGE_KEY, JSON.stringify(next));
  };

  const getBuildCardAppearance = (targetId: string | null | undefined) => {
    if (!targetId) return { ...DEFAULT_BUILD_CARD_APPEARANCE };
    return normalizeBuildCardAppearance(buildCardAppearances[targetId]);
  };

  const optimizedJavaArgsEnabled = launcherSettings?.optimizedJavaArgs ?? true;

  const getInstanceRuntimeSettingsDraft = (
    instance: InstanceItem,
  ): BuildRuntimeSettingsDraft => {
    const ram = clampRamToSystem(instance.ram, systemRamGb);

    return normalizeRuntimeSettingsDraft(
      {
        ram,
        javaArgs:
          typeof instance.javaArgs === "string"
            ? instance.javaArgs
            : getDefaultJavaArgsText(ram, optimizedJavaArgsEnabled),
        javaPath: instance.javaPath ?? "",
        windowWidth: instance.windowWidth ?? DEFAULT_WINDOW_WIDTH,
        windowHeight: instance.windowHeight ?? DEFAULT_WINDOW_HEIGHT,
        fullscreen: instance.fullscreen ?? false,
      },
      systemRamGb,
    );
  };

  const getCreateRuntimeSettingsDraft = (): BuildRuntimeSettingsDraft => {
    const ram = clampRamToSystem(createRamGb, systemRamGb);

    if (createRuntimeSettingsTouched) {
      return normalizeRuntimeSettingsDraft(
        {
          ram,
          ...createRuntimeSettings,
        },
        systemRamGb,
      );
    }

    return getDefaultRuntimeSettingsDraft(ram, systemRamGb, optimizedJavaArgsEnabled);
  };

  const getResetRuntimeSettingsDraft = (): BuildRuntimeSettingsDraft => {
    const defaultRam = clampRamToSystem(
      launcherSettings?.defaultRamGb ?? createRamGb,
      systemRamGb,
    );
    return getDefaultRuntimeSettingsDraft(defaultRam, systemRamGb, optimizedJavaArgsEnabled);
  };

  const pickBuildCardPreviewSourceElement = (targetId: string | null | undefined) => {
    const fallbackId = selectedInstanceId || pickPreferredInstance(instances)?.id || null;
    const resolvedId = targetId ?? fallbackId;

    if (resolvedId) {
      const instanceCard = instanceCardRefs.current.get(resolvedId);
      if (instanceCard) return instanceCard;
    }

    return createCardMeasureRef.current;
  };

  const measureBuildCardPreviewElement = (
    element: Element | null,
  ): BuildCardPreviewSize | null => {
    if (!(element instanceof HTMLElement)) return null;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  };

  const openBuildCardSettings = (targetId?: string | null) => {
    const resolvedTargetId =
      targetId === undefined ? (selectedInstance?.id ?? null) : targetId;
    const targetInstance =
      resolvedTargetId
        ? instances.find((instance) => instance.id === resolvedTargetId) || null
        : null;
    setBuildSettingsTargetId(resolvedTargetId);
    setBuildCardSettingsDraft(
      getBuildCardAppearance(resolvedTargetId ?? CREATE_BUILD_CARD_DRAFT_KEY)
    );
    setBuildRuntimeSettingsDraft(
      targetInstance ? getInstanceRuntimeSettingsDraft(targetInstance) : getCreateRuntimeSettingsDraft()
    );
    setBuildCardSettingsOpen(true);
    setBuildCardPreviewSize(
      measureBuildCardPreviewElement(pickBuildCardPreviewSourceElement(resolvedTargetId))
    );
  };

  const closeBuildCardSettings = () => {
    setBuildCardSettingsOpen(false);
    setBuildSettingsTargetId(null);
    setBuildCardSettingsDraft({ ...DEFAULT_BUILD_CARD_APPEARANCE });
    setBuildRuntimeSettingsDraft(getDefaultRuntimeSettingsDraft(4, systemRamGb, optimizedJavaArgsEnabled));
    setBuildCardPreviewSize(null);
  };

  const saveBuildCardSettings = async () => {
    const storageKey = buildSettingsTargetId ?? CREATE_BUILD_CARD_DRAFT_KEY;
    const next = {
      ...buildCardAppearances,
      [storageKey]: normalizeBuildCardAppearance(buildCardSettingsDraft),
    };

    try {
      const normalizedRuntime = normalizeRuntimeSettingsDraft(
        buildRuntimeSettingsDraft,
        systemRamGb,
      );

      if (buildSettingsTargetId) {
        const target = instances.find((instance) => instance.id === buildSettingsTargetId);
        if (!target) {
          throw new Error("Instance not found");
        }

        const updated = await invoke<InstanceItem>("update_instance", {
          payload: {
            id: target.id,
            name: target.name,
            version: target.version,
            loader: target.loader,
            loaderVersion: target.loaderVersion ?? null,
            ram: normalizedRuntime.ram,
            javaArgs: normalizedRuntime.javaArgs,
            javaPath: normalizedRuntime.javaPath || null,
            windowWidth: normalizedRuntime.windowWidth,
            windowHeight: normalizedRuntime.windowHeight,
            fullscreen: normalizedRuntime.fullscreen,
          } satisfies UpdateInstancePayload,
        });

        setInstances((prev) =>
          prev.map((instance) => (instance.id === updated.id ? updated : instance)),
        );
        setSelectedInstanceId(updated.id);
      } else {
        setCreateRamGb(normalizedRuntime.ram);
        setCreateRuntimeSettings({
          javaArgs: normalizedRuntime.javaArgs,
          javaPath: normalizedRuntime.javaPath,
          windowWidth: normalizedRuntime.windowWidth,
          windowHeight: normalizedRuntime.windowHeight,
          fullscreen: normalizedRuntime.fullscreen,
        });
        setCreateRuntimeSettingsTouched(true);
      }

      persistBuildCardAppearances(next);
      closeBuildCardSettings();
    } catch (error) {
      console.error(error);
      setActionError(String(error));
    }
  };

  const clearBuildCardSettings = () => {
    const storageKey = buildSettingsTargetId ?? CREATE_BUILD_CARD_DRAFT_KEY;
    const next = { ...buildCardAppearances };
    delete next[storageKey];
    persistBuildCardAppearances(next);
    setBuildCardSettingsDraft({ ...DEFAULT_BUILD_CARD_APPEARANCE });
  };

  const resetBuildRuntimeSettings = () => {
    setBuildRuntimeSettingsDraft(getResetRuntimeSettingsDraft());
  };

  const handleBuildCardImagePicked = (file: File | null) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setBuildCardSettingsDraft((prev) => ({
          ...prev,
          image: reader.result as string,
        }));
      }
    };
    reader.readAsDataURL(file);
  };


  useWindowPhase(win as unknown as WebviewWindow, setPhase);

  useEffect(() => {
    if (selectedInstanceId) {
      window.localStorage.setItem(SELECTED_INSTANCE_STORAGE_KEY, selectedInstanceId);
    } else {
      window.localStorage.removeItem(SELECTED_INSTANCE_STORAGE_KEY);
    }
  }, [selectedInstanceId]);

  const selectedInstance = useMemo(
    () => instances.find((x) => x.id === selectedInstanceId) || null,
    [instances, selectedInstanceId]
  );

  const buildSettingsTargetInstance =
    buildSettingsTargetId
      ? instances.find((instance) => instance.id === buildSettingsTargetId) || null
      : null;
  const selectedBuildState =
    selectedInstance && isRunning(selectedInstance.id) ? "RUNNING" : "";
  const resolve = usePlaceholders(
    instances,
    selectedInstance,
    systemRamGb,
    accountType,
    selectedBuildState,
  );
  const resolveForTarget = (
    template: string,
    target: PlaceholderTarget,
    overrides: {
      accountType?: string;
      buildState?: string;
    } = {},
  ) =>
    resolvePlaceholders(
      template,
      buildPlaceholderContext({
        instances,
        target,
        systemRamGb,
        accountType: overrides.accountType ?? accountType,
        buildState: overrides.buildState ?? "",
      }),
    );

  const createPreviewName = createBuildName.trim() || "MY BUILD";
  const createPreviewVersion = createVersion || "1.21.1";
  const createPreviewLoader = createLoader || "Vanilla";
  const createPreviewRam = clampRamToSystem(createRamGb, systemRamGb);
  const createMeasureAppearance =
    buildCardSettingsOpen && !buildSettingsTargetId
      ? normalizeBuildCardAppearance(buildCardSettingsDraft)
      : getBuildCardAppearance(CREATE_BUILD_CARD_DRAFT_KEY);

  useEffect(() => {
    if (!buildCardSettingsOpen) {
      setBuildCardPreviewSize(null);
      return;
    }

    const sourceElement = pickBuildCardPreviewSourceElement(buildSettingsTargetId);
    if (!sourceElement) {
      setBuildCardPreviewSize(null);
      return;
    }

    const syncPreviewSize = () => {
      setBuildCardPreviewSize(measureBuildCardPreviewElement(sourceElement));
    };

    syncPreviewSize();

    const resizeObserver = new ResizeObserver(syncPreviewSize);
    resizeObserver.observe(sourceElement);

    return () => {
      resizeObserver.disconnect();
    };
  }, [
    buildCardSettingsOpen,
    buildSettingsTargetId,
    selectedInstanceId,
    instances.length,
    createPreviewName,
    createPreviewVersion,
    createPreviewLoader,
    createPreviewRam,
    buildCardSettingsDraft,
  ]);

  const moddedInstances = useMemo(
    () => instances.filter((item) => item.loader.toLowerCase() !== "vanilla"),
    [instances]
  );

  const buildCardPreviewTarget: PlaceholderTarget =
    buildSettingsTargetInstance
      ? {
          ...buildSettingsTargetInstance,
          ram: buildCardSettingsOpen ? buildRuntimeSettingsDraft.ram : buildSettingsTargetInstance.ram,
        }
      : {
      name: createPreviewName,
      version: createPreviewVersion,
      loader: createPreviewLoader,
      ram: buildCardSettingsOpen ? buildRuntimeSettingsDraft.ram : createPreviewRam,
      playtimeSecs: 0,
      lastPlayed: "0",
      status: "",
    };
  const buildCardPreviewBadgeText = resolveForTarget(
    getBuildCardBadgeText(buildCardSettingsDraft),
    buildCardPreviewTarget,
    { buildState: "RUNNING" },
  );
  const resolveBuildCardContentTags = (
    appearance: BuildCardAppearance,
    target: PlaceholderTarget,
    overrides: {
      accountType?: string;
      buildState?: string;
    } = {},
  ) =>
    appearance.contentTags.map((tag) => ({
      ...tag,
      text: resolveForTarget(tag.text, target, overrides),
    }));

  const selectedModTarget = useMemo(
    () => moddedInstances.find((item) => item.id === selectedInstanceId) || moddedInstances[0] || null,
    [moddedInstances, selectedInstanceId]
  );

  const selectedShaderTarget = useMemo(
    () => instances.find((item) => item.id === selectedInstanceId) || null,
    [instances, selectedInstanceId]
  );

  const {
    modSearch, setModSearch,
    modrinthItems, modrinthTotalHits, modrinthLoading, modrinthLoadingMore, modrinthError,
    modrinthInstallBusyId,
    installedMods, installedModsLoading,
    handleLoadMoreMods, handleInstallMod, handleUninstallMod,
  } = useModActions({ activeTab, selectedModTarget, setActionError, setBusyMessage, pushToast });

  const {
    packSearch, setPackSearch,
    packItems, packTotalHits, packLoading, packLoadingMore, packError,
    packInstallBusyId,
    installedPacks, installedPacksLoading,
    handleLoadMorePacks, handleInstallPack, handleUninstallPack,
  } = usePackActions({ activeTab, selectedInstance, setActionError, setBusyMessage, pushToast });

  const {
    shaderSearch, setShaderSearch,
    shaderItems, shaderTotalHits, shaderLoading, shaderLoadingMore, shaderError,
    shaderInstallBusyId,
    installedShaders, installedShadersLoading,
    handleLoadMoreShaders, handleInstallShader, handleUninstallShader,
  } = useShaderActions({ activeTab, selectedShaderTarget, setActionError, setBusyMessage, pushToast });

  const availableManifestVersions = useMemo(() => {
    if (!manifest) return [];

    return manifest.versions
      .filter((item) => {
        const idLower = item.id.toLowerCase();
        const isPreRelease = idLower.includes("-pre") || idLower.includes(" rc");
        const isRc = idLower.includes("rc");
        const isSnapshot = item.type === "snapshot" && !isPreRelease && !isRc;

        if (item.type === "release") return true;
        if ((isPreRelease || isRc) && !showPreReleases) return false;
        if (isSnapshot && !showSnapshots) return false;
        if ((isPreRelease || isRc) && showPreReleases) return true;
        if (isSnapshot && showSnapshots) return true;

        return false;
      })
      .sort((a, b) => new Date(b.releaseTime).getTime() - new Date(a.releaseTime).getTime());
  }, [manifest, showSnapshots, showPreReleases]);

  const minecraftVersions = useMemo(
    () => availableManifestVersions.map((v) => v.id),
    [availableManifestVersions]
  );

  useEffect(() => {
    const unlistenProgress = win.listen<InstallProgressPayload>("install-progress", (e) => {
      setInstallProgress(e.payload);
      setBusyMessage(`${e.payload.phase.toUpperCase()} — ${e.payload.detail}`);
    });

    return () => {
      void unlistenProgress.then((f) => f());
    };
  }, [win]);

  useEffect(() => {
    const unlistenExit = win.listen<MinecraftExitPayload>("minecraft-process-exited", (event) => {
      const payload = event.payload;
      const stopKey = `${payload.instanceId}:${payload.pid}`;
      const stoppedByUser =
        intentionalStopsRef.current.delete(stopKey) ||
        intentionalStopsRef.current.delete(payload.instanceId);

      void handleInstanceStopped(payload.instanceId);

      if (payload.crashed && !stoppedByUser) {
        setActionError(payload.hint || payload.reason);
        pushToast("error", payload.hint || payload.reason, {
          title: `${payload.instanceName || "Build"} crashed`,
        });
        void openBuildLogs(payload.instanceId, payload);
      }
    });

    return () => {
      void unlistenExit.then((f) => f());
    };
  }, [win]);

  useEffect(() => {
    const closeMenus = () => setOpenDropdown(null);
    window.addEventListener("click", closeMenus);
    return () => window.removeEventListener("click", closeMenus);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Alt" && altHoverRef.current) {
        const { items, label, el } = altHoverRef.current;
        if (items.length > 0) {
          setListPreview({ items, label, rect: el.getBoundingClientRect() });
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Alt") setListPreview(null);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const requestModrinthProjectIcons = async (items: ExportedItem[]) => {
    const projectIds = Array.from(
      new Set(
        items
          .filter((item) => item.source === "modrinth" && !!item.projectId && !item.iconUrl)
          .map((item) => item.projectId as string)
          .filter((projectId) => {
            if (projectId in modrinthProjectIcons) return false;
            if (requestedModrinthProjectIconIdsRef.current.has(projectId)) return false;
            return true;
          }),
      ),
    );

    if (projectIds.length === 0) return;

    for (const projectId of projectIds) {
      requestedModrinthProjectIconIdsRef.current.add(projectId);
    }

    try {
      const result = await invoke<Record<string, string | null>>("get_modrinth_project_icons", {
        projectIds,
      });
      setModrinthProjectIcons((prev) => ({ ...prev, ...result }));
    } catch (error) {
      console.error("get_modrinth_project_icons failed", error);
      setModrinthProjectIcons((prev) => {
        const next = { ...prev };
        for (const projectId of projectIds) {
          if (!(projectId in next)) next[projectId] = null;
        }
        return next;
      });
    }
  };

  useEffect(() => {
    if (!listPreview) return;
    void requestModrinthProjectIcons(listPreview.items);
  }, [listPreview]);

  useEffect(() => {
    try {
      const advancedRaw = window.localStorage.getItem(ADVANCED_SETTINGS_STORAGE_KEY);
      setAdvancedSettingsEnabled(advancedRaw === "true");

      const backgroundsRaw = window.localStorage.getItem(BUILD_CARD_BACKGROUNDS_STORAGE_KEY);
      if (backgroundsRaw) {
        const parsed = JSON.parse(backgroundsRaw) as Record<string, unknown>;
        const normalized = Object.fromEntries(
          Object.entries(parsed).map(([key, value]) => [key, normalizeBuildCardAppearance(value)]),
        ) as Record<string, BuildCardAppearance>;
        setBuildCardAppearances(normalized);
      }
    } catch (error) {
      console.error(error);
    }
  }, []);

  const getExportedItemIconUrl = (item: ExportedItem) => {
    if (item.iconUrl) return item.iconUrl;
    if (item.source !== "modrinth" || !item.projectId) return null;
    return modrinthProjectIcons[item.projectId] ?? null;
  };

  const hasJavaArgsData = (data: Pick<InstanceExportData, "javaArgs"> | null | undefined) =>
    Boolean(data?.javaArgs);

  const hasJavaPathData = (data: Pick<InstanceExportData, "javaPath"> | null | undefined) =>
    Boolean(data?.javaPath);

  const hasWindowSettingsData = (data: Pick<
    InstanceExportData,
    "windowWidth" | "windowHeight" | "fullscreen"
  > | null | undefined) =>
    Boolean(data && (data.windowWidth || data.windowHeight || data.fullscreen));

  const formatJavaArgsMeta = (data: Pick<InstanceExportData, "javaArgs"> | null | undefined) => {
    if (!data?.javaArgs) return undefined;
    const count = data.javaArgs.split(/\r?\n/).filter((line) => line.trim()).length;
    return `${count} ARG${count === 1 ? "" : "S"}`;
  };

  const formatWindowSettingsMeta = (data: Pick<
    InstanceExportData,
    "windowWidth" | "windowHeight" | "fullscreen"
  > | null | undefined) => {
    if (!data || !hasWindowSettingsData(data)) return undefined;
    const size = `${data.windowWidth ?? DEFAULT_WINDOW_WIDTH}x${data.windowHeight ?? DEFAULT_WINDOW_HEIGHT}`;
    return data.fullscreen ? `${size} / FULLSCREEN` : size;
  };

  useEffect(() => {
    const bootstrap = async () => {
      try {
        setManifestLoading(true);
        const [manifestResponse, instanceResponse, systemRamResponse, settingsResponse, msAccountsResponse] =
          await Promise.all([
            invoke<MinecraftManifest>("get_minecraft_manifest"),
            invoke<InstanceItem[]>("list_instances"),
            invoke<number>("get_system_memory_gb"),
            invoke<LauncherSettings>("get_launcher_settings"),
            invoke<MicrosoftAccount[]>("list_microsoft_accounts"),
          ]);

        setManifest(manifestResponse);
        setInstances(instanceResponse);
        setSystemRamGb(systemRamResponse);
        setLauncherSettings(settingsResponse);
        setMsAccounts(msAccountsResponse);
        if (msAccountsResponse.length > 0) {
          setActiveMsAccountId(msAccountsResponse[0].id);
        }
        setSettingsRamDraft(clampRamToSystem(settingsResponse.defaultRamGb, systemRamResponse));

        const preferredVersion =
          manifestResponse.versions.find((v) => v.type === "release")?.id ||
          manifestResponse.latest.release ||
          "";

        setCreateVersion(preferredVersion);

        if (instanceResponse.length > 0) {
          const storedInstanceId = window.localStorage.getItem(SELECTED_INSTANCE_STORAGE_KEY);
          const preferredInstance =
            pickPreferredInstance(instanceResponse, storedInstanceId) || instanceResponse[0];
          setSelectedInstanceId(preferredInstance.id);
        }

        setCreateRamGb(clampRamToSystem(settingsResponse.defaultRamGb, systemRamResponse));
      } catch (error) {
        console.error(error);
      } finally {
        setManifestLoading(false);
      }
    };

    void bootstrap();
  }, []);

  useEffect(() => {
    const onClose = () => setOpenDropdown(null);
    window.addEventListener("keydown", onClose);
    return () => window.removeEventListener("keydown", onClose);
  }, []);

  useEffect(() => {
    const syncLoaderVersions = async () => {
      if (createLoader === "Vanilla" || !createVersion) {
        setLoaderVersions([]);
        setCreateLoaderVersion("");
        return;
      }

      try {
        setLoaderVersionsLoading(true);
        setCreateError("");
        const versions = await invoke<string[]>("get_loader_versions", {
          loader: createLoader,
          mcVersion: createVersion,
        });

        setLoaderVersions(versions);
        if (versions.length === 0) {
          setCreateError("No compatible " + createLoader + " versions for Minecraft " + createVersion);
        }
        setCreateLoaderVersion((current) => {
          if (current && versions.includes(current)) return current;
          return versions[0] || "";
        });
      } catch (error) {
        console.error(error);
        setLoaderVersions([]);
        setCreateLoaderVersion("");
        setCreateError(String(error));
      } finally {
        setLoaderVersionsLoading(false);
      }
    };

    void syncLoaderVersions();
  }, [createLoader, createVersion]);

  // Polling: каждые 3 сек проверяем живы ли запущенные процессы
  useEffect(() => {
    if (runningInstances.size === 0) return;
    const interval = window.setInterval(async () => {
      for (const [id, pid] of runningInstances) {
        try {
          const alive = await invoke<boolean>("is_process_alive", { pid });
          if (!alive) void handleInstanceStopped(id);
        } catch {
          void handleInstanceStopped(id);
        }
      }
    }, 3000);
    return () => window.clearInterval(interval);
  }, [runningInstances]);

  useEffect(() => {
    if (!launcherSettings) return;
    applyDiscordRpcPresence(launcherSettings, runningInstances);
  }, [launcherSettings, runningInstances, selectedInstanceId, accountType]);

  const tearPath = useMemo(() => {
    let points = "50% 0%";
    const segments = 25;
    for (let i = 1; i < segments; i += 1) {
      const y = (i / segments) * 100;
      const x = 50 + (Math.random() * 6 - 3);
      points += `, ${x}% ${y}%`;
    }
    points += ", 50% 100%";
    return points;
  }, []);

  const refreshInstances = async (preferredId?: string) => {
    const fresh = await invoke<InstanceItem[]>("list_instances");
    setInstances(fresh);

    if (fresh.length === 0) {
      setSelectedInstanceId("");
      return;
    }

    const storedInstanceId = window.localStorage.getItem(SELECTED_INSTANCE_STORAGE_KEY);
    const preferredInstance = pickPreferredInstance(fresh, storedInstanceId) || fresh[0];
    const target = (preferredId && fresh.find((i) => i.id === preferredId)?.id) || preferredInstance.id;
    setSelectedInstanceId(target);
  };

  const handleClose = async () => {
    setIsClosing(true);
    void invoke("stop_discord_rpc_for_instance", { instanceId: null }).catch((error) => {
      console.error("stop_discord_rpc_for_instance failed", error);
    });
    window.setTimeout(() => {
      void win.close();
    }, 400);
  };

  const handleMaximize = async () => {
    const isMax = await win.isMaximized();
    if (isMax) {
      await win.unmaximize();
      return;
    }
    await win.maximize();
  };

  const setTabAnimated = (nextTab: TabKey) => {
    if (nextTab === activeTab) return;
    setTabAnimating(true);
    setOpenDropdown(null);
    setActiveTab(nextTab);
    window.setTimeout(() => setTabAnimating(false), 360);
  };

  const switchTabByWheel = (direction: "next" | "prev") => {
    if (!wheelTabSwitching || wheelLockRef.current) return;

    const currentIndex = TAB_ORDER.indexOf(activeTab);
    const nextIndex =
      direction === "next"
        ? Math.min(currentIndex + 1, TAB_ORDER.length - 1)
        : Math.max(currentIndex - 1, 0);

    if (nextIndex === currentIndex) return;

    wheelLockRef.current = true;
    setTabAnimated(TAB_ORDER[nextIndex]);

    window.setTimeout(() => {
      wheelLockRef.current = false;
    }, 520);
  };

const isScrollableElement = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  
  // Ищем ближайшего родителя, который может скроллиться
  // Мы добавили сюда .installed-mods-list
  const scrollParent = target.closest(".csa-content, .installed-mods-list, .mod-list");
  
  if (!(scrollParent instanceof HTMLElement)) return false;
  
  // Проверяем, действительно ли контента внутри больше, чем высота контейнера
  return scrollParent.scrollHeight > scrollParent.clientHeight;
};

  const onWheelTabs = (e: React.WheelEvent) => {
    if (!wheelTabSwitching) return;
    if (openDropdown) return;
    if (Math.abs(e.deltaY) < 10) return;
    if (isScrollableElement(e.target)) return;
    if (e.deltaY > 0) switchTabByWheel("next");
    else switchTabByWheel("prev");
  };

  const saveSettingsRam = async () => {
    try {
      const value = clampRamToSystem(settingsRamDraft, systemRamGb);
      const updated = await invoke<LauncherSettings>("set_default_ram_gb", { ram: value });
      const normalized = clampRamToSystem(updated.defaultRamGb, systemRamGb);
      setLauncherSettings(updated);
      setSettingsRamDraft(normalized);
      setCreateRamGb(normalized);
    } catch (error) {
      console.error(error);
      setActionError(String(error));
      pushToast("error", String(error), { title: "Couldn't save RAM" });
    }
  };

  const saveOptimizedJavaArgs = async (enabled: boolean) => {
    try {
      const updated = await invoke<LauncherSettings>("set_optimized_java_args", { enabled });
      setLauncherSettings(updated);
    } catch (error) {
      console.error(error);
      setActionError(String(error));
      pushToast("error", String(error), { title: "Couldn't save setting" });
    }
  };

  const saveNetworkSettings = async (mirror: string) => {
    try {
      const updated = await invoke<LauncherSettings>("set_network_settings", {
        mirror,
      });
      setLauncherSettings(updated);
    } catch (error) {
      console.error(error);
      setActionError(String(error));
      pushToast("error", String(error), { title: "Couldn't save network" });
      throw error;
    }
  };

  const saveLauncherPlugins = async (plugins: LauncherPluginsSettings) => {
    try {
      const updated = await invoke<LauncherSettings>("set_launcher_plugins", { plugins });
      setLauncherSettings(updated);
      // Drive Discord RPC immediately on every plugin change (enable/disable/edit),
      // so toggling the plugin reliably starts or stops the presence without
      // waiting for the settings effect to fire on the next render tick.
      applyDiscordRpcPresence(updated, runningInstances);
    } catch (error) {
      console.error(error);
      setActionError(String(error));
      pushToast("error", String(error), { title: "Couldn't save plugins" });
    }
  };

  const handleCreateBuild = async () => {
    try {
      setCreateError("");
      setActionError("");

      const cleanName = createBuildName.trim();
      if (!cleanName) {
        setCreateError("Введите название сборки");
        return;
      }

      if (!createVersion) {
        setCreateError("Выберите версию Minecraft");
        return;
      }

      if (createLoader !== "Vanilla" && !createLoaderVersion) {
        setCreateError("Выберите версию " + createLoader + " Loader");
        return;
      }

      setWorking(true);
      setBusyMessage("Creating build...");
      const createRuntime = createRuntimeSettingsTouched
        ? normalizeRuntimeSettingsDraft(
            {
              ram: createRamGb,
              ...createRuntimeSettings,
            },
            systemRamGb,
          )
        : getDefaultRuntimeSettingsDraft(
            createRamGb,
            systemRamGb,
            optimizedJavaArgsEnabled,
          );

      const created = await invoke<InstanceItem>("create_instance", {
        payload: {
          name: cleanName,
          version: createVersion,
          loader: createLoader,
          loaderVersion: createLoader !== "Vanilla" ? createLoaderVersion : null,
          ram: createRuntime.ram,
          javaArgs: createRuntimeSettingsTouched ? createRuntime.javaArgs : null,
          javaPath: createRuntimeSettingsTouched && createRuntime.javaPath ? createRuntime.javaPath : null,
          windowWidth: createRuntimeSettingsTouched ? createRuntime.windowWidth : null,
          windowHeight: createRuntimeSettingsTouched ? createRuntime.windowHeight : null,
          fullscreen: createRuntimeSettingsTouched ? createRuntime.fullscreen : false,
        } satisfies CreateInstancePayload,
      });

      const draftAppearance = getBuildCardAppearance(CREATE_BUILD_CARD_DRAFT_KEY);
      const nextAppearances = {
        ...buildCardAppearances,
        [created.id]: draftAppearance,
      };
      delete nextAppearances[CREATE_BUILD_CARD_DRAFT_KEY];
      persistBuildCardAppearances(nextAppearances);

      await refreshInstances(created.id);
      setCreateMode(false);
      setCreateBuildName("");
      setCreateLoader("Vanilla");
      setCreateLoaderVersion("");
      setCreateRamGb(clampRamToSystem(launcherSettings?.defaultRamGb ?? 4, systemRamGb));
      setCreateRuntimeSettings({
        javaArgs: "",
        javaPath: "",
        windowWidth: DEFAULT_WINDOW_WIDTH,
        windowHeight: DEFAULT_WINDOW_HEIGHT,
        fullscreen: false,
      });
      setCreateRuntimeSettingsTouched(false);
      setBusyMessage("Build created");
      pushToast("info", `Сборка ${cleanName} создана`, { title: "Build created" });
    } catch (error) {
      console.error(error);
      setCreateError(String(error));
      pushToast("error", String(error), { title: "Create failed" });
    } finally {
      setWorking(false);
    }
  };

  const handleInstallSelected = async () => {
    if (!selectedInstance) return;

    try {
      setWorking(true);
      setActionError("");
      setInstallProgress({
        phase: "prepare",
        current: 0,
        total: 1,
        percent: 0,
        detail: "Preparing install",
      });
      setBusyMessage("Installing Minecraft files...");

      await invoke<ActionResult>("install_instance", { instanceId: selectedInstance.id });
      await refreshInstances(selectedInstance.id);

      setInstallProgress({
        phase: "done",
        current: 1,
        total: 1,
        percent: 100,
        detail: "Install complete",
      });
      setBusyMessage("Install finished");
      pushToast("info", `Файлы ${selectedInstance.name} установлены`, { title: "Install complete" });
    } catch (error) {
      console.error(error);
      setActionError(String(error));
      pushToast("error", String(error), { title: "Install failed" });
    } finally {
      setWorking(false);
      window.setTimeout(() => {
        setInstallProgress(null);
        setBusyMessage("");
      }, 500);
    }
  };

  const handleLaunchSelected = async (instanceToLaunch?: InstanceItem) => {
    const target = instanceToLaunch ?? selectedInstance;
    if (!target) return;

    setSelectedInstanceId(target.id);

    try {
      setWorking(true);
      setActionError("");
      setInstallProgress({
        phase: "prepare",
        current: 0,
        total: 1,
        percent: 0,
        detail: "Preparing launch",
      });
      setBusyMessage("Installing/checking files and launching...");

      const result = await invoke<ActionResult>("launch_instance", {
        instanceId: target.id,
        nickname,
        msAccountId: accountType === "MICROSOFT" ? (activeMsAccountId ?? undefined) : undefined,
      });

      await refreshInstances(target.id);
      if (result.pid) {
        addRunning(target.id, result.pid);
      }

      setInstallProgress({
        phase: "done",
        current: 1,
        total: 1,
        percent: 100,
        detail: "Launch complete",
      });
      setBusyMessage("Minecraft launched");
      pushToast("info", `${target.name} запущена`, { title: "Minecraft launched" });
    } catch (error) {
      console.error(error);
      const message = String(error);
      setActionError(message);
      pushToast("error", message, { title: `${target.name} failed to start` });
      void openBuildLogs(target.id, {
        instanceId: target.id,
        instanceName: target.name,
        pid: 0,
        exitCode: null,
        runtimeSecs: 0,
        crashed: true,
        reason: "Minecraft did not start.",
        logPath: null,
        minecraftLogPath: null,
        crashReportPath: null,
        logTail: message,
        crashReportTail: null,
        hint: null,
      });
    } finally {
      setWorking(false);
      window.setTimeout(() => {
        setInstallProgress(null);
        setBusyMessage("");
      }, 500);
    }
  };

  const handleKillGame = async (instanceId: string) => {
    const pid = runningInstances.get(instanceId);
    if (pid === undefined) return;

    setActionError("");
    setBusyMessage("Stopping Minecraft...");

    try {
      intentionalStopsRef.current.add(`${instanceId}:${pid}`);
      await invoke("kill_instance", { pid });
    } catch (error) {
      console.error(error);
      const stillAlive = await invoke<boolean>("is_process_alive", { pid }).catch(() => true);
      if (stillAlive) {
        intentionalStopsRef.current.delete(`${instanceId}:${pid}`);
        setActionError(String(error));
        pushToast("error", String(error), { title: "Stop failed" });
        setBusyMessage("");
        return;
      }
    }

    const stillAlive = await invoke<boolean>("is_process_alive", { pid }).catch(() => false);
    if (stillAlive) {
      setActionError("Minecraft is still running. Try Kill Game again.");
      pushToast("warning", "Minecraft всё ещё работает. Попробуй ещё раз.", {
        title: "Still running",
      });
      setBusyMessage("");
      return;
    }

    void handleInstanceStopped(instanceId);
    setBusyMessage("");
  };

  const handleDeleteInstance = async (instanceId: string) => {
    const inst = instances.find((i) => i.id === instanceId);
    setConfirmPendingId(instanceId);
    setConfirmPendingName(inst?.name ?? instanceId);
  };

  const handleDeleteConfirmed = async () => {
    if (!confirmPendingId) return;
    const id = confirmPendingId;
    const deletedName = confirmPendingName;
    setConfirmPendingId(null);
    setConfirmPendingName("");
    try {
      await invoke("delete_instance", { instanceId: id });
      removeRunning(id);

      if (buildCardAppearances[id]) {
        const nextAppearances = { ...buildCardAppearances };
        delete nextAppearances[id];
        persistBuildCardAppearances(nextAppearances);
      }

      pushToast("info", `Сборка ${deletedName} удалена`.trim(), { title: "Build deleted" });
      await refreshInstances();
    } catch (error) {
      console.error(error);
      setActionError(String(error));
      pushToast("error", String(error), { title: "Delete failed" });
    }
  };

  const handleOpenFolder = async () => {
    if (!selectedInstance) return;

    try {
      setActionError("");
      await invoke<ActionResult>("open_instance_folder", { instanceId: selectedInstance.id });
    } catch (error) {
      console.error(error);
      setActionError(String(error));
      pushToast("error", String(error), { title: "Couldn't open folder" });
    }
  };

  // ── Export ──
  const handleExportInstance = async (instanceId: string) => {
    setExportInstanceId(instanceId);
    setExportData(null);
    setExportError("");
    try {
      const data = await invoke<InstanceExportData>("get_instance_export_data", { instanceId });
      setExportData(data);
      setExportOptions({
        name: true,
        ram: true,
        javaArgs: hasJavaArgsData(data),
        javaPath: hasJavaPathData(data),
        window: hasWindowSettingsData(data),
        mods: data.mods.length > 0,
        shaders: data.shaders.length > 0,
        resourcePacks: data.resourcePacks.length > 0,
      });
    } catch (err) {
      console.error(err);
      setExportError(String(err));
    }
  };

  const exportSlug = (name: string) =>
    (name || "build")
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}_-]+/gu, "-")
      .replace(/^-+|-+$/g, "") || "build";

  const handleExportDownload = () => {
    if (!exportData || !exportInstanceId) return;
    const out = {
      schemaVersion: 2,
      name: exportOptions.name ? exportData.name : "",
      version: exportData.version,
      loader: exportData.loader,
      loaderVersion: exportData.loaderVersion ?? null,
      ram: exportOptions.ram ? exportData.ram : 0,
      javaArgs: exportOptions.javaArgs ? (exportData.javaArgs ?? null) : null,
      javaPath: exportOptions.javaPath ? (exportData.javaPath ?? null) : null,
      windowWidth: exportOptions.window ? (exportData.windowWidth ?? null) : null,
      windowHeight: exportOptions.window ? (exportData.windowHeight ?? null) : null,
      fullscreen: exportOptions.window ? (exportData.fullscreen ?? false) : false,
      mods: exportOptions.mods ? exportData.mods.filter((item) => item.source === "modrinth") : [] as ExportedItem[],
      shaders: exportOptions.shaders ? exportData.shaders.filter((item) => item.source === "modrinth") : [] as ExportedItem[],
      resourcePacks: exportOptions.resourcePacks ? exportData.resourcePacks.filter((item) => item.source === "modrinth") : [] as ExportedItem[],
    };
    const json = JSON.stringify(out, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportSlug(exportOptions.name ? exportData.name : "build")}.slbuild`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setExportInstanceId(null);
    pushToast("info", `${exportData.name} экспортирована (.slbuild)`, { title: "Build exported" });
  };

  const handleExportMrpack = async () => {
    if (!exportData || !exportInstanceId || exportWorking) return;
    setExportError("");
    try {
      const selectedPath = await saveDialog({
        title: "Export Modrinth pack",
        defaultPath: `${exportSlug(exportOptions.name ? exportData.name : "build")}.mrpack`,
        filters: [{ name: "Modrinth pack", extensions: ["mrpack"] }],
      });
      if (!selectedPath) return;
      const outputPath = selectedPath.toLowerCase().endsWith(".mrpack")
        ? selectedPath
        : `${selectedPath}.mrpack`;
      setExportWorking(true);
      await invoke<string>("export_instance_mrpack", {
        instanceId: exportInstanceId,
        outputPath,
        options: {
          includeName: exportOptions.name,
          includeRam: exportOptions.ram,
          includeJavaArgs: exportOptions.javaArgs,
          includeJavaPath: exportOptions.javaPath,
          includeWindow: exportOptions.window,
          includeMods: exportOptions.mods,
          includeShaders: exportOptions.shaders,
          includeResourcePacks: exportOptions.resourcePacks,
        },
      });
      setExportInstanceId(null);
      pushToast("info", `${exportData.name} экспортирована (.mrpack)`, { title: "Build exported" });
    } catch (err) {
      setExportError(String(err));
      pushToast("error", String(err), { title: "Export failed" });
    } finally {
      setExportWorking(false);
    }
  };

  const prepareImport = (
    data: InstanceExportData,
    path: string,
    format: "slbuild" | "mrpack",
  ) => {
    setImportData(data);
    setImportSourcePath(path);
    setImportSourceFormat(format);
    setImportCustomName(data.name || "");
    setImportOptions({
      name: !!data.name,
      ram: !!data.ram,
      javaArgs: hasJavaArgsData(data),
      javaPath: hasJavaPathData(data),
      window: hasWindowSettingsData(data),
      mods: (data.mods?.length ?? 0) > 0,
      shaders: (data.shaders?.length ?? 0) > 0,
      resourcePacks: (data.resourcePacks?.length ?? 0) > 0,
    });
    setImportError("");
    setImportModalOpen(true);
  };

  const handleImportBuild = async () => {
    try {
      const selectedPath = await openDialog({
        title: "Import build",
        multiple: false,
        directory: false,
        filters: [
          { name: "Launcher builds", extensions: ["slbuild", "mrpack", "json"] },
        ],
      });
      if (!selectedPath || Array.isArray(selectedPath)) return;
      const isMrpack = selectedPath.toLowerCase().endsWith(".mrpack");
      const data = await invoke<InstanceExportData>(
        isMrpack ? "inspect_mrpack" : "read_slbuild_file",
        { path: selectedPath },
      );
      prepareImport(data, selectedPath, isMrpack ? "mrpack" : "slbuild");
    } catch (err) {
      setImportData(null);
      setImportSourcePath("");
      setImportError(String(err));
      setImportModalOpen(true);
    }
  };

  // ── Drag & drop install (option A): content files land on a build card;
  // build files (.mrpack/.slbuild) just open the import flow. ──
  const importBuildFromPath = async (path: string) => {
    try {
      const isMrpack = path.toLowerCase().endsWith(".mrpack");
      const data = await invoke<InstanceExportData>(
        isMrpack ? "inspect_mrpack" : "read_slbuild_file",
        { path },
      );
      prepareImport(data, path, isMrpack ? "mrpack" : "slbuild");
    } catch (err) {
      setImportData(null);
      setImportSourcePath("");
      setImportError(String(err));
      setImportModalOpen(true);
    }
  };

  const findInstanceAtPoint = (physX: number, physY: number): string | null => {
    const dpr = window.devicePixelRatio || 1;
    const x = physX / dpr;
    const y = physY / dpr;
    for (const [id, node] of instanceCardRefs.current) {
      const rect = node.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return id;
      }
    }
    return null;
  };

  const classifyDragPaths = (paths: string[]): null | "build" | "content" => {
    if (paths.some((p) => /\.(mrpack|slbuild)$/i.test(p))) return "build";
    if (paths.some((p) => /\.(jar|zip)$/i.test(p))) return "content";
    return null;
  };

  const handleDroppedPaths = async (paths: string[], physX: number, physY: number) => {
    const buildFiles = paths.filter((p) => /\.(mrpack|slbuild)$/i.test(p));
    if (buildFiles.length > 0) {
      await importBuildFromPath(buildFiles[0]);
      return;
    }
    const contentFiles = paths.filter((p) => /\.(jar|zip)$/i.test(p));
    if (contentFiles.length === 0) {
      pushToast(
        "warning",
        "Перетащи .jar/.zip на сборку или .mrpack/.slbuild для импорта",
        { title: "Nothing to install" },
      );
      return;
    }
    // Prefer the card under the cursor; otherwise fall back to the currently
    // selected build so a drop anywhere in the window still lands somewhere.
    const targetId = findInstanceAtPoint(physX, physY) ?? selectedInstanceId ?? null;
    if (!targetId) {
      pushToast("warning", "Сначала выбери сборку, в которую установить файлы", {
        title: "No build selected",
      });
      return;
    }
    try {
      const result = await invoke<ActionResult>("install_dropped_content", {
        instanceId: targetId,
        paths: contentFiles,
      });
      pushToast(result.ok ? "info" : "warning", result.message);
      if (selectedInstanceId === targetId) {
        await refreshInstances(targetId);
      }
    } catch (err) {
      pushToast("error", String(err), { title: "Install failed" });
    }
  };

  // Reassigned every render so the one-time listener always sees fresh state.
  dragEventRef.current = (payload: any) => {
    if (payload.type === "enter") {
      const kind = classifyDragPaths(payload.paths ?? []);
      setDragKind(kind);
      setDragOverInstanceId(
        kind === "content"
          ? findInstanceAtPoint(payload.position.x, payload.position.y)
          : null,
      );
    } else if (payload.type === "over") {
      if (dragKind === "content") {
        setDragOverInstanceId(findInstanceAtPoint(payload.position.x, payload.position.y));
      }
    } else if (payload.type === "drop") {
      setDragKind(null);
      setDragOverInstanceId(null);
      void handleDroppedPaths(payload.paths, payload.position.x, payload.position.y);
    } else if (payload.type === "leave") {
      setDragKind(null);
      setDragOverInstanceId(null);
    }
  };

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;
    void getCurrentWebview()
      .onDragDropEvent((event) => dragEventRef.current(event.payload))
      .then((un) => {
        if (active) {
          unlisten = un;
        } else {
          un();
        }
      });
    return () => {
      active = false;
      if (unlisten) unlisten();
    };
  }, []);

  const handleImportConfirm = async () => {
    if (!importData) return;
    setImportWorking(true);
    setImportError("");
    const name = importOptions.name ? importData.name : importCustomName;
    const ram = importOptions.ram && importData.ram
      ? importData.ram
      : (launcherSettings?.defaultRamGb ?? 4);
    try {
      const newInstance = importSourceFormat === "mrpack"
        ? await invoke<InstanceItem>("import_mrpack", {
            path: importSourcePath,
            options: {
              name,
              ram,
              javaArgs: importOptions.javaArgs ? (importData.javaArgs ?? null) : null,
              javaPath: importOptions.javaPath ? (importData.javaPath ?? null) : null,
              windowWidth: importOptions.window ? (importData.windowWidth ?? null) : null,
              windowHeight: importOptions.window ? (importData.windowHeight ?? null) : null,
              fullscreen: importOptions.window ? (importData.fullscreen ?? false) : false,
              includeMods: importOptions.mods,
              includeShaders: importOptions.shaders,
              includeResourcePacks: importOptions.resourcePacks,
            },
          })
        : await invoke<InstanceItem>("import_instance", {
            payload: {
              name,
              version: importData.version,
              loader: importData.loader,
              loaderVersion: importData.loaderVersion ?? null,
              ram,
              javaArgs: importOptions.javaArgs ? (importData.javaArgs ?? null) : null,
              javaPath: importOptions.javaPath ? (importData.javaPath ?? null) : null,
              windowWidth: importOptions.window ? (importData.windowWidth ?? null) : null,
              windowHeight: importOptions.window ? (importData.windowHeight ?? null) : null,
              fullscreen: importOptions.window ? (importData.fullscreen ?? false) : false,
              mods: importOptions.mods ? (importData.mods ?? []) : [],
              shaders: importOptions.shaders ? (importData.shaders ?? []) : [],
              resourcePacks: importOptions.resourcePacks ? (importData.resourcePacks ?? []) : [],
            },
          });
      await refreshInstances(newInstance.id);
      setImportModalOpen(false);
      setImportData(null);
      setImportSourcePath("");
      pushToast("info", `Сборка ${newInstance.name} импортирована`, { title: "Build imported" });
    } catch (err) {
      setImportError(String(err));
      pushToast("error", String(err), { title: "Import failed" });
    } finally {
      setImportWorking(false);
    }
  };
  const renderMainContent = () => {
    switch (activeTab) {
      case "overview":
        return (
          <OverviewTab
            selectedInstance={selectedInstance}
            isRunning={isRunning}
            resolve={resolve}
            handleKillGame={handleKillGame}
            handleLaunchSelected={handleLaunchSelected}
            working={working}
            setTabAnimated={setTabAnimated}
          />
        );
      case "instances":
        return (
          <InstancesTab
            instances={instances}
            selectedInstance={selectedInstance}
            selectedInstanceId={selectedInstanceId}
            setSelectedInstanceId={setSelectedInstanceId}
            instanceCardRefs={instanceCardRefs}
            createCardMeasureRef={createCardMeasureRef}
            createMode={createMode}
            setCreateMode={setCreateMode}
            createBuildName={createBuildName}
            setCreateBuildName={setCreateBuildName}
            createVersion={createVersion}
            setCreateVersion={setCreateVersion}
            createLoader={createLoader}
            setCreateLoader={setCreateLoader}
            loaderVersions={loaderVersions}
            loaderVersionsLoading={loaderVersionsLoading}
            createLoaderVersion={createLoaderVersion}
            setCreateLoaderVersion={setCreateLoaderVersion}
            createError={createError}
            setCreateError={setCreateError}
            minecraftVersions={minecraftVersions}
            openDropdown={openDropdown}
            setOpenDropdown={setOpenDropdown}
            working={working}
            busyMessage={busyMessage}
            actionError={actionError}
            installProgress={installProgress}
            dragOverInstanceId={dragOverInstanceId}
            dragContentActive={dragKind === "content"}
            advancedSettingsEnabled={advancedSettingsEnabled}
            getBuildCardAppearance={getBuildCardAppearance}
            buildCardSettingsOpen={buildCardSettingsOpen}
            buildSettingsTargetId={buildSettingsTargetId}
            buildCardSettingsDraft={buildCardSettingsDraft}
            buildCardPreviewSize={buildCardPreviewSize}
            buildCardPreviewTarget={buildCardPreviewTarget}
            createPreviewName={createPreviewName}
            createPreviewVersion={createPreviewVersion}
            createPreviewLoader={createPreviewLoader}
            createPreviewRam={createPreviewRam}
            createMeasureAppearance={createMeasureAppearance}
            resolveBuildCardContentTags={resolveBuildCardContentTags}
            resolveForTarget={resolveForTarget}
            isRunning={isRunning}
            handleCreateBuild={handleCreateBuild}
            handleInstallSelected={handleInstallSelected}
            handleLaunchSelected={handleLaunchSelected}
            handleKillGame={handleKillGame}
            handleDeleteInstance={handleDeleteInstance}
            handleExportInstance={handleExportInstance}
            handleImportBuild={handleImportBuild}
            handleOpenFolder={handleOpenFolder}
            setStatsInstanceId={setStatsInstanceId}
            setScreenshotsInstanceId={setScreenshotsInstanceId}
            openBuildCardSettings={openBuildCardSettings}
          />
        );
      case "mods":
        return (
          <ModsTab
            modSearch={modSearch}
            setModSearch={setModSearch}
            modrinthItems={modrinthItems}
            modrinthTotalHits={modrinthTotalHits}
            modrinthLoading={modrinthLoading}
            modrinthLoadingMore={modrinthLoadingMore}
            modrinthError={modrinthError}
            modrinthInstallBusyId={modrinthInstallBusyId}
            installedMods={installedMods}
            installedModsLoading={installedModsLoading}
            moddedInstances={moddedInstances}
            selectedModTarget={selectedModTarget}
            setSelectedInstanceId={setSelectedInstanceId}
            openDropdown={openDropdown}
            setOpenDropdown={setOpenDropdown}
            resolveForTarget={resolveForTarget}
            handleLoadMoreMods={handleLoadMoreMods}
            handleInstallMod={handleInstallMod}
            handleUninstallMod={handleUninstallMod}
          />
        );
      case "resourcepacks":
        return (
          <ResourcePacksTab
            packSearch={packSearch}
            setPackSearch={setPackSearch}
            packItems={packItems}
            packTotalHits={packTotalHits}
            packLoading={packLoading}
            packLoadingMore={packLoadingMore}
            packError={packError}
            packInstallBusyId={packInstallBusyId}
            installedPacks={installedPacks}
            installedPacksLoading={installedPacksLoading}
            instances={instances}
            selectedInstance={selectedInstance}
            setSelectedInstanceId={setSelectedInstanceId}
            openDropdown={openDropdown}
            setOpenDropdown={setOpenDropdown}
            resolveForTarget={resolveForTarget}
            handleLoadMorePacks={handleLoadMorePacks}
            handleInstallPack={handleInstallPack}
            handleUninstallPack={handleUninstallPack}
          />
        );
      case "shaders":
        return (
          <ShadersTab
            shaderSearch={shaderSearch}
            setShaderSearch={setShaderSearch}
            shaderItems={shaderItems}
            shaderTotalHits={shaderTotalHits}
            shaderLoading={shaderLoading}
            shaderLoadingMore={shaderLoadingMore}
            shaderError={shaderError}
            shaderInstallBusyId={shaderInstallBusyId}
            installedShaders={installedShaders}
            installedShadersLoading={installedShadersLoading}
            instances={instances}
            selectedShaderTarget={selectedShaderTarget}
            setSelectedInstanceId={setSelectedInstanceId}
            openDropdown={openDropdown}
            setOpenDropdown={setOpenDropdown}
            resolveForTarget={resolveForTarget}
            handleLoadMoreShaders={handleLoadMoreShaders}
            handleInstallShader={handleInstallShader}
            handleUninstallShader={handleUninstallShader}
          />
        );
      case "settings":
        return (
          <SettingsTab
            systemRamGb={systemRamGb}
            settingsRamDraft={settingsRamDraft}
            setSettingsRamDraft={setSettingsRamDraft}
            saveSettingsRam={saveSettingsRam}
            optimizedJavaArgs={launcherSettings?.optimizedJavaArgs ?? true}
            saveOptimizedJavaArgs={saveOptimizedJavaArgs}
            mirrorMode={launcherSettings?.network?.mirror ?? "auto"}
            saveNetworkSettings={saveNetworkSettings}
            wheelTabSwitching={wheelTabSwitching}
            setWheelTabSwitching={setWheelTabSwitching}
            showSnapshots={showSnapshots}
            setShowSnapshots={setShowSnapshots}
            showPreReleases={showPreReleases}
            setShowPreReleases={setShowPreReleases}
            advancedSettingsEnabled={advancedSettingsEnabled}
            onToggleAdvanced={() => {
              setAdvancedSettingsEnabled((prev) => {
                const next = !prev;
                window.localStorage.setItem("screenlauncher-advanced-settings-enabled", String(next));
                return next;
              });
            }}
            pluginsSettings={launcherSettings?.plugins}
            savePluginsSettings={saveLauncherPlugins}
            launcherNickname={nickname}
            launcherAccountType={accountType}
            launcherMsAccountId={activeMsAccountId}
            microsoftAccounts={msAccounts}
            theme={theme}
            setTheme={setTheme}
          />
        );
      default:
        return null;
    }
  };

  const mainUI = (
    <div className="ui-container" onWheel={onWheelTabs}>
      <div className="paper-texture" />

      <header
        className="gallery-header"
        onMouseDown={(e) => {
          if ((e.target as HTMLElement).tagName !== "BUTTON") {
            void win.startDragging();
          }
        }}
      >
        <div className="nav-brand">ARCHIVE // MINECRAFT LAUNCHER</div>
        <div className="nav-controls">
          <button onClick={() => void win.minimize()} type="button">MINIMIZE</button>
          <button onClick={() => void handleMaximize()} type="button">EXPAND</button>
          <button onClick={() => void handleClose()} className="close-btn" type="button">CLOSE</button>
        </div>
      </header>

      <main className="gallery-content">
        <aside className="sidebar">
          <div className="index-number">{TAB_INDEX[activeTab]}</div>

          <nav className="side-nav">
            {TAB_ORDER.map((tab) => (
              <button
                key={tab}
                className={activeTab === tab ? "active" : ""}
                onClick={() => setTabAnimated(tab)}
                type="button"
              >
                {TAB_TITLE[tab]}
              </button>
            ))}
          </nav>
        </aside>

        <section
          className={`main-stage ${activeTab === "overview" ? "with-right-panel" : "no-right-panel"}`}
        >
          <div className={`content-wrap launcher-wrap ${tabAnimating ? "tab-animated" : ""}`}>
            {renderMainContent()}
          </div>

          {activeTab === "overview" && selectedInstance && (
            <OverviewPanel
              resolve={resolve}
              nickname={nickname}
              setNickname={setNickname}
              accountType={accountType}
              setAccountType={setAccountType}
              openDropdown={openDropdown}
              setOpenDropdown={setOpenDropdown}
              msAccounts={msAccounts}
              activeMsAccountId={activeMsAccountId}
              onOpenMsModal={() => setShowMsModal(true)}
            />
          )}

          {showMsModal && (
            <MicrosoftAccountsModal
              accounts={msAccounts}
              activeAccountId={activeMsAccountId}
              onSelect={(id) => setActiveMsAccountId(id || null)}
              onAccountsChange={(updated) => {
                setMsAccounts(updated);
                if (updated.length > 0 && !updated.find((a) => a.id === activeMsAccountId)) {
                  setActiveMsAccountId(updated[0].id);
                }
                if (updated.length === 0) setActiveMsAccountId(null);
              }}
              onClose={() => setShowMsModal(false)}
            />
          )}
        </section>
      </main>

      <footer className="gallery-footer">
        <div className="footer-left">CORE: RUST_NATIVE / OFFLINE_VANILLA</div>
        <div className="footer-right">CREATE / INSTALL / PLAY ↓</div>
      </footer>
    </div>
  );

  return (
    <div className={`gallery-root ${phase} ${isClosing ? "tearing" : ""}`}>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      {dragKind === "build" && (
        <div className="global-drop-overlay">
          <div className="global-drop-overlay-inner">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 16V5M12 16l-4-4M12 16l4-4M5 19h14"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <strong>ОТПУСТИ — ИМПОРТ СБОРКИ</strong>
            <span>.mrpack / .slbuild</span>
          </div>
        </div>
      )}
      {dragKind === "content" && !dragOverInstanceId && (() => {
        const fallbackName = instances.find((i) => i.id === selectedInstanceId)?.name;
        return (
          <div className="global-drop-overlay">
            <div className="global-drop-overlay-inner">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 16V5M12 16l-4-4M12 16l4-4M5 19h14"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <strong>
                {fallbackName ? `ОТПУСТИ — В СБОРКУ ${fallbackName.toUpperCase()}` : "ВЫБЕРИ СБОРКУ"}
              </strong>
              <span>{fallbackName ? ".jar / .zip" : "сначала выбери сборку"}</span>
            </div>
          </div>
        );
      })()}
      {!isClosing ? (
        mainUI
      ) : (
        <>
          <div
            className="tear-half left-half"
            style={{ clipPath: `polygon(0% 0%, ${tearPath}, 0% 100%)` }}
          >
            <div className="fixed-content">{mainUI}</div>
          </div>
          <div
            className="tear-half right-half"
            style={{ clipPath: `polygon(100% 0%, ${tearPath}, 100% 100%)` }}
          >
            <div className="fixed-content">{mainUI}</div>
          </div>
        </>
      )}

      {buildCardSettingsOpen && (
        <BuildCardSettingsPopup
          isCreateMode={!buildSettingsTargetId}
          systemRamGb={systemRamGb}
          optimizedJavaArgs={optimizedJavaArgsEnabled}
          buildName={buildSettingsTargetInstance?.name || createPreviewName}
          buildVersion={buildSettingsTargetInstance?.version || createPreviewVersion}
          buildLoader={buildSettingsTargetInstance?.loader || createPreviewLoader}
          buildRamGb={buildRuntimeSettingsDraft.ram}
          lastPlayedLabel={
            buildSettingsTargetInstance
              ? formatLastPlayed(buildSettingsTargetInstance.lastPlayed ?? "0")
              : "Never played"
          }
          badgePreviewText={buildCardPreviewBadgeText}
          resolvePreviewText={(template) =>
            resolveForTarget(template, buildCardPreviewTarget, { buildState: "RUNNING" })
          }
          previewCardSize={buildCardPreviewSize}
          draft={buildCardSettingsDraft}
          onDraftChange={setBuildCardSettingsDraft}
          runtimeDraft={buildRuntimeSettingsDraft}
          onRuntimeDraftChange={setBuildRuntimeSettingsDraft}
          onUploadImage={handleBuildCardImagePicked}
          onOpenLogs={
            buildSettingsTargetId
              ? () => {
                  void openBuildLogs(buildSettingsTargetId);
                }
              : undefined
          }
          onResetAll={clearBuildCardSettings}
          onResetRuntime={resetBuildRuntimeSettings}
          onClose={closeBuildCardSettings}
          onSave={saveBuildCardSettings}
        />
      )}

      {statsInstanceId && (() => {
        const si = instances.find((i) => i.id === statsInstanceId);
        return si ? (
          <BuildStatsModal instance={si} onClose={() => setStatsInstanceId(null)} />
        ) : null;
      })()}

      {screenshotsInstanceId && (() => {
        const si = instances.find((i) => i.id === screenshotsInstanceId);
        return si ? (
          <BuildScreenshotsModal instance={si} onClose={() => setScreenshotsInstanceId(null)} />
        ) : null;
      })()}

      {confirmPendingId && (
        <div className="confirm-overlay" onClick={() => { setConfirmPendingId(null); setConfirmPendingName(""); }}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <span className="confirm-label">DELETE BUILD</span>
            <p className="confirm-title">{confirmPendingName}</p>
            <p className="confirm-body">
              Все файлы сборки будут удалены с диска безвозвратно.
            </p>
            <div className="confirm-actions">
              <button
                className="primary-action kill-action confirm-btn-delete"
                type="button"
                onClick={handleDeleteConfirmed}
              >
                DELETE
              </button>
              <button
                className="ghost-action"
                type="button"
                onClick={() => { setConfirmPendingId(null); setConfirmPendingName(""); }}
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Export modal ── */}
      {exportInstanceId && (() => {
        const inst = instances.find((i) => i.id === exportInstanceId);
        type ExportKey = keyof typeof exportOptions;
        type ExportRow = { key: ExportKey; label: string; meta?: string; items?: ExportedItem[] };
        const rows: ExportRow[] = [
          { key: "name",          label: "BUILD NAME",     meta: exportData?.name },
          { key: "ram",           label: "RAM SETTINGS",   meta: exportData ? `${exportData.ram} GB` : undefined },
          { key: "javaArgs",      label: "JAVA ARGUMENTS", meta: formatJavaArgsMeta(exportData) },
          { key: "javaPath",      label: "JAVA PATH",      meta: exportData?.javaPath || undefined },
          { key: "window",        label: "WINDOW SIZE",    meta: formatWindowSettingsMeta(exportData) },
          { key: "mods",          label: "MODS",           meta: exportData ? `${exportData.mods.length}` : "...",         items: exportData?.mods ?? [] },
          { key: "shaders",       label: "SHADERS",        meta: exportData ? `${exportData.shaders.length}` : "...",      items: exportData?.shaders ?? [] },
          { key: "resourcePacks", label: "RESOURCE PACKS", meta: exportData ? `${exportData.resourcePacks.length}` : "...", items: exportData?.resourcePacks ?? [] },
        ];
        const toggle = (key: ExportKey) =>
          setExportOptions((prev) => ({ ...prev, [key]: !prev[key] }));
        return (
          <div className="confirm-overlay" onClick={() => { if (!exportWorking) { setExportInstanceId(null); setListPreview(null); } }}>
            <div className="confirm-dialog eximp-dialog" onClick={(e) => e.stopPropagation()}>
              <span className="confirm-label">EXPORT BUILD</span>
              <p className="confirm-title">{inst?.name ?? ""}</p>
              <div className="eximp-options">
                {rows.map(({ key, label, meta, items }) => (
                  <div
                    key={key}
                    className="eximp-option"
                    onClick={() => toggle(key)}
                    onMouseEnter={(e) => {
                      if (items && items.length > 0) {
                        altHoverRef.current = { items, label, el: e.currentTarget };
                        if (e.altKey) setListPreview({ items, label, rect: e.currentTarget.getBoundingClientRect() });
                      }
                    }}
                    onMouseLeave={() => { altHoverRef.current = null; setListPreview(null); }}
                  >
                    <OptionToggle enabled={exportOptions[key]} onToggle={() => toggle(key)} />
                    <span className="eximp-option-label">{label}</span>
                    <span className="eximp-option-meta">
                      {items && items.length > 0 && <span className="eximp-alt-hint">alt </span>}
                      {meta}
                    </span>
                  </div>
                ))}
              </div>
              <p className="eximp-notice">
                .SLBUILD stores the project list. .MRPACK also includes local mods, configs,
                and other user files through OVERRIDES.
              </p>
              {exportError && (
                <p className="panel-text" style={{ marginTop: 12, color: "var(--accent)" }}>
                  {exportError}
                </p>
              )}
              {exportWorking && <p className="eximp-working">CREATING .MRPACK...</p>}
              <div className="confirm-actions" style={{ marginTop: 24 }}>
                <button
                  className="primary-action"
                  type="button"
                  disabled={!exportData || exportWorking}
                  onClick={handleExportDownload}
                >
                  .SLBUILD
                </button>
                <button
                  className="ghost-action"
                  type="button"
                  disabled={!exportData || exportWorking}
                  onClick={() => void handleExportMrpack()}
                >
                  .MRPACK
                </button>
                <button
                  className="ghost-action"
                  type="button"
                  disabled={exportWorking}
                  onClick={() => { setExportInstanceId(null); setListPreview(null); }}
                >
                  CANCEL
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Import modal ── */}
      {importModalOpen && (() => {
        type ImportKey = keyof typeof importOptions;
        type ImportRow = { key: ImportKey; label: string; meta?: string; disabled?: boolean; items?: ExportedItem[] };
        const rows: ImportRow[] = [
          { key: "name",          label: "BUILD NAME",     meta: importData?.name || undefined },
          { key: "ram",           label: "RAM SETTINGS",   meta: importData?.ram ? `${importData.ram} GB` : undefined },
          { key: "javaArgs",      label: "JAVA ARGUMENTS", meta: formatJavaArgsMeta(importData), disabled: !hasJavaArgsData(importData) },
          { key: "javaPath",      label: "JAVA PATH",      meta: importData?.javaPath || undefined, disabled: !hasJavaPathData(importData) },
          { key: "window",        label: "WINDOW SIZE",    meta: formatWindowSettingsMeta(importData), disabled: !hasWindowSettingsData(importData) },
          { key: "mods",          label: "MODS",           meta: importData ? `${importData.mods?.length ?? 0}` : undefined,         disabled: !importData?.mods?.length,         items: importData?.mods ?? [] },
          { key: "shaders",       label: "SHADERS",        meta: importData ? `${importData.shaders?.length ?? 0}` : undefined,      disabled: !importData?.shaders?.length,      items: importData?.shaders ?? [] },
          { key: "resourcePacks", label: "RESOURCE PACKS", meta: importData ? `${importData.resourcePacks?.length ?? 0}` : undefined, disabled: !importData?.resourcePacks?.length, items: importData?.resourcePacks ?? [] },
        ];
        const toggle = (key: ImportKey) =>
          setImportOptions((prev) => ({ ...prev, [key]: !prev[key] }));
        const close = () => { if (importWorking) return; setImportModalOpen(false); setImportData(null); setImportSourcePath(""); setImportError(""); setListPreview(null); };
        return (
          <div className="confirm-overlay" onClick={close}>
            <div className="confirm-dialog eximp-dialog" onClick={(e) => e.stopPropagation()}>
              <span className="confirm-label">IMPORT BUILD</span>
              <p className="confirm-title">{importData?.name || "НОВАЯ СБОРКА"}</p>
              {importData ? (
                <>
                  <div className="eximp-options">
                    {rows.map(({ key, label, meta, disabled, items }) => (
                      <div key={key}>
                        <div
                          className={`eximp-option${disabled ? " disabled" : ""}`}
                          onClick={() => !disabled && toggle(key)}
                          onMouseEnter={(e) => {
                            if (items && items.length > 0) {
                              altHoverRef.current = { items, label, el: e.currentTarget };
                              if (e.altKey) setListPreview({ items, label, rect: e.currentTarget.getBoundingClientRect() });
                            }
                          }}
                          onMouseLeave={() => { altHoverRef.current = null; setListPreview(null); }}
                        >
                          <OptionToggle
                            enabled={importOptions[key] && !disabled}
                            onToggle={() => !disabled && toggle(key)}
                            disabled={disabled}
                          />
                          <span className="eximp-option-label">{label}</span>
                          <span className="eximp-option-meta">
                            {items && items.length > 0 && <span className="eximp-alt-hint">alt </span>}
                            {meta}
                          </span>
                        </div>
                        {key === "name" && !importOptions.name && (
                          <div className="eximp-name-input-wrap">
                            <input
                              placeholder="Введите название сборки"
                              value={importCustomName}
                              onChange={(e) => setImportCustomName(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="eximp-notice">
                    {importSourceFormat === "mrpack"
                      ? "Files from the .mrpack will be downloaded and unpacked into the build folders."
                      : "Version and loader come from the file. Modrinth projects will be downloaded again."}
                  </p>
                  {importError && (
                    <p className="panel-text" style={{ marginTop: 12, color: "var(--accent)" }}>
                      {importError}
                    </p>
                  )}
                  {importWorking && <p className="eximp-working">ИМПОРТ...</p>}
                  <div className="confirm-actions" style={{ marginTop: 24 }}>
                    <button
                      className="primary-action"
                      type="button"
                      disabled={importWorking || (!importOptions.name && !importCustomName.trim())}
                      onClick={handleImportConfirm}
                    >
                      {importWorking ? "WORKING..." : "IMPORT"}
                    </button>
                    <button className="ghost-action" type="button" onClick={close} disabled={importWorking}>
                      CANCEL
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="confirm-body" style={{ color: "var(--accent)" }}>{importError || "Ошибка чтения файла."}</p>
                  <div className="confirm-actions" style={{ marginTop: 8 }}>
                    <button className="ghost-action" type="button" onClick={close}>CLOSE</button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Alt+hover list preview ── */}
      {listPreview && listPreview.items.length > 0 && (() => {
        const gap = 10;
        const previewW = 280;
        const previewItemHeight = 46;
        const spaceRight = window.innerWidth - listPreview.rect.right - gap;
        const left = spaceRight >= previewW
          ? listPreview.rect.right + gap
          : listPreview.rect.left - previewW - gap;
        const top = Math.min(
          listPreview.rect.top,
          window.innerHeight - Math.min(listPreview.items.length * previewItemHeight + 46, 320) - 8,
        );
        return (
          <div className="eximp-list-preview" style={{ left, top }}>
            <div className="eximp-list-preview-head">
              <span>{listPreview.label}</span>
              <span className="eximp-list-preview-count">{listPreview.items.length}</span>
            </div>
            {listPreview.items.map((item, i) => (
              <div key={`${item.projectId ?? item.title}-${i}`} className="eximp-list-preview-item">
                <ExportedItemIcon
                  src={getExportedItemIconUrl(item)}
                  title={item.title}
                  source={item.source}
                />
                <span className="eximp-list-preview-title">{item.title}</span>
                <span className="eximp-list-preview-src">{item.source}</span>
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import "./App.css";
import { TAB_INDEX, TAB_ORDER, TAB_TITLE } from "./constants/tabs";
import { useWindowPhase } from "./hooks/useWindowPhase";
import { useRunningInstances } from "./hooks/useRunningInstances";
import { useBuildCardAppearances } from "./hooks/useBuildCardAppearances";
import { useLocalStorageBoolean } from "./hooks/useLocalStorage";
import { useAccounts } from "./hooks/useAccounts";
import { logger } from "./utils/logger";
import { clampRamToSystem } from "./utils/ram";
import { toErrorMessage } from "./utils/errors";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  BuildCardSettingsPopup,
  DEFAULT_BUILD_CARD_APPEARANCE,
  getBuildCardBadgeText,
  normalizeBuildCardAppearance,
  type BuildCardAppearance,
  type BuildCardPreviewSize,
} from "./components/builds/BuildCardSettingsPopup";
import { resolveBuildCardTags } from "./components/builds/BuildCardContentView";
// Stats (with its heavy canvas constellation) and screenshots are on-demand
// modals — keep them out of the main bundle until the user opens one.
const BuildStatsModal = lazy(() =>
  import("./components/builds/BuildStatsModal").then((module) => ({
    default: module.BuildStatsModal,
  })),
);
const BuildScreenshotsModal = lazy(() =>
  import("./components/builds/BuildScreenshotsModal").then((module) => ({
    default: module.BuildScreenshotsModal,
  })),
);
import {
  createBuildLogsWindowPayload,
  getBuildLogsWindowLabel,
  getBuildLogsWindowUrl,
  LOG_WINDOW_REFRESH_EVENT,
} from "./components/builds/BuildLogsWindowApp";
import {
  getInstallProgressWindowUrl,
  INSTALL_PROGRESS_WINDOW_EVENT,
  INSTALL_PROGRESS_WINDOW_LABEL,
  persistInstallProgressWindowState,
  type InstallProgressWindowState,
} from "./components/builds/InstallProgressWindowApp";
import type {
  ActionResult,
  BuildRuntimeSettingsDraft,
  CreateInstancePayload,
  DropdownKey,
  ExportedItem,
  InstanceItem,
  InstallProgressPayload,
  LauncherPluginsSettings,
  LauncherSettings,
  LaunchLogSnapshot,
  LoaderType,
  MicrosoftAccount,
  MascotSettings,
  MinecraftExitPayload,
  MinecraftManifest,
  TabKey,
  UpdateInstancePayload,
  WorldBackupInfo,
} from "./types";
import { ToastStack } from "./components/notifications/ToastStack";
import { LauncherGuide } from "./components/guide/LauncherGuide";
import { LAUNCHER_GUIDE_STEPS } from "./components/guide/launcherGuideSteps";
import { useToasts } from "./hooks/useToasts";
import { formatLastPlayed } from "./utils/playtime";
import {
  createPlaceholderAppearanceAttributes,
  createPlaceholderValueAttributes,
  resolvePlaceholders,
} from "./utils/placeholders";
import {
  buildPlaceholderContext,
  type PlaceholderTarget,
  usePlaceholders,
} from "./hooks/usePlaceholders";
import { OverviewTab } from "./tabs/OverviewTab";
import { OverviewPanel } from "./tabs/OverviewPanel";
import { InstancesTab } from "./tabs/InstancesTab";
import { ModrinthContentTab } from "./tabs/ModrinthContentTab";
import { SettingsTab } from "./tabs/SettingsTab";
import { useModrinthContent, type ModrinthContentKind } from "./hooks/useModrinthContent";
import { RuntimeMonitorScope, useRuntimeMonitorController } from "./hooks/useRuntimeMonitor";
import { useInstanceTransfers } from "./hooks/useInstanceTransfers";
import { useContentIcons, type ContentIconKind } from "./hooks/useContentIcons";
import { InstanceTransferModals } from "./components/transfer/InstanceTransferModals";
import { DeletedBuildsModal, WorldBackupsModal } from "./components/builds/BuildSafetyModals";
import type { TransferHoverTarget, TransferListPreview } from "./components/transfer/types";
import { pickPreferredInstance } from "./utils/instances";
import { createShredPaths, createTearPath } from "./utils/closeEffects";
import {
  MASCOT_FAKE_CONTENT_DELETE_EVENT,
  MASCOT_FAKE_DELETE_EVENT,
  MASCOT_FAKE_RESTORE_EVENT,
} from "./components/mascot/events";
import { DEFAULT_MASCOT_SETTINGS } from "./components/mascot/mascotConfig";
import {
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  getDefaultJavaArgsText,
  getDefaultRuntimeSettingsDraft,
  normalizeRuntimeSettingsDraft,
} from "./utils/javaArgs";
import { useAppearance } from "./appearance/useAppearance";
import { openAppearanceStudioWindow } from "./appearance/window";
import { isAppearanceStudioShortcut } from "./appearance/shortcut";
import {
  getCloseAnimationDuration,
  playWindowOpeningPreview,
  playTabTransition,
  type CloseAnimationId,
} from "./appearance/animations";
import { resolveTabAnimation } from "./appearance/profile";
import {
  APPEARANCE_ELEMENT_PICKED_EVENT,
  createElementTarget,
  resolveElementTarget,
  mapDrawingCursorToCover,
  type DrawingCursorPayload,
  type WindowAnimationPreviewPayload,
} from "./appearance/elementOverrides";
import type { AppearanceElementTarget } from "./appearance/types";
import { useMainAppearanceRuntime } from "./appearance/useMainAppearanceRuntime";
import { CanvasUiEffectHost } from "./appearance/CanvasUiEffectHost";
import { CanvasUiElementEffects } from "./appearance/CanvasUiElementEffects";

const MicrosoftAccountsModal = lazy(() =>
  import("./components/modals/MicrosoftAccountsModal").then((module) => ({
    default: module.MicrosoftAccountsModal,
  })),
);
const LauncherMascot = lazy(() =>
  import("./components/mascot/LauncherMascot").then((module) => ({
    default: module.LauncherMascot,
  })),
);
const ADVANCED_SETTINGS_STORAGE_KEY = "screenlauncher-advanced-settings-enabled";
const SELECTED_INSTANCE_STORAGE_KEY = "screenlauncher-selected-instance-id";
const FIRST_LAUNCH_GUIDE_STORAGE_KEY = "screenlauncher-first-launch-guide-completed";
const FORCE_FIRST_LAUNCH_GUIDE_PREVIEW =
  import.meta.env.DEV && import.meta.env.VITE_GUIDE_PREVIEW === "1";
const CREATE_BUILD_CARD_DRAFT_KEY = "__create__";
function previewContentKind(label: string): ContentIconKind | null {
  if (label === "MODS") return "mods";
  if (label === "SHADERS") return "shaders";
  if (label === "RESOURCE PACKS") return "resourcePacks";
  return null;
}
const CLOSE_EFFECT_CLASS: Record<CloseAnimationId, string> = {
  tear: "tearing",
  shred: "shredding",
  fade: "closing-fade",
  scale: "closing-scale",
  "slide-down": "closing-slide-down",
  none: "",
};

export default function App() {
  const [phase, setPhase] = useState("init");
  const [closeEffect, setCloseEffect] = useState<CloseAnimationId | null>(null);
  const [previewCloseEffect, setPreviewCloseEffect] = useState<CloseAnimationId | null>(null);
  const [drawingCursor, setDrawingCursor] = useState<DrawingCursorPayload | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [tabAnimating, setTabAnimating] = useState(false);

  const [manifest, setManifest] = useState<MinecraftManifest | null>(null);

  const [instances, setInstances] = useState<InstanceItem[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState("");

  const [wheelTabSwitching, setWheelTabSwitching] = useState(true);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [showPreReleases, setShowPreReleases] = useState(false);

  const [systemRamGb, setSystemRamGb] = useState(8);
  const [launcherSettings, setLauncherSettings] = useState<LauncherSettings | null>(null);
  const [createRamGb, setCreateRamGb] = useState(4);
  const [settingsRamDraft, setSettingsRamDraft] = useState(4);
  const [createRuntimeSettings, setCreateRuntimeSettings] = useState<
    Omit<BuildRuntimeSettingsDraft, "ram">
  >({
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
  const [failedBuildAction, setFailedBuildAction] = useState<{
    id: string;
    action: "install" | "launch";
  } | null>(null);
  // Drag-and-drop overlay state: "build" → whole-launcher drop hint,
  // "content" → per-card hint on the build under the cursor.
  const [dragKind, setDragKind] = useState<null | "build" | "content">(null);
  const [dragOverInstanceId, setDragOverInstanceId] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const {
    nickname,
    setNickname,
    accountType,
    setAccountType,
    msAccounts,
    setMsAccounts,
    activeMsAccountId,
    setActiveMsAccountId,
    showMsModal,
    setShowMsModal,
  } = useAccounts();

  // mod / pack / shader state lives in their hooks — wired up after selectedModTarget/selectedShaderTarget are derived

  const [installProgress, setInstallProgress] = useState<InstallProgressPayload | null>(null);
  const [statsInstanceId, setStatsInstanceId] = useState<string | null>(null);
  const [screenshotsInstanceId, setScreenshotsInstanceId] = useState<string | null>(null);

  const {
    runningInstances,
    isRunning,
    addRunning,
    removeRunning,
    takeLaunchTimestamp,
    markIntentionalStop,
    clearIntentionalStop,
    consumeIntentionalStop,
  } = useRunningInstances();
  const runtimeMonitorPids = useMemo(
    () => Array.from(runningInstances.values()),
    [runningInstances],
  );
  const runtimeMonitor = useRuntimeMonitorController(
    runtimeMonitorPids,
    runningInstances.size > 0 ||
      Boolean(
        launcherSettings?.plugins.mineflayerBot.enabled ||
        launcherSettings?.plugins.blueMap.enabled ||
        launcherSettings?.plugins.obsTelemetry.enabled,
      ),
  );
  const applyDiscordRpcPresence = (
    settings = launcherSettings,
    activeRunning = runningInstances,
  ) => {
    const discordRpc = settings?.plugins.discordRpc;
    const rpcPlayerName =
      accountType === "MICROSOFT"
        ? (msAccounts.find((account) => account.id === activeMsAccountId)?.username ?? nickname)
        : nickname;
    if (!discordRpc?.enabled || !discordRpc.applicationId.trim()) {
      void invoke("stop_discord_rpc_for_instance", { instanceId: null }).catch((error) => {
        logger.error("stop_discord_rpc_for_instance failed", error);
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
        playerName: rpcPlayerName,
      }).catch((error) => {
        logger.error("start_discord_rpc_for_instance failed", error);
      });
      return;
    }

    if (discordRpc.displayMode !== "minecraft") {
      void invoke("start_discord_rpc_for_launcher", {
        accountType,
        playerName: rpcPlayerName,
      }).catch((error) => {
        logger.error("start_discord_rpc_for_launcher failed", error);
      });
      return;
    }

    void invoke("stop_discord_rpc_for_instance", { instanceId: null }).catch((error) => {
      logger.error("stop_discord_rpc_for_instance failed", error);
    });
  };
  const handleInstanceStopped = async (id: string) => {
    const launchTs = takeLaunchTimestamp(id);
    removeRunning(id);
    try {
      await invoke("stop_discord_rpc_for_instance", { instanceId: id });
    } catch (err) {
      logger.error("stop_discord_rpc_for_instance failed", err);
    }
    if (launchTs !== undefined) {
      const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - launchTs);
      try {
        await invoke("record_playtime", { instanceId: id, elapsedSecs: elapsed });
        await refreshInstances(id);
      } catch (err) {
        logger.error("record_playtime failed", err);
      }
    }
  };

  const openBuildLogs = async (
    id: string,
    initialSnapshot: LaunchLogSnapshot | MinecraftExitPayload | null = null,
  ) => {
    try {
      const payloadKey = createBuildLogsWindowPayload(id, initialSnapshot);

      const label = getBuildLogsWindowLabel(id);
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
        url: getBuildLogsWindowUrl(id, payloadKey),
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
        logger.error("log window create failed", event.payload);
        setActionError(`Log window failed: ${String(event.payload)}`);
      });
    } catch (error) {
      logger.error("open build logs failed", error);
      setActionError(`Log window failed: ${toErrorMessage(error)}`);
    }
  };

  const [confirmPendingId, setConfirmPendingId] = useState<string | null>(null);
  const [confirmPendingName, setConfirmPendingName] = useState("");
  const [trashOpen, setTrashOpen] = useState(false);
  const [deletedInstances, setDeletedInstances] = useState<InstanceItem[]>([]);
  const [trashWorking, setTrashWorking] = useState(false);
  const [trashError, setTrashError] = useState("");
  const [backupsInstanceId, setBackupsInstanceId] = useState<string | null>(null);
  const [worldBackups, setWorldBackups] = useState<WorldBackupInfo[]>([]);
  const [backupsWorking, setBackupsWorking] = useState(false);
  const [backupsError, setBackupsError] = useState("");
  const [mascotConfirmPendingId, setMascotConfirmPendingId] = useState<string | null>(null);
  const [mascotConfirmPendingName, setMascotConfirmPendingName] = useState("");
  const [mascotHiddenInstanceIds, setMascotHiddenInstanceIds] = useState<string[]>([]);
  const [mascotHiddenContentIds, setMascotHiddenContentIds] = useState<
    Record<ModrinthContentKind, string[]>
  >({ mods: [], resourcepacks: [], shaders: [] });

  // Alt+hover list preview (shared between export/import)
  const altHoverRef = useRef<TransferHoverTarget | null>(null);
  const altSourceHoveredRef = useRef(false);
  const [listPreview, setListPreview] = useState<TransferListPreview | null>(null);
  const [modrinthProjectIcons, setModrinthProjectIcons] = useState<Record<string, string | null>>(
    {},
  );
  const requestedModrinthProjectIconIdsRef = useRef<Set<string>>(new Set());
  const contentIcons = useContentIcons();

  const [openDropdown, setOpenDropdown] = useState<DropdownKey>(null);

  const [advancedSettingsEnabled, setAdvancedSettingsEnabled] = useLocalStorageBoolean(
    ADVANCED_SETTINGS_STORAGE_KEY,
  );
  const [firstLaunchGuideCompleted, setFirstLaunchGuideCompleted] = useLocalStorageBoolean(
    FIRST_LAUNCH_GUIDE_STORAGE_KEY,
  );
  const [guidePreviewDismissed, setGuidePreviewDismissed] = useState(false);
  const [guideRunRequested, setGuideRunRequested] = useState(false);
  const [guideNicknameEntered, setGuideNicknameEntered] = useState(false);
  const {
    appearances: buildCardAppearances,
    persistAppearances: persistBuildCardAppearances,
    getAppearance: getBuildCardAppearance,
  } = useBuildCardAppearances();
  const [buildSettingsTargetId, setBuildSettingsTargetId] = useState<string | null>(null);
  const [buildCardSettingsOpen, setBuildCardSettingsOpen] = useState(false);
  const [buildCardSettingsDraft, setBuildCardSettingsDraft] = useState<BuildCardAppearance>({
    ...DEFAULT_BUILD_CARD_APPEARANCE,
  });
  const [buildRuntimeSettingsDraft, setBuildRuntimeSettingsDraft] =
    useState<BuildRuntimeSettingsDraft>(() => getDefaultRuntimeSettingsDraft(4, 8, true));
  const [buildCardPreviewSize, setBuildCardPreviewSize] = useState<BuildCardPreviewSize | null>(
    null,
  );

  const { appearance, theme, setTheme } = useAppearance();
  const { toasts, pushToast, dismissToast } = useToasts();
  const win = useMemo(() => getCurrentWindow(), []);
  const closeStartedRef = useRef(false);
  const galleryRootRef = useRef<HTMLDivElement | null>(null);
  const openingPreviewRef = useRef<Animation | null>(null);
  const closePreviewTimerRef = useRef(0);
  const revealFrameRef = useRef(0);
  const revealTimerRef = useRef(0);
  const revealedElementRef = useRef<HTMLElement | null>(null);
  const wheelLockRef = useRef(false);
  const tabContentRef = useRef<HTMLDivElement | null>(null);
  const installProgressWindowOpeningRef = useRef(false);
  const installProgressWindowStateRef = useRef<InstallProgressWindowState>({
    busyMessage: "",
    progress: null,
  });
  const instanceCardRefs = useRef(new Map<string, HTMLButtonElement>());
  const dragEventRef = useRef<(payload: any) => void>(() => {});
  const createCardMeasureRef = useRef<HTMLDivElement | null>(null);

  const previewWindowAnimation = useCallback((payload: WindowAnimationPreviewPayload) => {
    if (closeStartedRef.current) return;

    openingPreviewRef.current?.cancel();
    openingPreviewRef.current = null;
    window.clearTimeout(closePreviewTimerRef.current);
    setPreviewCloseEffect(null);

    if (payload.kind === "opening") {
      window.requestAnimationFrame(() => {
        openingPreviewRef.current = playWindowOpeningPreview(
          galleryRootRef.current,
          payload.animation,
        );
      });
      return;
    }

    if (payload.animation === "none") return;
    window.requestAnimationFrame(() => setPreviewCloseEffect(payload.animation));
    closePreviewTimerRef.current = window.setTimeout(
      () => setPreviewCloseEffect(null),
      getCloseAnimationDuration(payload.animation) + 80,
    );
  }, []);

  const revealAppearanceTarget = useCallback(
    (target: AppearanceElementTarget) => {
      setOpenDropdown(null);
      if (target.tab) setActiveTab(target.tab);
      void win.setFocus();

      window.cancelAnimationFrame(revealFrameRef.current);
      window.clearTimeout(revealTimerRef.current);
      revealedElementRef.current?.classList.remove("appearance-reveal-target");
      revealedElementRef.current = null;

      let attempts = 0;
      const reveal = () => {
        const root = galleryRootRef.current;
        const element = root ? resolveElementTarget(root, target) : null;
        if (!element && attempts++ < 30) {
          revealFrameRef.current = window.requestAnimationFrame(reveal);
          return;
        }
        if (!root || !element) return;

        const refreshedTarget = createElementTarget(root, element, target.tab);
        if (refreshedTarget) {
          void emit(APPEARANCE_ELEMENT_PICKED_EVENT, refreshedTarget).catch(() => {});
        }

        element.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
        element.classList.add("appearance-reveal-target");
        revealedElementRef.current = element;
        revealTimerRef.current = window.setTimeout(() => {
          element.classList.remove("appearance-reveal-target");
          if (revealedElementRef.current === element) revealedElementRef.current = null;
        }, 2400);
      };
      revealFrameRef.current = window.requestAnimationFrame(reveal);
    },
    [win],
  );

  const updateDrawingCursor = useCallback((payload: DrawingCursorPayload) => {
    if (!payload.visible) {
      setDrawingCursor(null);
      return;
    }
    setDrawingCursor({
      visible: true,
      x: Math.min(1, Math.max(0, payload.x)),
      y: Math.min(1, Math.max(0, payload.y)),
      size: Math.min(42, Math.max(2, payload.size)),
      color: /^#[0-9a-f]{6}$/i.test(payload.color) ? payload.color : "#c2410c",
      eraser: Boolean(payload.eraser),
    });
  }, []);

  const liveElementOverrides = useMainAppearanceRuntime({
    rootRef: galleryRootRef,
    appearance,
    activeTab,
    onAnimationPreview: previewWindowAnimation,
    onRevealTarget: revealAppearanceTarget,
    onDrawingCursor: updateDrawingCursor,
  });

  useEffect(
    () => () => {
      openingPreviewRef.current?.cancel();
      window.clearTimeout(closePreviewTimerRef.current);
      window.cancelAnimationFrame(revealFrameRef.current);
      window.clearTimeout(revealTimerRef.current);
      revealedElementRef.current?.classList.remove("appearance-reveal-target");
    },
    [],
  );

  const optimizedJavaArgsEnabled = launcherSettings?.optimizedJavaArgs ?? true;

  useEffect(() => {
    const requestFakeDelete = (event: Event) => {
      const detail = (event as CustomEvent<{ instanceId?: string; instanceName?: string }>).detail;
      if (!detail?.instanceId) return;
      setMascotConfirmPendingId(detail.instanceId);
      setMascotConfirmPendingName(detail.instanceName || detail.instanceId);
    };
    const requestFakeContentDelete = (event: Event) => {
      const detail = (event as CustomEvent<{ kind?: ModrinthContentKind; projectId?: string }>)
        .detail;
      if (!detail?.kind || !detail.projectId) return;
      setMascotHiddenContentIds((current) => ({
        ...current,
        [detail.kind!]: current[detail.kind!].includes(detail.projectId!)
          ? current[detail.kind!]
          : [...current[detail.kind!], detail.projectId!],
      }));
    };
    const restoreFakeDeletes = () => {
      setMascotHiddenInstanceIds([]);
      setMascotHiddenContentIds({ mods: [], resourcepacks: [], shaders: [] });
      setMascotConfirmPendingId(null);
      setMascotConfirmPendingName("");
    };
    window.addEventListener(MASCOT_FAKE_DELETE_EVENT, requestFakeDelete);
    window.addEventListener(MASCOT_FAKE_CONTENT_DELETE_EVENT, requestFakeContentDelete);
    window.addEventListener(MASCOT_FAKE_RESTORE_EVENT, restoreFakeDeletes);
    return () => {
      window.removeEventListener(MASCOT_FAKE_DELETE_EVENT, requestFakeDelete);
      window.removeEventListener(MASCOT_FAKE_CONTENT_DELETE_EVENT, requestFakeContentDelete);
      window.removeEventListener(MASCOT_FAKE_RESTORE_EVENT, restoreFakeDeletes);
    };
  }, []);

  const getInstanceRuntimeSettingsDraft = (instance: InstanceItem): BuildRuntimeSettingsDraft => {
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
    const defaultRam = clampRamToSystem(launcherSettings?.defaultRamGb ?? createRamGb, systemRamGb);
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

  const measureBuildCardPreviewElement = (element: Element | null): BuildCardPreviewSize | null => {
    if (!(element instanceof HTMLElement)) return null;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  };

  const openBuildCardSettings = (targetId?: string | null) => {
    const resolvedTargetId = targetId === undefined ? (selectedInstance?.id ?? null) : targetId;
    const targetInstance = resolvedTargetId
      ? instances.find((instance) => instance.id === resolvedTargetId) || null
      : null;
    setBuildSettingsTargetId(resolvedTargetId);
    setBuildCardSettingsDraft(
      getBuildCardAppearance(resolvedTargetId ?? CREATE_BUILD_CARD_DRAFT_KEY),
    );
    setBuildRuntimeSettingsDraft(
      targetInstance
        ? getInstanceRuntimeSettingsDraft(targetInstance)
        : getCreateRuntimeSettingsDraft(),
    );
    setBuildCardSettingsOpen(true);
    setBuildCardPreviewSize(
      measureBuildCardPreviewElement(pickBuildCardPreviewSourceElement(resolvedTargetId)),
    );
  };

  const closeBuildCardSettings = () => {
    setBuildCardSettingsOpen(false);
    setBuildSettingsTargetId(null);
    setBuildCardSettingsDraft({ ...DEFAULT_BUILD_CARD_APPEARANCE });
    setBuildRuntimeSettingsDraft(
      getDefaultRuntimeSettingsDraft(4, systemRamGb, optimizedJavaArgsEnabled),
    );
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
            pinned: target.pinned,
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

      await persistBuildCardAppearances(next);
      closeBuildCardSettings();
    } catch (error) {
      logger.error(error);
      setActionError(toErrorMessage(error));
    }
  };

  const clearBuildCardSettings = async () => {
    const storageKey = buildSettingsTargetId ?? CREATE_BUILD_CARD_DRAFT_KEY;
    const next = { ...buildCardAppearances };
    delete next[storageKey];
    await persistBuildCardAppearances(next);
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
    [instances, selectedInstanceId],
  );

  const updateInstanceIdentity = async (
    id: string,
    changes: { name?: string; pinned?: boolean },
  ) => {
    const target = instances.find((instance) => instance.id === id);
    if (!target) return false;

    const nextName = (changes.name ?? target.name).trim();
    if (!nextName) {
      setActionError("Build name is empty");
      return false;
    }
    if (changes.name !== undefined && isRunning(id)) {
      setActionError("Stop the build before renaming it");
      return false;
    }

    try {
      setWorking(true);
      setActionError("");
      const updated = await invoke<InstanceItem>("update_instance", {
        payload: {
          id: target.id,
          name: nextName,
          pinned: changes.pinned ?? target.pinned,
          version: target.version,
          loader: target.loader,
          loaderVersion: target.loaderVersion ?? null,
          ram: target.ram,
          javaArgs: target.javaArgs ?? null,
          javaPath: target.javaPath ?? null,
          windowWidth: target.windowWidth ?? null,
          windowHeight: target.windowHeight ?? null,
          fullscreen: target.fullscreen ?? false,
        } satisfies UpdateInstancePayload,
      });
      setInstances((current) =>
        current.map((instance) => (instance.id === updated.id ? updated : instance)),
      );
      setSelectedInstanceId(updated.id);
      return true;
    } catch (error) {
      setActionError(toErrorMessage(error));
      return false;
    } finally {
      setWorking(false);
    }
  };

  const buildSettingsTargetInstance = buildSettingsTargetId
    ? instances.find((instance) => instance.id === buildSettingsTargetId) || null
    : null;
  const selectedBuildState = selectedInstance && isRunning(selectedInstance.id) ? "RUNNING" : "";
  const activePlayerName =
    accountType === "MICROSOFT"
      ? (msAccounts.find((account) => account.id === activeMsAccountId)?.username ?? nickname)
      : nickname;
  const resolve = usePlaceholders(
    instances,
    selectedInstance,
    systemRamGb,
    settingsRamDraft,
    accountType,
    activePlayerName,
    selectedBuildState,
  );
  const resolveForTarget = useCallback(
    (
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
          launcherRamGb: settingsRamDraft,
          playerName: activePlayerName,
          accountType: overrides.accountType ?? accountType,
          buildState: overrides.buildState ?? "",
        }),
      ),
    [accountType, activePlayerName, instances, settingsRamDraft, systemRamGb],
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
      const measured = measureBuildCardPreviewElement(sourceElement);
      setBuildCardPreviewSize((previous) =>
        previous?.width === measured?.width && previous?.height === measured?.height
          ? previous
          : measured,
      );
    };

    syncPreviewSize();

    const resizeObserver = new ResizeObserver(syncPreviewSize);
    resizeObserver.observe(sourceElement);

    return () => {
      resizeObserver.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-measures on these triggers; the source-element picker is read fresh inside
  }, [
    buildCardSettingsOpen,
    buildSettingsTargetId,
    selectedInstanceId,
    instances.length,
    createPreviewName,
    createPreviewVersion,
    createPreviewLoader,
    createPreviewRam,
  ]);

  const moddedInstances = useMemo(
    () => instances.filter((item) => item.loader.toLowerCase() !== "vanilla"),
    [instances],
  );

  const buildCardPreviewTarget: PlaceholderTarget = buildSettingsTargetInstance
    ? {
        ...buildSettingsTargetInstance,
        ram: buildCardSettingsOpen
          ? buildRuntimeSettingsDraft.ram
          : buildSettingsTargetInstance.ram,
      }
    : {
        name: createPreviewName,
        version: createPreviewVersion,
        loader: createPreviewLoader,
        loaderVersion: createLoaderVersion || null,
        ram: buildCardSettingsOpen ? buildRuntimeSettingsDraft.ram : createPreviewRam,
        playtimeSecs: 0,
        lastPlayed: "0",
        createdAt: "0",
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
    resolveBuildCardTags(appearance, (template) => resolveForTarget(template, target, overrides));

  const selectedModTarget = useMemo(
    () =>
      moddedInstances.find((item) => item.id === selectedInstanceId) || moddedInstances[0] || null,
    [moddedInstances, selectedInstanceId],
  );

  const modsContent = useModrinthContent({
    kind: "mods",
    activeTab,
    target: selectedModTarget,
    setActionError,
    setBusyMessage,
    pushToast,
  });
  const resourcePacksContent = useModrinthContent({
    kind: "resourcepacks",
    activeTab,
    target: selectedInstance,
    setActionError,
    setBusyMessage,
    pushToast,
  });
  const shadersContent = useModrinthContent({
    kind: "shaders",
    activeTab,
    target: selectedInstance,
    setActionError,
    setBusyMessage,
    pushToast,
  });

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
    [availableManifestVersions],
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
    const state: InstallProgressWindowState = {
      busyMessage,
      progress: installProgress,
    };
    installProgressWindowStateRef.current = state;
    persistInstallProgressWindowState(state);

    const syncProgressWindow = async () => {
      try {
        const existing = await WebviewWindow.getByLabel(INSTALL_PROGRESS_WINDOW_LABEL);

        if (!installProgress) {
          installProgressWindowOpeningRef.current = false;
          if (existing) {
            await existing.emit(INSTALL_PROGRESS_WINDOW_EVENT, state);
            window.setTimeout(() => {
              void existing.close();
            }, 120);
          }
          return;
        }

        if (existing) {
          await existing.emit(INSTALL_PROGRESS_WINDOW_EVENT, state);
          return;
        }

        if (installProgressWindowOpeningRef.current) return;
        installProgressWindowOpeningRef.current = true;

        const progressWindow = new WebviewWindow(INSTALL_PROGRESS_WINDOW_LABEL, {
          url: getInstallProgressWindowUrl(),
          title: "Build task",
          width: 520,
          height: 238,
          minWidth: 420,
          minHeight: 210,
          center: true,
          focus: true,
          resizable: false,
          decorations: false,
        });

        void progressWindow.once("tauri://created", () => {
          installProgressWindowOpeningRef.current = false;
          void progressWindow.emit(
            INSTALL_PROGRESS_WINDOW_EVENT,
            installProgressWindowStateRef.current,
          );
          void progressWindow.setFocus();
        });
        void progressWindow.once("tauri://error", (event) => {
          installProgressWindowOpeningRef.current = false;
          logger.error("install progress window create failed", event.payload);
        });
      } catch (error) {
        installProgressWindowOpeningRef.current = false;
        logger.error("install progress window sync failed", error);
      }
    };

    void syncProgressWindow();
  }, [busyMessage, installProgress]);
  useEffect(() => {
    const unlistenExit = win.listen<MinecraftExitPayload>("minecraft-process-exited", (event) => {
      const payload = event.payload;
      const stopKey = `${payload.instanceId}:${payload.pid}`;
      const stoppedByUser = consumeIntentionalStop(stopKey, payload.instanceId);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- subscribe to the exit event once; handlers read latest state via closure
  }, [win]);

  useEffect(() => {
    const closeMenus = () => setOpenDropdown(null);
    window.addEventListener("click", closeMenus);
    return () => window.removeEventListener("click", closeMenus);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Alt" || !altSourceHoveredRef.current || !altHoverRef.current) return;

      const { items, label, el, ownerId } = altHoverRef.current;
      if (items.length > 0) {
        setListPreview({ items, label, rect: el.getBoundingClientRect(), ownerId });
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== "Alt") return;
      setListPreview(null);
      if (!altSourceHoveredRef.current) altHoverRef.current = null;
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
      logger.error("get_modrinth_project_icons failed", error);
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
    const kind = previewContentKind(listPreview.label);
    if (kind) {
      void contentIcons.requestIcons(
        listPreview.items
          .filter((item) => item.source !== "modrinth")
          .map((item) => ({ title: item.title, kind })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch only when the hovered preview changes
  }, [listPreview]);

  const getExportedItemIconUrl = (item: ExportedItem, kind: ContentIconKind | null) => {
    if (item.iconUrl) return item.iconUrl;
    if (item.source === "modrinth" && item.projectId) {
      return modrinthProjectIcons[item.projectId] ?? null;
    }
    return kind ? contentIcons.getIconUrl({ title: item.title, kind }) : null;
  };

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const [
          manifestResponse,
          instanceResponse,
          systemRamResponse,
          settingsResponse,
          msAccountsResponse,
        ] = await Promise.all([
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
          setActiveMsAccountId((current) =>
            current && msAccountsResponse.some((account) => account.id === current)
              ? current
              : msAccountsResponse[0].id,
          );
        } else {
          setActiveMsAccountId(null);
          setAccountType("OFFLINE");
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
        logger.error(error);
      }
    };

    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time bootstrap on mount
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
          setCreateError(
            "No compatible " + createLoader + " versions for Minecraft " + createVersion,
          );
        }
        setCreateLoaderVersion((current) => {
          if (current && versions.includes(current)) return current;
          return versions[0] || "";
        });
      } catch (error) {
        logger.error(error);
        setLoaderVersions([]);
        setCreateLoaderVersion("");
        setCreateError(toErrorMessage(error));
      } finally {
        setLoaderVersionsLoading(false);
      }
    };

    void syncLoaderVersions();
  }, [createLoader, createVersion]);

  useEffect(() => {
    const processes = runtimeMonitor.snapshot?.processes;
    if (!processes) return;
    for (const [id, pid] of runningInstances) {
      const process = processes.find((candidate) => candidate.pid === pid);
      if (process && !process.alive) {
        void handleInstanceStopped(id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the shared monitor owns cadence; this effect only consumes snapshots
  }, [runtimeMonitor.snapshot?.processes, runningInstances]);

  useEffect(() => {
    if (!launcherSettings) return;
    applyDiscordRpcPresence(launcherSettings, runningInstances);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- these are the real presence triggers; the helper is recreated each render
  }, [
    launcherSettings,
    runningInstances,
    selectedInstanceId,
    accountType,
    nickname,
    activeMsAccountId,
    msAccounts,
  ]);

  const tearPath = useMemo(createTearPath, []);
  const shredPaths = useMemo(createShredPaths, []);

  const refreshInstances = async (preferredId?: string) => {
    const fresh = await invoke<InstanceItem[]>("list_instances");
    setInstances(fresh);

    if (fresh.length === 0) {
      setSelectedInstanceId("");
      return;
    }

    const storedInstanceId = window.localStorage.getItem(SELECTED_INSTANCE_STORAGE_KEY);
    const preferredInstance = pickPreferredInstance(fresh, storedInstanceId) || fresh[0];
    const target =
      (preferredId && fresh.find((i) => i.id === preferredId)?.id) || preferredInstance.id;
    setSelectedInstanceId(target);
  };

  const {
    exportInstanceId,
    setExportInstanceId,
    exportData,
    exportOptions,
    setExportOptions,
    exportWorking,
    exportError,
    handleExportInstance,
    handleExportDownload,
    handleExportMrpack,
    importModalOpen,
    setImportModalOpen,
    importData,
    setImportData,
    importOptions,
    setImportOptions,
    importCustomName,
    setImportCustomName,
    importWorking,
    importError,
    importResult,
    importProgress,
    importCancelRequested,
    setImportError,
    setImportSourcePath,
    importSourceFormat,
    importBuildFromPath,
    handleImportBuild,
    handleImportConfirm,
    handleImportCancel,
  } = useInstanceTransfers({
    defaultRamGb: launcherSettings?.defaultRamGb ?? 4,
    refreshInstances,
    pushToast,
  });

  const beginClose = useCallback(
    (requestedEffect: CloseAnimationId) => {
      if (closeStartedRef.current) return;

      closeStartedRef.current = true;
      openingPreviewRef.current?.cancel();
      window.clearTimeout(closePreviewTimerRef.current);
      setPreviewCloseEffect(null);
      const effect = appearance.motion.enabled ? requestedEffect : "none";
      if (effect !== "none") setCloseEffect(effect);

      void invoke("stop_discord_rpc_for_instance", { instanceId: null }).catch((error) => {
        logger.error("stop_discord_rpc_for_instance failed", error);
      });
      window.setTimeout(() => {
        void invoke("exit_launcher").catch((error) => {
          logger.error("exit_launcher failed", error);
        });
      }, getCloseAnimationDuration(effect));
    },
    [appearance.motion.enabled],
  );

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let mounted = true;

    void win
      .onCloseRequested((event) => {
        event.preventDefault();
        beginClose(appearance.motion.closeSystem);
      })
      .then((dispose) => {
        if (mounted) {
          unlisten = dispose;
        } else {
          dispose();
        }
      });

    return () => {
      mounted = false;
      unlisten?.();
    };
  }, [appearance.motion.closeSystem, beginClose, win]);

  const handleClose = () => {
    beginClose(appearance.motion.closeButton);
  };

  const handleCustomizeAppearance = useCallback(() => {
    void openAppearanceStudioWindow().catch((error) => {
      pushToast("error", toErrorMessage(error), { title: "Couldn't open Appearance Studio" });
    });
  }, [pushToast]);

  useEffect(() => {
    const openStudioFromShortcut = (event: KeyboardEvent) => {
      if (event.repeat || !isAppearanceStudioShortcut(event)) return;
      event.preventDefault();
      handleCustomizeAppearance();
    };

    window.addEventListener("keydown", openStudioFromShortcut);
    return () => window.removeEventListener("keydown", openStudioFromShortcut);
  }, [handleCustomizeAppearance]);

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
    setOpenDropdown(null);

    if (!appearance.customized) {
      // Keep the launcher's original transition for every built-in theme.
      setTabAnimating(true);
      setActiveTab(nextTab);
      window.setTimeout(() => setTabAnimating(false), 360);
      return;
    }

    setTabAnimating(false);
    setActiveTab(nextTab);
    const animation = resolveTabAnimation(appearance, nextTab);
    const duration = appearance.motion.uiStyle === "snappy" ? 190 : 360;
    window.requestAnimationFrame(() => {
      playTabTransition(tabContentRef.current, animation, duration);
    });
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

    window.setTimeout(
      () => {
        wheelLockRef.current = false;
      },
      appearance.motion.enabled ? (appearance.motion.uiStyle === "snappy" ? 260 : 520) : 80,
    );
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

  const saveSettingsRam = async (requestedValue = settingsRamDraft) => {
    try {
      const value = clampRamToSystem(requestedValue, systemRamGb);
      const updated = await invoke<LauncherSettings>("set_default_ram_gb", { ram: value });
      const normalized = clampRamToSystem(updated.defaultRamGb, systemRamGb);
      setLauncherSettings(updated);
      setSettingsRamDraft(normalized);
      setCreateRamGb(normalized);
    } catch (error) {
      logger.error(error);
      setActionError(toErrorMessage(error));
      pushToast("error", toErrorMessage(error), { title: "Couldn't save RAM" });
    }
  };

  const saveOptimizedJavaArgs = async (enabled: boolean) => {
    try {
      const updated = await invoke<LauncherSettings>("set_optimized_java_args", { enabled });
      setLauncherSettings(updated);
    } catch (error) {
      logger.error(error);
      setActionError(toErrorMessage(error));
      pushToast("error", toErrorMessage(error), { title: "Couldn't save setting" });
    }
  };

  const saveAutoDownloadJava = async (enabled: boolean) => {
    try {
      const updated = await invoke<LauncherSettings>("set_auto_download_java", { enabled });
      setLauncherSettings(updated);
    } catch (error) {
      logger.error(error);
      setActionError(toErrorMessage(error));
      pushToast("error", toErrorMessage(error), { title: "Couldn't save setting" });
    }
  };

  const saveMascotEnabled = async (enabled: boolean) => {
    try {
      const updated = await invoke<LauncherSettings>("set_mascot_enabled", { enabled });
      setLauncherSettings(updated);
    } catch (error) {
      logger.error(error);
      setActionError(toErrorMessage(error));
      pushToast("error", toErrorMessage(error), { title: "Couldn't save mascot setting" });
    }
  };

  const saveMascotSettings = async (mascot: MascotSettings) => {
    try {
      const updated = await invoke<LauncherSettings>("set_mascot_settings", { mascot });
      setLauncherSettings(updated);
    } catch (error) {
      logger.error(error);
      setActionError(toErrorMessage(error));
      pushToast("error", toErrorMessage(error), { title: "Couldn't save mascot settings" });
    }
  };

  const saveNetworkSettings = async (mirror: string) => {
    try {
      const updated = await invoke<LauncherSettings>("set_network_settings", {
        mirror,
      });
      setLauncherSettings(updated);
    } catch (error) {
      logger.error(error);
      setActionError(toErrorMessage(error));
      pushToast("error", toErrorMessage(error), { title: "Couldn't save network" });
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
      logger.error(error);
      setActionError(toErrorMessage(error));
      pushToast("error", toErrorMessage(error), { title: "Couldn't save plugins" });
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
        : getDefaultRuntimeSettingsDraft(createRamGb, systemRamGb, optimizedJavaArgsEnabled);

      const created = await invoke<InstanceItem>("create_instance", {
        payload: {
          name: cleanName,
          version: createVersion,
          loader: createLoader,
          loaderVersion: createLoader !== "Vanilla" ? createLoaderVersion : null,
          ram: createRuntime.ram,
          javaArgs: createRuntimeSettingsTouched ? createRuntime.javaArgs : null,
          javaPath:
            createRuntimeSettingsTouched && createRuntime.javaPath ? createRuntime.javaPath : null,
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
      await persistBuildCardAppearances(nextAppearances);

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
      logger.error(error);
      setCreateError(toErrorMessage(error));
      pushToast("error", toErrorMessage(error), { title: "Create failed" });
    } finally {
      setWorking(false);
    }
  };

  const handleInstallSelected = async () => {
    if (!selectedInstance) return;

    try {
      setWorking(true);
      setActionError("");
      setFailedBuildAction(null);
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
      pushToast("info", `Файлы ${selectedInstance.name} установлены`, {
        title: "Install complete",
      });
    } catch (error) {
      logger.error(error);
      setFailedBuildAction({ id: selectedInstance.id, action: "install" });
      setActionError(toErrorMessage(error));
      pushToast("error", toErrorMessage(error), { title: "Install failed" });
      await refreshInstances(selectedInstance.id).catch((refreshError) =>
        logger.error(refreshError),
      );
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
    if (accountType === "MICROSOFT" && !activeMsAccountId) {
      setActionError("Select a Microsoft account before launching");
      setShowMsModal(true);
      return;
    }

    setSelectedInstanceId(target.id);

    try {
      setWorking(true);
      setActionError("");
      setFailedBuildAction(null);
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
      logger.error(error);
      const message = toErrorMessage(error);
      setFailedBuildAction({ id: target.id, action: "launch" });
      setActionError(message);
      pushToast("error", message, { title: `${target.name} failed to start` });
      await refreshInstances(target.id).catch((refreshError) => logger.error(refreshError));
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

  const handleStopGame = async (instanceId: string) => {
    const pid = runningInstances.get(instanceId);
    if (pid === undefined) return;

    setActionError("");
    setBusyMessage("Stopping Minecraft...");

    try {
      markIntentionalStop(`${instanceId}:${pid}`);
      const result = await invoke<ActionResult>("stop_instance", { pid });
      if (result.message.includes("force-stopped")) {
        pushToast("warning", result.message, { title: "Forced stop" });
      }
    } catch (error) {
      logger.error(error);
      const stillAlive = await invoke<boolean>("is_process_alive", { pid }).catch(() => true);
      if (stillAlive) {
        clearIntentionalStop(`${instanceId}:${pid}`);
        setActionError(toErrorMessage(error));
        pushToast("error", toErrorMessage(error), { title: "Stop failed" });
        setBusyMessage("");
        return;
      }
    }

    const stillAlive = await invoke<boolean>("is_process_alive", { pid }).catch(() => false);
    if (stillAlive) {
      setActionError("Minecraft is still running after the stop request.");
      pushToast("warning", "Minecraft всё ещё работает после команды остановки.", {
        title: "Still running",
      });
      setBusyMessage("");
      return;
    }

    void handleInstanceStopped(instanceId);
    setBusyMessage("");
  };

  const handleDeleteInstance = async (instanceId: string) => {
    if (working) return;
    if (isRunning(instanceId)) {
      pushToast("warning", "Сначала останови игру, затем перемести сборку в корзину.", {
        title: "Build is running",
      });
      return;
    }
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
      pushToast("info", `Сборка ${deletedName} перемещена в корзину`.trim(), {
        title: "Build moved to trash",
      });
      await refreshInstances();
    } catch (error) {
      logger.error(error);
      setActionError(toErrorMessage(error));
      pushToast("error", toErrorMessage(error), { title: "Delete failed" });
    }
  };

  const openTrash = async () => {
    setTrashOpen(true);
    setTrashError("");
    try {
      setDeletedInstances(await invoke<InstanceItem[]>("list_deleted_instances"));
    } catch (error) {
      setTrashError(toErrorMessage(error));
    }
  };

  const restoreDeleted = async (id: string) => {
    setTrashWorking(true);
    setTrashError("");
    try {
      const restored = await invoke<InstanceItem>("restore_instance", { instanceId: id });
      setDeletedInstances(await invoke<InstanceItem[]>("list_deleted_instances"));
      await refreshInstances(restored.id);
      pushToast("info", `Сборка ${restored.name} восстановлена`, { title: "Build restored" });
    } catch (error) {
      setTrashError(toErrorMessage(error));
    } finally {
      setTrashWorking(false);
    }
  };

  const purgeDeleted = async (id: string) => {
    setTrashWorking(true);
    setTrashError("");
    try {
      await invoke("purge_deleted_instance", { instanceId: id });
      setDeletedInstances(await invoke<InstanceItem[]>("list_deleted_instances"));
      if (buildCardAppearances[id]) {
        const nextAppearances = { ...buildCardAppearances };
        delete nextAppearances[id];
        await persistBuildCardAppearances(nextAppearances);
      }
      pushToast("info", "Сборка удалена окончательно", { title: "Build deleted" });
    } catch (error) {
      setTrashError(toErrorMessage(error));
    } finally {
      setTrashWorking(false);
    }
  };

  const openWorldBackups = async (id: string) => {
    setBackupsInstanceId(id);
    setBackupsError("");
    setWorldBackups([]);
    try {
      setWorldBackups(await invoke<WorldBackupInfo[]>("list_world_backups", { instanceId: id }));
    } catch (error) {
      setBackupsError(toErrorMessage(error));
    }
  };

  const createWorldBackup = async () => {
    if (!backupsInstanceId || isRunning(backupsInstanceId)) return;
    setBackupsWorking(true);
    setBackupsError("");
    try {
      await invoke<WorldBackupInfo>("create_world_backup", { instanceId: backupsInstanceId });
      setWorldBackups(
        await invoke<WorldBackupInfo[]>("list_world_backups", { instanceId: backupsInstanceId }),
      );
      pushToast("info", "Резервная копия миров создана", { title: "World backup" });
    } catch (error) {
      setBackupsError(toErrorMessage(error));
    } finally {
      setBackupsWorking(false);
    }
  };

  const restoreWorldBackup = async (backupId: string) => {
    if (!backupsInstanceId || isRunning(backupsInstanceId)) return;
    setBackupsWorking(true);
    setBackupsError("");
    try {
      await invoke("restore_world_backup", { instanceId: backupsInstanceId, backupId });
      setWorldBackups(
        await invoke<WorldBackupInfo[]>("list_world_backups", { instanceId: backupsInstanceId }),
      );
      pushToast("info", "Миры восстановлены; предыдущие миры сохранены отдельной копией", {
        title: "Worlds restored",
      });
    } catch (error) {
      setBackupsError(toErrorMessage(error));
    } finally {
      setBackupsWorking(false);
    }
  };

  const deleteWorldBackup = async (backupId: string) => {
    if (!backupsInstanceId || backupsWorking) return;
    setBackupsWorking(true);
    setBackupsError("");
    try {
      await invoke("delete_world_backup", { instanceId: backupsInstanceId, backupId });
      setWorldBackups((current) => current.filter((backup) => backup.id !== backupId));
      pushToast("info", "Резервная копия миров удалена", { title: "World backup deleted" });
    } catch (error) {
      setBackupsError(toErrorMessage(error));
    } finally {
      setBackupsWorking(false);
    }
  };

  const handleMascotDeleteConfirmed = () => {
    if (!mascotConfirmPendingId) return;
    const id = mascotConfirmPendingId;
    const hiddenName = mascotConfirmPendingName;
    setMascotHiddenInstanceIds((current) => (current.includes(id) ? current : [...current, id]));
    setMascotConfirmPendingId(null);
    setMascotConfirmPendingName("");
    if (selectedInstanceId === id) {
      const nextVisible = instances.find(
        (instance) => instance.id !== id && !mascotHiddenInstanceIds.includes(instance.id),
      );
      if (nextVisible) setSelectedInstanceId(nextVisible.id);
    }
    pushToast("warning", `Заяц спрятал ${hiddenName} только из списка — файлы не удалены.`, {
      title: "Mascot chaos",
    });
  };

  const handleOpenFolder = async () => {
    if (!selectedInstance) return;

    try {
      setActionError("");
      await invoke<ActionResult>("open_instance_folder", { instanceId: selectedInstance.id });
    } catch (error) {
      logger.error(error);
      setActionError(toErrorMessage(error));
      pushToast("error", toErrorMessage(error), { title: "Couldn't open folder" });
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
      pushToast("warning", "Перетащи .jar/.zip на сборку или .mrpack/.slbuild для импорта", {
        title: "Nothing to install",
      });
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
      pushToast("error", toErrorMessage(err), { title: "Install failed" });
    }
  };

  // Reassigned every render so the one-time listener always sees fresh state.
  dragEventRef.current = (payload: any) => {
    if (payload.type === "enter") {
      const kind = classifyDragPaths(payload.paths ?? []);
      setDragKind(kind);
      setDragOverInstanceId(
        kind === "content" ? findInstanceAtPoint(payload.position.x, payload.position.y) : null,
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

  const mascotVisibleInstances = instances.filter(
    (instance) => !mascotHiddenInstanceIds.includes(instance.id),
  );
  const mascotVisibleSelectedInstance =
    mascotVisibleInstances.find((instance) => instance.id === selectedInstanceId) ??
    mascotVisibleInstances[0] ??
    null;

  const renderMainContent = () => {
    switch (activeTab) {
      case "overview":
        return (
          <OverviewTab
            selectedInstance={selectedInstance}
            isRunning={isRunning}
            resolve={resolve}
            handleStopGame={handleStopGame}
            handleLaunchSelected={handleLaunchSelected}
            working={working}
            setTabAnimated={setTabAnimated}
          />
        );
      case "instances":
        return (
          <InstancesTab
            instances={mascotVisibleInstances}
            selectedInstance={mascotVisibleSelectedInstance}
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
            failedBuildAction={failedBuildAction}
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
            handleStopGame={handleStopGame}
            handleDeleteInstance={handleDeleteInstance}
            handleExportInstance={handleExportInstance}
            handleImportBuild={handleImportBuild}
            onOpenTrash={() => void openTrash()}
            onOpenWorldBackups={(id) => void openWorldBackups(id)}
            handleOpenFolder={handleOpenFolder}
            handleRenameInstance={(id, name) => updateInstanceIdentity(id, { name })}
            handleTogglePin={(id, pinned) => updateInstanceIdentity(id, { pinned })}
            setStatsInstanceId={setStatsInstanceId}
            setScreenshotsInstanceId={setScreenshotsInstanceId}
            openBuildCardSettings={openBuildCardSettings}
          />
        );
      case "mods":
        return (
          <ModrinthContentTab
            kind="mods"
            controller={modsContent}
            targetInstances={moddedInstances}
            selectedTarget={selectedModTarget}
            setSelectedInstanceId={setSelectedInstanceId}
            openDropdown={openDropdown}
            setOpenDropdown={setOpenDropdown}
            resolveForTarget={resolveForTarget}
            mascotHiddenProjectIds={mascotHiddenContentIds.mods}
            requestLocalIcons={contentIcons.requestIcons}
            getLocalIconUrl={contentIcons.getIconUrl}
            projectIcons={modrinthProjectIcons}
            requestProjectIcons={requestModrinthProjectIcons}
          />
        );
      case "resourcepacks":
        return (
          <ModrinthContentTab
            kind="resourcepacks"
            controller={resourcePacksContent}
            targetInstances={instances}
            selectedTarget={selectedInstance}
            setSelectedInstanceId={setSelectedInstanceId}
            openDropdown={openDropdown}
            setOpenDropdown={setOpenDropdown}
            resolveForTarget={resolveForTarget}
            mascotHiddenProjectIds={mascotHiddenContentIds.resourcepacks}
            requestLocalIcons={contentIcons.requestIcons}
            getLocalIconUrl={contentIcons.getIconUrl}
            projectIcons={modrinthProjectIcons}
            requestProjectIcons={requestModrinthProjectIcons}
          />
        );
      case "shaders":
        return (
          <ModrinthContentTab
            kind="shaders"
            controller={shadersContent}
            targetInstances={instances}
            selectedTarget={selectedInstance}
            setSelectedInstanceId={setSelectedInstanceId}
            openDropdown={openDropdown}
            setOpenDropdown={setOpenDropdown}
            resolveForTarget={resolveForTarget}
            mascotHiddenProjectIds={mascotHiddenContentIds.shaders}
            requestLocalIcons={contentIcons.requestIcons}
            getLocalIconUrl={contentIcons.getIconUrl}
            projectIcons={modrinthProjectIcons}
            requestProjectIcons={requestModrinthProjectIcons}
          />
        );
      case "settings":
        return (
          <SettingsTab
            systemRamGb={systemRamGb}
            settingsRamDraft={settingsRamDraft}
            resolve={resolve}
            setSettingsRamDraft={setSettingsRamDraft}
            saveSettingsRam={saveSettingsRam}
            optimizedJavaArgs={launcherSettings?.optimizedJavaArgs ?? true}
            saveOptimizedJavaArgs={saveOptimizedJavaArgs}
            autoDownloadJava={launcherSettings?.autoDownloadJava ?? true}
            saveAutoDownloadJava={saveAutoDownloadJava}
            mascotEnabled={launcherSettings?.mascotEnabled ?? false}
            saveMascotEnabled={saveMascotEnabled}
            mascotSettings={launcherSettings?.mascot ?? DEFAULT_MASCOT_SETTINGS}
            saveMascotSettings={saveMascotSettings}
            mirrorMode={launcherSettings?.network?.mirror ?? "auto"}
            saveNetworkSettings={saveNetworkSettings}
            wheelTabSwitching={wheelTabSwitching}
            setWheelTabSwitching={setWheelTabSwitching}
            showSnapshots={showSnapshots}
            setShowSnapshots={setShowSnapshots}
            showPreReleases={showPreReleases}
            setShowPreReleases={setShowPreReleases}
            advancedSettingsEnabled={advancedSettingsEnabled}
            onToggleAdvanced={() => setAdvancedSettingsEnabled((prev) => !prev)}
            pluginsSettings={launcherSettings?.plugins}
            savePluginsSettings={saveLauncherPlugins}
            launcherNickname={nickname}
            launcherAccountType={accountType}
            launcherMsAccountId={activeMsAccountId}
            microsoftAccounts={msAccounts}
            theme={theme}
            setTheme={setTheme}
            appearanceCustomized={appearance.customized}
            onCustomizeAppearance={handleCustomizeAppearance}
          />
        );
      default:
        return null;
    }
  };

  const mascotEnabled = launcherSettings?.mascotEnabled ?? false;
  const firstLaunchGuideActive =
    phase === "ready" &&
    launcherSettings !== null &&
    !guidePreviewDismissed &&
    (FORCE_FIRST_LAUNCH_GUIDE_PREVIEW || guideRunRequested || !firstLaunchGuideCompleted) &&
    !showMsModal &&
    !buildCardSettingsOpen;

  const finishFirstLaunchGuide = () => {
    setFirstLaunchGuideCompleted(true);
    setGuidePreviewDismissed(true);
    setGuideRunRequested(false);
  };

  const startLauncherGuide = () => {
    setOpenDropdown(null);
    setGuidePreviewDismissed(false);
    setGuideRunRequested(true);
  };

  const handleGuideNicknameEdit = (value: string) => {
    if (firstLaunchGuideActive) setGuideNicknameEntered(value.trim().length > 0);
  };

  const handleGuideStepChange = useCallback((step: (typeof LAUNCHER_GUIDE_STEPS)[number]) => {
    setOpenDropdown(null);
    if (step.tab) setActiveTab(step.tab);
  }, []);

  const mainUI = (
    <div className="ui-container" onWheel={onWheelTabs}>
      <div className="appearance-background appearance-background--launcher" />
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
          <button
            onClick={startLauncherGuide}
            type="button"
            data-guide-target="guide-replay"
            aria-label="Запустить тур по лаунчеру"
          >
            GUIDE
          </button>
          <button onClick={() => void win.minimize()} type="button">
            MINIMIZE
          </button>
          <button onClick={() => void handleMaximize()} type="button">
            EXPAND
          </button>
          <button onClick={() => void handleClose()} className="close-btn" type="button">
            CLOSE
          </button>
        </div>
      </header>

      <main className="gallery-content">
        <aside className="sidebar">
          <div className="sidebar-main">
            <div className="sidebar-session-summary">
              <div data-guide-target="player-summary">
                <small>PLAYER</small>
                <strong
                  data-tooltip={resolve("%player_name%")}
                  data-guide-value
                  {...createPlaceholderAppearanceAttributes("%player_name%", resolve)}
                >
                  {resolve("%player_name%")}
                </strong>
              </div>
              <div>
                <small>BUILD</small>
                <strong
                  data-tooltip={resolve("%build_name%")}
                  {...createPlaceholderAppearanceAttributes("%build_name%", resolve)}
                >
                  {resolve("%build_name%")}
                </strong>
              </div>
            </div>

            <nav
              className={`side-nav${
                appearance.customized &&
                TAB_ORDER.every((tab) => appearance.navigation.legacyTabs.includes(tab))
                  ? " legacy-layout"
                  : ""
              }`}
              aria-label="Launcher sections"
              data-guide-target="navigation"
            >
              {TAB_ORDER.map((tab) => (
                <button
                  key={tab}
                  className={`${activeTab === tab ? "active" : ""}${
                    appearance.customized && appearance.navigation.legacyTabs.includes(tab)
                      ? " legacy"
                      : ""
                  }`.trim()}
                  onClick={() => setTabAnimated(tab)}
                  type="button"
                  aria-current={activeTab === tab ? "page" : undefined}
                  data-tab-key={tab}
                >
                  <span>{TAB_INDEX[tab].replace(".", "")}</span>
                  <strong>{TAB_TITLE[tab]}</strong>
                </button>
              ))}
            </nav>
          </div>
        </aside>

        <section
          className={`main-stage ${activeTab === "overview" ? "with-right-panel" : "no-right-panel"}`}
        >
          <div
            ref={tabContentRef}
            className={`content-wrap launcher-wrap ${tabAnimating ? "tab-animated" : ""}`}
          >
            {renderMainContent()}
          </div>

          {activeTab === "overview" && selectedInstance && (
            <OverviewPanel
              resolve={resolve}
              nickname={nickname}
              setNickname={setNickname}
              onNicknameEdit={handleGuideNicknameEdit}
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
            <Suspense fallback={null}>
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
            </Suspense>
          )}
        </section>
      </main>

      <footer className="gallery-footer">
        <div className="footer-left">SCREENLAUNCHER / {TAB_TITLE[activeTab]}</div>
        <div className="footer-right">CREATE / INSTALL / PLAY ↓</div>
      </footer>

      <Suspense fallback={null}>
        <LauncherMascot
          activeIndex={TAB_ORDER.indexOf(activeTab)}
          enabled={mascotEnabled && !firstLaunchGuideActive}
          settings={launcherSettings?.mascot ?? DEFAULT_MASCOT_SETTINGS}
        />
      </Suspense>

      <LauncherGuide
        active={firstLaunchGuideActive}
        containerRef={galleryRootRef}
        steps={LAUNCHER_GUIDE_STEPS}
        onComplete={finishFirstLaunchGuide}
        onSkip={finishFirstLaunchGuide}
        onStepChange={handleGuideStepChange}
        stepCompletion={{ nickname: guideNicknameEntered || nickname.trim().length > 0 }}
      />
    </div>
  );
  const renderedCloseEffect = closeEffect ?? previewCloseEffect;
  let drawingCursorStyle: CSSProperties | undefined;
  if (drawingCursor) {
    const rootWidth = galleryRootRef.current?.clientWidth || 960;
    const rootHeight = galleryRootRef.current?.clientHeight || 540;
    const mappedCursor = mapDrawingCursorToCover(drawingCursor, rootWidth, rootHeight);
    drawingCursorStyle = {
      left: `${mappedCursor.x}px`,
      top: `${mappedCursor.y}px`,
      "--drawing-brush-size": `${mappedCursor.diameter}px`,
      "--drawing-brush-color": drawingCursor.color,
    } as CSSProperties;
  }
  const canvasMainUI = (
    <CanvasUiEffectHost
      config={{
        ...appearance.canvasUi,
        enabled: appearance.customized && appearance.canvasUi.enabled,
      }}
    >
      {mainUI}
    </CanvasUiEffectHost>
  );

  return (
    <RuntimeMonitorScope controller={runtimeMonitor}>
      <div
        ref={galleryRootRef}
        className={`gallery-root ${phase} ${
          renderedCloseEffect ? CLOSE_EFFECT_CLASS[renderedCloseEffect] : ""
        }`}
        {...createPlaceholderValueAttributes(resolve)}
      >
        {drawingCursor && drawingCursorStyle && (
          <div
            className={`appearance-drawing-cursor${drawingCursor.eraser ? " eraser" : ""}`}
            style={drawingCursorStyle}
            aria-hidden="true"
          >
            <span className="appearance-drawing-brush-dot" />
            {!drawingCursor.eraser && <span className="appearance-drawing-pencil-icon" />}
          </div>
        )}
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
        {dragKind === "content" &&
          !dragOverInstanceId &&
          (() => {
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
                    {fallbackName
                      ? `ОТПУСТИ — В СБОРКУ ${fallbackName.toUpperCase()}`
                      : "ВЫБЕРИ СБОРКУ"}
                  </strong>
                  <span>{fallbackName ? ".jar / .zip" : "сначала выбери сборку"}</span>
                </div>
              </div>
            );
          })()}
        {!renderedCloseEffect ? (
          canvasMainUI
        ) : renderedCloseEffect === "tear" ? (
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
        ) : renderedCloseEffect === "shred" ? (
          <div className="shred-stack" aria-hidden="true">
            {shredPaths.map((strip, index) => (
              <div
                key={index}
                className="shred-strip"
                style={
                  {
                    clipPath: strip.clipPath,
                    animationDelay: `${strip.delay}ms`,
                    "--shred-x": strip.x,
                    "--shred-y": strip.y,
                    "--shred-rotate": strip.rotate,
                    "--shred-kick-x": strip.kickX,
                    "--shred-kick-y": strip.kickY,
                  } as CSSProperties
                }
              >
                <div className="fixed-content">{mainUI}</div>
              </div>
            ))}
          </div>
        ) : (
          mainUI
        )}

        {appearance.customized && (
          <CanvasUiElementEffects
            rootRef={galleryRootRef}
            overrides={liveElementOverrides}
            activeTab={activeTab}
          />
        )}

        {buildCardSettingsOpen && (
          <BuildCardSettingsPopup
            isCreateMode={!buildSettingsTargetId}
            instanceId={buildSettingsTargetId ?? null}
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

        {statsInstanceId &&
          (() => {
            const si = instances.find((i) => i.id === statsInstanceId);
            return si ? (
              <Suspense fallback={null}>
                <BuildStatsModal instance={si} onClose={() => setStatsInstanceId(null)} />
              </Suspense>
            ) : null;
          })()}

        {screenshotsInstanceId &&
          (() => {
            const si = instances.find((i) => i.id === screenshotsInstanceId);
            return si ? (
              <Suspense fallback={null}>
                <BuildScreenshotsModal
                  instance={si}
                  onClose={() => setScreenshotsInstanceId(null)}
                />
              </Suspense>
            ) : null;
          })()}

        {confirmPendingId && (
          <div
            className="confirm-overlay"
            onClick={() => {
              setConfirmPendingId(null);
              setConfirmPendingName("");
            }}
          >
            <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
              <span className="confirm-label">DELETE BUILD</span>
              <p className="confirm-title">{confirmPendingName}</p>
              <p className="confirm-body">
                Сборка будет скрыта из списка. Файлы останутся на диске, и сборку можно будет
                восстановить из корзины.
              </p>
              <div className="confirm-actions">
                <button
                  className="primary-action kill-action confirm-btn-delete"
                  type="button"
                  onClick={handleDeleteConfirmed}
                >
                  MOVE TO TRASH
                </button>
                <button
                  className="ghost-action"
                  type="button"
                  onClick={() => {
                    setConfirmPendingId(null);
                    setConfirmPendingName("");
                  }}
                >
                  CANCEL
                </button>
              </div>
            </div>
          </div>
        )}

        {trashOpen && (
          <DeletedBuildsModal
            items={deletedInstances}
            working={trashWorking}
            error={trashError}
            onClose={() => setTrashOpen(false)}
            onRestore={(id) => void restoreDeleted(id)}
            onPurge={(id) => void purgeDeleted(id)}
          />
        )}
        {backupsInstanceId &&
          (() => {
            const instance = instances.find((item) => item.id === backupsInstanceId);
            return instance ? (
              <WorldBackupsModal
                instance={instance}
                backups={worldBackups}
                working={backupsWorking}
                running={isRunning(instance.id)}
                error={backupsError}
                onClose={() => setBackupsInstanceId(null)}
                onCreate={() => void createWorldBackup()}
                onRestore={(id) => void restoreWorldBackup(id)}
                onDelete={(id) => void deleteWorldBackup(id)}
              />
            ) : null;
          })()}

        {/* ── Export modal ── */}
        {mascotConfirmPendingId && (
          <div
            className="confirm-overlay"
            onClick={() => {
              setMascotConfirmPendingId(null);
              setMascotConfirmPendingName("");
            }}
          >
            <div className="confirm-dialog" onClick={(event) => event.stopPropagation()}>
              <span className="confirm-label">DELETE BUILD</span>
              <p className="confirm-title">{mascotConfirmPendingName}</p>
              <p className="confirm-body">Все файлы сборки будут удалены с диска безвозвратно.</p>
              <div className="confirm-actions">
                <button
                  className="primary-action kill-action confirm-btn-delete"
                  type="button"
                  data-mascot-fake-delete
                  onClick={handleMascotDeleteConfirmed}
                >
                  DELETE
                </button>
                <button
                  className="ghost-action"
                  type="button"
                  onClick={() => {
                    setMascotConfirmPendingId(null);
                    setMascotConfirmPendingName("");
                  }}
                >
                  CANCEL
                </button>
              </div>
            </div>
          </div>
        )}

        <InstanceTransferModals
          instances={instances}
          exportInstanceId={exportInstanceId}
          setExportInstanceId={setExportInstanceId}
          exportData={exportData}
          exportOptions={exportOptions}
          setExportOptions={setExportOptions}
          exportWorking={exportWorking}
          exportError={exportError}
          onExportSlbuild={handleExportDownload}
          onExportMrpack={() => void handleExportMrpack()}
          importModalOpen={importModalOpen}
          setImportModalOpen={setImportModalOpen}
          importData={importData}
          setImportData={setImportData}
          importOptions={importOptions}
          setImportOptions={setImportOptions}
          importCustomName={importCustomName}
          setImportCustomName={setImportCustomName}
          importWorking={importWorking}
          importError={importError}
          importResult={importResult}
          importProgress={importProgress}
          importCancelRequested={importCancelRequested}
          setImportError={setImportError}
          setImportSourcePath={setImportSourcePath}
          importSourceFormat={importSourceFormat}
          onImportConfirm={() => void handleImportConfirm()}
          onImportCancel={() => void handleImportCancel()}
          altHoverRef={altHoverRef}
          altSourceHoveredRef={altSourceHoveredRef}
          listPreview={listPreview}
          setListPreview={setListPreview}
          getItemIconUrl={getExportedItemIconUrl}
        />
      </div>
    </RuntimeMonitorScope>
  );
}

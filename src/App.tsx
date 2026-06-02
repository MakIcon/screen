import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
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
  LoaderType,
  MicrosoftAccount,
  MinecraftManifest,
  TabKey,
  UpdateInstancePayload,
} from "./types";
import { MicrosoftAccountsModal } from "./components/modals/MicrosoftAccountsModal";
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
const CREATE_BUILD_CARD_DRAFT_KEY = "__create__";

function pickPreferredInstance(instances: InstanceItem[]) {
  if (instances.length === 0) return null;
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

export default function App() {
  const [phase, setPhase] = useState("init");
  const [isClosing, setIsClosing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [tabAnimating, setTabAnimating] = useState(false);

  const [manifest, setManifest] = useState<MinecraftManifest | null>(null);
  const [manifestLoading, setManifestLoading] = useState(true);

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
  const [fabricLoaderVersions, setFabricLoaderVersions] = useState<string[]>([]);
  const [fabricLoaderVersionsLoading, setFabricLoaderVersionsLoading] = useState(false);
  const [createFabricLoaderVersion, setCreateFabricLoaderVersion] = useState("");
  const [createError, setCreateError] = useState("");

  const [busyMessage, setBusyMessage] = useState("");
  const [actionError, setActionError] = useState("");
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

  // Alt+hover list preview (shared between export/import)
  const altHoverRef = useRef<{ items: ExportedItem[]; label: string; el: HTMLElement } | null>(null);
  const [listPreview, setListPreview] = useState<{ items: ExportedItem[]; label: string; rect: DOMRect } | null>(null);
  const [modrinthProjectIcons, setModrinthProjectIcons] = useState<Record<string, string | null>>({});
  const requestedModrinthProjectIconIdsRef = useRef<Set<string>>(new Set());

  // Import modal
  const importFileInputRef = useRef<HTMLInputElement>(null);
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
  const win = getCurrentWindow();
  const wheelLockRef = useRef(false);
  const instanceCardRefs = useRef(new Map<string, HTMLButtonElement>());
  const launchTimestampsRef = useRef<Map<string, number>>(new Map());
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
            fabricLoaderVersion: target.fabricLoaderVersion ?? null,
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

  const fabricInstances = useMemo(
    () => instances.filter((item) => item.loader.toLowerCase() === "fabric"),
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
    () => fabricInstances.find((item) => item.id === selectedInstanceId) || fabricInstances[0] || null,
    [fabricInstances, selectedInstanceId]
  );

  const selectedShaderTarget = useMemo(
    () => instances.find((item) => item.id === selectedInstanceId) || null,
    [instances, selectedInstanceId]
  );

  const {
    modSearch, setModSearch,
    selectedModrinthVersion, setSelectedModrinthVersion,
    modrinthItems, modrinthTotalHits, modrinthLoading, modrinthLoadingMore, modrinthError,
    modrinthInstallBusyId,
    installedMods, installedModsLoading,
    handleLoadMoreMods, handleInstallMod, handleUninstallMod,
  } = useModActions({ activeTab, selectedModTarget, setActionError, setBusyMessage });

  const {
    packSearch, setPackSearch,
    packItems, packTotalHits, packLoading, packLoadingMore, packError,
    packInstallBusyId,
    installedPacks, installedPacksLoading,
    handleLoadMorePacks, handleInstallPack, handleUninstallPack,
  } = usePackActions({ activeTab, selectedInstance, setActionError, setBusyMessage });

  const {
    shaderSearch, setShaderSearch,
    shaderItems, shaderTotalHits, shaderLoading, shaderLoadingMore, shaderError,
    shaderInstallBusyId,
    installedShaders, installedShadersLoading,
    handleLoadMoreShaders, handleInstallShader, handleUninstallShader,
  } = useShaderActions({ activeTab, selectedShaderTarget, setActionError, setBusyMessage });

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
          const preferredInstance = pickPreferredInstance(instanceResponse) || instanceResponse[0];
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
    const syncFabricLoaders = async () => {
      if (createLoader !== "Fabric" || !createVersion) {
        setFabricLoaderVersions([]);
        setCreateFabricLoaderVersion("");
        return;
      }

      try {
        setFabricLoaderVersionsLoading(true);
        const versions = await invoke<string[]>("get_fabric_loader_versions", {
          mcVersion: createVersion,
        });

        setFabricLoaderVersions(versions);
        setCreateFabricLoaderVersion((current) => {
          if (current && versions.includes(current)) return current;
          return versions[0] || "";
        });
      } catch (error) {
        console.error(error);
        setFabricLoaderVersions([]);
        setCreateFabricLoaderVersion("");
        setCreateError(String(error));
      } finally {
        setFabricLoaderVersionsLoading(false);
      }
    };

    void syncFabricLoaders();
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

    const preferredInstance = pickPreferredInstance(fresh) || fresh[0];
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
    }
  };

  const saveOptimizedJavaArgs = async (enabled: boolean) => {
    try {
      const updated = await invoke<LauncherSettings>("set_optimized_java_args", { enabled });
      setLauncherSettings(updated);
    } catch (error) {
      console.error(error);
      setActionError(String(error));
    }
  };

  const saveLauncherPlugins = async (plugins: LauncherPluginsSettings) => {
    try {
      const updated = await invoke<LauncherSettings>("set_launcher_plugins", { plugins });
      setLauncherSettings(updated);
    } catch (error) {
      console.error(error);
      setActionError(String(error));
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

      if (createLoader === "Fabric" && !createFabricLoaderVersion) {
        setCreateError("Выберите версию Fabric Loader");
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
          fabricLoaderVersion: createLoader === "Fabric" ? createFabricLoaderVersion : null,
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
      setCreateFabricLoaderVersion("");
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
    } catch (error) {
      console.error(error);
      setCreateError(String(error));
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
    } catch (error) {
      console.error(error);
      setActionError(String(error));
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
    } catch (error) {
      console.error(error);
      setActionError(String(error));
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
    try {
      await invoke("kill_instance", { pid });
    } catch (error) {
      console.error(error);
    }
    void handleInstanceStopped(instanceId);
  };

  const handleDeleteInstance = async (instanceId: string) => {
    const inst = instances.find((i) => i.id === instanceId);
    setConfirmPendingId(instanceId);
    setConfirmPendingName(inst?.name ?? instanceId);
  };

  const handleDeleteConfirmed = async () => {
    if (!confirmPendingId) return;
    const id = confirmPendingId;
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

      await refreshInstances();
    } catch (error) {
      console.error(error);
      setActionError(String(error));
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
    }
  };

  // ── Export ──
  const handleExportInstance = async (instanceId: string) => {
    setExportInstanceId(instanceId);
    setExportData(null);
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
    }
  };

  const handleExportDownload = () => {
    if (!exportData || !exportInstanceId) return;
    const out = {
      schemaVersion: 1,
      name: exportOptions.name ? exportData.name : "",
      version: exportData.version,
      loader: exportData.loader,
      fabricLoaderVersion: exportData.fabricLoaderVersion ?? null,
      ram: exportOptions.ram ? exportData.ram : 0,
      javaArgs: exportOptions.javaArgs ? (exportData.javaArgs ?? null) : null,
      javaPath: exportOptions.javaPath ? (exportData.javaPath ?? null) : null,
      windowWidth: exportOptions.window ? (exportData.windowWidth ?? null) : null,
      windowHeight: exportOptions.window ? (exportData.windowHeight ?? null) : null,
      fullscreen: exportOptions.window ? (exportData.fullscreen ?? false) : false,
      mods: exportOptions.mods ? exportData.mods : [] as ExportedItem[],
      shaders: exportOptions.shaders ? exportData.shaders : [] as ExportedItem[],
      resourcePacks: exportOptions.resourcePacks ? exportData.resourcePacks : [] as ExportedItem[],
    };
    const json = JSON.stringify(out, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(exportOptions.name && exportData.name ? exportData.name : "build").toLowerCase().replace(/\s+/g, "-")}.slbuild`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setExportInstanceId(null);
  };

  // ── Import ──
  const handleImportBuild = () => {
    importFileInputRef.current?.click();
  };

  const handleImportFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string) as InstanceExportData;
        setImportData(data);
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
      } catch {
        setImportError("Не удалось прочитать файл. Убедитесь, что это корректный .slbuild файл.");
        setImportModalOpen(true);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleImportConfirm = async () => {
    if (!importData) return;
    setImportWorking(true);
    setImportError("");
    const name = importOptions.name ? importData.name : importCustomName;
    try {
      const newInstance = await invoke<InstanceItem>("import_instance", {
        payload: {
          name,
          version: importData.version,
          loader: importData.loader,
          fabricLoaderVersion: importData.fabricLoaderVersion ?? null,
          ram: importOptions.ram ? importData.ram : (launcherSettings?.defaultRamGb ?? 4),
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
    } catch (err) {
      setImportError(String(err));
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
            fabricLoaderVersions={fabricLoaderVersions}
            fabricLoaderVersionsLoading={fabricLoaderVersionsLoading}
            createFabricLoaderVersion={createFabricLoaderVersion}
            setCreateFabricLoaderVersion={setCreateFabricLoaderVersion}
            createError={createError}
            setCreateError={setCreateError}
            minecraftVersions={minecraftVersions}
            openDropdown={openDropdown}
            setOpenDropdown={setOpenDropdown}
            working={working}
            busyMessage={busyMessage}
            actionError={actionError}
            installProgress={installProgress}
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
            fabricInstances={fabricInstances}
            selectedModTarget={selectedModTarget}
            selectedModrinthVersion={selectedModrinthVersion}
            setSelectedModrinthVersion={setSelectedModrinthVersion}
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
            resolve={resolve}
            manifestLoading={manifestLoading}
            manifest={manifest}
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
          <div className="confirm-overlay" onClick={() => { setExportInstanceId(null); setListPreview(null); }}>
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
              <p className="eximp-notice">VERSION &amp; LOADER экспортируются всегда. Local-моды/шейдеры не включаются.</p>
              <div className="confirm-actions" style={{ marginTop: 24 }}>
                <button className="primary-action" type="button" disabled={!exportData} onClick={handleExportDownload}>
                  EXPORT
                </button>
                <button className="ghost-action" type="button" onClick={() => { setExportInstanceId(null); setListPreview(null); }}>
                  CANCEL
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Import modal ── */}
      <input
        ref={importFileInputRef}
        type="file"
        accept=".slbuild,.json"
        style={{ display: "none" }}
        onChange={handleImportFileSelected}
      />
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
        const close = () => { setImportModalOpen(false); setImportData(null); setImportError(""); setListPreview(null); };
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
                    VERSION &amp; LOADER берутся из файла. Modrinth-моды будут скачаны заново.
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

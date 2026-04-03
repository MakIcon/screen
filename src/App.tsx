import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import { InlineDropdown } from "./components/inputs/InlineDropdown";
import { CustomScrollArea } from "./components/layout/CustomScrollArea";
import { TAB_INDEX, TAB_ORDER, TAB_TITLE, LOADER_OPTIONS} from "./constants/tabs";
import { useWindowPhase } from "./hooks/useWindowPhase";
import { clampRamToSystem } from "./utils/ram";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { HoverRevealValue } from "./components/display/HoverRevealValue";
import { ElementSlider } from "./components/inputs/ElementSlider";
import { ElementToggle } from "./components/inputs/ElementToggle";
import {
  BuildCardSettingsPopup,
  DEFAULT_BUILD_CARD_APPEARANCE,
  SettingsGearIcon,
  getBuildCardAppearanceStyle,
  getBuildCardBadgeStyle,
  getBuildCardBadgeText,
  normalizeBuildCardAppearance,
  type BuildCardAppearance,
  type BuildCardPreviewSize,
} from "./components/builds/BuildCardSettingsPopup";
import type {
  ActionResult,
  CreateInstancePayload,
  DropdownKey,
  InstanceItem,
  InstallProgressPayload,
  InstalledModView,
  LauncherSettings,
  LoaderType,
  MinecraftManifest,
  ModrinthProject,
  ModrinthSearchResponse,
  TabKey,
  UpdateInstancePayload,
} from "./types";

const ADVANCED_SETTINGS_STORAGE_KEY = "screenlauncher-advanced-settings-enabled";
const BUILD_CARD_BACKGROUNDS_STORAGE_KEY = "screenlauncher-build-card-backgrounds";
const CREATE_BUILD_CARD_DRAFT_KEY = "__create__";

function pickPreferredInstance(instances: InstanceItem[]) {
  if (instances.length === 0) return null;
  return instances[instances.length - 1] ?? instances[0] ?? null;
}

export default function App() {
  const [phase, setPhase] = useState("init");
  const [isClosing, setIsClosing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [tabAnimating, setTabAnimating] = useState(false);

  const [manifest, setManifest] = useState<MinecraftManifest | null>(null);
  const [manifestLoading, setManifestLoading] = useState(true);
  const [manifestError, setManifestError] = useState("");

  const [instances, setInstances] = useState<InstanceItem[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState("");

  const [memoryGb, setMemoryGb] = useState(4);
  const [wheelTabSwitching, setWheelTabSwitching] = useState(true);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [showPreReleases, setShowPreReleases] = useState(false);

  const [systemRamGb, setSystemRamGb] = useState(8);
  const [launcherSettings, setLauncherSettings] = useState<LauncherSettings | null>(null);
  const [createRamGb, setCreateRamGb] = useState(4);
  const [settingsRamDraft, setSettingsRamDraft] = useState(4);
  const [instanceRamDraft, setInstanceRamDraft] = useState(4);
  const [instanceRamEditorOpen, setInstanceRamEditorOpen] = useState(false);
  const [createRamEditorOpen, setCreateRamEditorOpen] = useState(false);

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

  const [modSearch, setModSearch] = useState("");
  const [packSearch, setPackSearch] = useState("");
  const [shaderSearch, setShaderSearch] = useState("");
  const [modrinthVersionOptions, setModrinthVersionOptions] = useState<string[]>([]);
  const [selectedModrinthVersion, setSelectedModrinthVersion] = useState("");
  const [modrinthItems, setModrinthItems] = useState<ModrinthProject[]>([]);
  const [modrinthTotalHits, setModrinthTotalHits] = useState(0);
  const [modrinthLoading, setModrinthLoading] = useState(false);
  const [modrinthLoadingMore, setModrinthLoadingMore] = useState(false);
  const [modrinthError, setModrinthError] = useState("");
  const [modrinthInstallBusyId, setModrinthInstallBusyId] = useState<string | null>(null);
  const [installedMods, setInstalledMods] = useState<InstalledModView[]>([]);
  const [installedModsLoading, setInstalledModsLoading] = useState(false);

  const [packItems, setPackItems] = useState<ModrinthProject[]>([]);
  const [packTotalHits, setPackTotalHits] = useState(0);
  const [packLoading, setPackLoading] = useState(false);
  const [packLoadingMore, setPackLoadingMore] = useState(false);
  const [packError, setPackError] = useState("");
  const [packInstallBusyId, setPackInstallBusyId] = useState<string | null>(null);
  const [installedPacks, setInstalledPacks] = useState<InstalledModView[]>([]);
  const [installedPacksLoading, setInstalledPacksLoading] = useState(false);

  const [shaderItems, setShaderItems] = useState<ModrinthProject[]>([]);
  const [shaderTotalHits, setShaderTotalHits] = useState(0);
  const [shaderLoading, setShaderLoading] = useState(false);
  const [shaderLoadingMore, setShaderLoadingMore] = useState(false);
  const [shaderError, setShaderError] = useState("");
  const [shaderInstallBusyId, setShaderInstallBusyId] = useState<string | null>(null);
  const [installedShaders, setInstalledShaders] = useState<InstalledModView[]>([]);
  const [installedShadersLoading, setInstalledShadersLoading] = useState(false);
  const [shaderTargetMods, setShaderTargetMods] = useState<InstalledModView[]>([]);

  const [viewingMod, setViewingMod] = useState<ModrinthProject | null>(null);

  const [installProgress, setInstallProgress] = useState<InstallProgressPayload | null>(null);

  const [runningInstances, setRunningInstances] = useState<Map<string, number>>(new Map());
  // helpers
  const isRunning = (id: string) => runningInstances.has(id);
  const addRunning = (id: string, pid: number) =>
    setRunningInstances((prev) => new Map(prev).set(id, pid));
  const removeRunning = (id: string) =>
    setRunningInstances((prev) => { const m = new Map(prev); m.delete(id); return m; });

  const [confirmPendingId, setConfirmPendingId] = useState<string | null>(null);
  const [confirmPendingName, setConfirmPendingName] = useState("");

  const [openDropdown, setOpenDropdown] = useState<DropdownKey>(null);

  const [advancedSettingsEnabled, setAdvancedSettingsEnabled] = useState(false);
  const [buildCardAppearances, setBuildCardAppearances] = useState<Record<string, BuildCardAppearance>>({});
  const [buildSettingsTargetId, setBuildSettingsTargetId] = useState<string | null>(null);
  const [buildCardSettingsOpen, setBuildCardSettingsOpen] = useState(false);
  const [buildCardSettingsDraft, setBuildCardSettingsDraft] = useState<BuildCardAppearance>({ ...DEFAULT_BUILD_CARD_APPEARANCE });
  const [buildCardPreviewSize, setBuildCardPreviewSize] = useState<BuildCardPreviewSize | null>(null);


  const win = getCurrentWindow();
  const wheelLockRef = useRef(false);
  const instanceCardRefs = useRef(new Map<string, HTMLButtonElement>());
  const createCardMeasureRef = useRef<HTMLDivElement | null>(null);

  const persistBuildCardAppearances = (next: Record<string, BuildCardAppearance>) => {
    setBuildCardAppearances(next);
    window.localStorage.setItem(BUILD_CARD_BACKGROUNDS_STORAGE_KEY, JSON.stringify(next));
  };

  const getBuildCardAppearance = (targetId: string | null | undefined) => {
    if (!targetId) return { ...DEFAULT_BUILD_CARD_APPEARANCE };
    return normalizeBuildCardAppearance(buildCardAppearances[targetId]);
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
    setBuildSettingsTargetId(resolvedTargetId);
    setBuildCardSettingsDraft(
      getBuildCardAppearance(resolvedTargetId ?? CREATE_BUILD_CARD_DRAFT_KEY)
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
    setBuildCardPreviewSize(null);
  };

  const saveBuildCardSettings = () => {
    const storageKey = buildSettingsTargetId ?? CREATE_BUILD_CARD_DRAFT_KEY;
    const next = {
      ...buildCardAppearances,
      [storageKey]: normalizeBuildCardAppearance(buildCardSettingsDraft),
    };

    persistBuildCardAppearances(next);
    closeBuildCardSettings();
  };

  const clearBuildCardSettings = () => {
    const storageKey = buildSettingsTargetId ?? CREATE_BUILD_CARD_DRAFT_KEY;
    const next = { ...buildCardAppearances };
    delete next[storageKey];
    persistBuildCardAppearances(next);
    setBuildCardSettingsDraft({ ...DEFAULT_BUILD_CARD_APPEARANCE });
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

  const selectedModTarget = useMemo(
    () => fabricInstances.find((item) => item.id === selectedInstanceId) || fabricInstances[0] || null,
    [fabricInstances, selectedInstanceId]
  );

  const selectedShaderTarget = useMemo(
    () => instances.find((item) => item.id === selectedInstanceId) || null,
    [instances, selectedInstanceId]
  );

  const selectedShaderFabricTarget = useMemo(
    () =>
      instances.find(
        (item) =>
          item.id === selectedInstanceId &&
          item.loader.toLowerCase() === "fabric"
      ) || null,
    [instances, selectedInstanceId]
  );

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

  useEffect(() => {
    const bootstrap = async () => {
      try {
        setManifestLoading(true);
        setManifestError("");

        const [manifestResponse, instanceResponse, systemRamResponse, settingsResponse] =
          await Promise.all([
            invoke<MinecraftManifest>("get_minecraft_manifest"),
            invoke<InstanceItem[]>("list_instances"),
            invoke<number>("get_system_memory_gb"),
            invoke<LauncherSettings>("get_launcher_settings"),
          ]);

        setManifest(manifestResponse);
        setInstances(instanceResponse);
        setSystemRamGb(systemRamResponse);
        setLauncherSettings(settingsResponse);
        setSettingsRamDraft(clampRamToSystem(settingsResponse.defaultRamGb, systemRamResponse));

        const preferredVersion =
          manifestResponse.versions.find((v) => v.type === "release")?.id ||
          manifestResponse.latest.release ||
          "";

        setCreateVersion(preferredVersion);

        if (instanceResponse.length > 0) {
          const preferredInstance = pickPreferredInstance(instanceResponse) || instanceResponse[0];
          const initialRam = clampRamToSystem(preferredInstance.ram, systemRamResponse);
          setSelectedInstanceId(preferredInstance.id);
          setMemoryGb(initialRam);
          setInstanceRamDraft(initialRam);
        } else {
          const fallbackRam = clampRamToSystem(settingsResponse.defaultRamGb, systemRamResponse);
          setMemoryGb(fallbackRam);
          setInstanceRamDraft(fallbackRam);
        }

        setCreateRamGb(clampRamToSystem(settingsResponse.defaultRamGb, systemRamResponse));
      } catch (error) {
        console.error(error);
        setManifestError(String(error));
      } finally {
        setManifestLoading(false);
      }
    };

    void bootstrap();
  }, []);

  useEffect(() => {
    const loadModrinthVersions = async () => {
      try {
        const versions = await invoke<string[]>("get_modrinth_fabric_versions");
        setModrinthVersionOptions(versions);
      } catch (error) {
        console.error(error);
      }
    };

    void loadModrinthVersions();
  }, []);

  useEffect(() => {
    if (selectedModTarget?.version) {
      setSelectedModrinthVersion(selectedModTarget.version);
      return;
    }

    setSelectedModrinthVersion((current) => current || modrinthVersionOptions[0] || "");
  }, [selectedModTarget?.version, modrinthVersionOptions]);

  useEffect(() => {
    const loadInstalledMods = async () => {
      if (!selectedModTarget) {
        setInstalledMods([]);
        return;
      }

      try {
        setInstalledModsLoading(true);
        const result = await invoke<InstalledModView[]>("list_installed_mods", {
          instanceId: selectedModTarget.id,
        });
        setInstalledMods(result);
      } catch (error) {
        console.error(error);
        setInstalledMods([]);
      } finally {
        setInstalledModsLoading(false);
      }
    };

    void loadInstalledMods();
  }, [selectedModTarget?.id, working, modrinthInstallBusyId]);

  useEffect(() => {
    const loadInstalledPacks = async () => {
      if (!selectedInstance) {
        setInstalledPacks([]);
        return;
      }

      try {
        setInstalledPacksLoading(true);
        const result = await invoke<InstalledModView[]>("list_installed_resourcepacks", {
          instanceId: selectedInstance.id,
        });
        setInstalledPacks(result);
      } catch (error) {
        console.error(error);
        setInstalledPacks([]);
      } finally {
        setInstalledPacksLoading(false);
      }
    };

    void loadInstalledPacks();
  }, [selectedInstance?.id, working, packInstallBusyId]);

  useEffect(() => {
    const loadInstalledShaders = async () => {
      if (!selectedShaderTarget) {
        setInstalledShaders([]);
        return;
      }

      try {
        setInstalledShadersLoading(true);
        const result = await invoke<InstalledModView[]>("list_installed_shaders", {
          instanceId: selectedShaderTarget.id,
        });
        setInstalledShaders(result);
      } catch (error) {
        console.error(error);
        setInstalledShaders([]);
      } finally {
        setInstalledShadersLoading(false);
      }
    };

    void loadInstalledShaders();
  }, [selectedShaderTarget?.id, working, shaderInstallBusyId]);

  useEffect(() => {
    const loadShaderTargetMods = async () => {
      if (!selectedShaderFabricTarget) {
        setShaderTargetMods([]);
        return;
      }

      try {
        const result = await invoke<InstalledModView[]>("list_installed_mods", {
          instanceId: selectedShaderFabricTarget.id,
        });
        setShaderTargetMods(result);
      } catch (error) {
        console.error(error);
        setShaderTargetMods([]);
      }
    };

    void loadShaderTargetMods();
  }, [selectedShaderFabricTarget?.id, working, shaderInstallBusyId]);

  useEffect(() => {
    const loadModrinthMods = async () => {
      if (activeTab !== "mods" || !selectedModrinthVersion) {
        return;
      }

      try {
        setModrinthLoading(true);
        setModrinthError("");
        const result = await invoke<ModrinthSearchResponse>("search_modrinth_mods", {
          instanceId: selectedModTarget?.id ?? null,
          query: modSearch.trim(),
          gameVersion: selectedModrinthVersion,
          offset: 0,
          limit: 24,
        });
        setModrinthItems(result.hits);
        setModrinthTotalHits(result.totalHits);
      } catch (error) {
        console.error(error);
        setModrinthItems([]);
        setModrinthTotalHits(0);
        setModrinthError(String(error));
      } finally {
        setModrinthLoading(false);
      }
    };

    const timer = window.setTimeout(() => {
      void loadModrinthMods();
    }, 180);

    return () => window.clearTimeout(timer);
  }, [activeTab, modSearch, selectedModTarget?.id, selectedModrinthVersion]);

  useEffect(() => {
    const loadResourcepacks = async () => {
      if (activeTab !== "resourcepacks" || !selectedInstance?.version) {
        return;
      }

      try {
        setPackLoading(true);
        setPackError("");
        const result = await invoke<ModrinthSearchResponse>("search_modrinth_resourcepacks", {
          instanceId: selectedInstance.id,
          query: packSearch.trim(),
          gameVersion: selectedInstance.version,
          offset: 0,
          limit: 24,
        });
        setPackItems(result.hits);
        setPackTotalHits(result.totalHits);
      } catch (error) {
        console.error(error);
        setPackItems([]);
        setPackTotalHits(0);
        setPackError(String(error));
      } finally {
        setPackLoading(false);
      }
    };

    const timer = window.setTimeout(() => {
      void loadResourcepacks();
    }, 180);

    return () => window.clearTimeout(timer);
  }, [activeTab, packSearch, selectedInstance?.id, selectedInstance?.version]);

  useEffect(() => {
    const loadShaders = async () => {
      if (activeTab !== "shaders" || !selectedShaderTarget?.version) {
        return;
      }

      try {
        setShaderLoading(true);
        setShaderError("");
        const result = await invoke<ModrinthSearchResponse>("search_modrinth_shaders", {
          instanceId: selectedShaderTarget.id,
          query: shaderSearch.trim(),
          gameVersion: selectedShaderTarget.version,
          offset: 0,
          limit: 24,
        });
        setShaderItems(result.hits);
        setShaderTotalHits(result.totalHits);
      } catch (error) {
        console.error(error);
        setShaderItems([]);
        setShaderTotalHits(0);
        setShaderError(String(error));
      } finally {
        setShaderLoading(false);
      }
    };

    const timer = window.setTimeout(() => {
      void loadShaders();
    }, 180);

    return () => window.clearTimeout(timer);
  }, [activeTab, shaderSearch, selectedShaderTarget?.id, selectedShaderTarget?.version]);

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
          if (!alive) removeRunning(id);
        } catch {
          removeRunning(id);
        }
      }
    }, 3000);
    return () => window.clearInterval(interval);
  }, [runningInstances]);

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

    const targetItem = fresh.find((i) => i.id === target) || preferredInstance;
    const targetRam = clampRamToSystem(targetItem.ram, systemRamGb);
    setMemoryGb(targetRam);
    setInstanceRamDraft(targetRam);
  };

  const handleClose = async () => {
    setIsClosing(true);
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

  const saveSelectedInstance = async (patch: Partial<InstanceItem>) => {
    if (!selectedInstance) return;

    const updated: InstanceItem = {
      ...selectedInstance,
      ...patch,
      ram: clampRamToSystem(patch.ram ?? selectedInstance.ram, systemRamGb),
    };

    setInstances((prev) =>
      prev.map((item) => (item.id === selectedInstance.id ? updated : item))
    );
    setMemoryGb(updated.ram);
    setInstanceRamDraft(updated.ram);

    await invoke<InstanceItem>("update_instance", {
      payload: {
        id: updated.id,
        name: updated.name,
        version: updated.version,
        loader: updated.loader as LoaderType,
        fabricLoaderVersion: updated.fabricLoaderVersion ?? null,
        ram: updated.ram,
      } satisfies UpdateInstancePayload,
    });

    await refreshInstances(updated.id);
  };

  const commitSelectedInstanceRam = async () => {
    if (!selectedInstance) return;

    const value = clampRamToSystem(instanceRamDraft, systemRamGb);

    try {
      await saveSelectedInstance({ ram: value });
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

      const created = await invoke<InstanceItem>("create_instance", {
        payload: {
          name: cleanName,
          version: createVersion,
          loader: createLoader,
          fabricLoaderVersion: createLoader === "Fabric" ? createFabricLoaderVersion : null,
          ram: clampRamToSystem(createRamGb, systemRamGb),
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
      });

      await refreshInstances(target.id);
      if (result.pid) addRunning(target.id, result.pid);

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
    } finally {
      removeRunning(instanceId);
    }
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

  const handleLoadMoreMods = async () => {
    if (!selectedModrinthVersion || modrinthLoadingMore || modrinthLoading) return;
    if (modrinthItems.length >= modrinthTotalHits) return;

    try {
      setModrinthLoadingMore(true);
      const result = await invoke<ModrinthSearchResponse>("search_modrinth_mods", {
        instanceId: selectedModTarget?.id ?? null,
        query: modSearch.trim(),
        gameVersion: selectedModrinthVersion,
        offset: modrinthItems.length,
        limit: 24,
      });
      setModrinthItems((prev) => {
        const seen = new Set(prev.map((item) => item.projectId));
        return [...prev, ...result.hits.filter((item) => !seen.has(item.projectId))];
      });
      setModrinthTotalHits(result.totalHits);
    } catch (error) {
      console.error(error);
      setModrinthError(String(error));
    } finally {
      setModrinthLoadingMore(false);
    }
  };

  const handleInstallMod = async (projectId: string) => {
    if (!selectedModTarget) return;

    try {
      setModrinthInstallBusyId(projectId);
      setActionError("");
      setBusyMessage("Installing Modrinth mod...");
      await invoke<ActionResult>("install_modrinth_project", {
        instanceId: selectedModTarget.id,
        projectId,
      });

      const [modsResult, installedResult] = await Promise.all([
        invoke<ModrinthSearchResponse>("search_modrinth_mods", {
          instanceId: selectedModTarget.id,
          query: modSearch.trim(),
          gameVersion: selectedModrinthVersion || selectedModTarget.version,
          offset: 0,
          limit: Math.max(modrinthItems.length, 24),
        }),
        invoke<InstalledModView[]>("list_installed_mods", { instanceId: selectedModTarget.id }),
      ]);

      setModrinthItems(modsResult.hits);
      setModrinthTotalHits(modsResult.totalHits);
      setInstalledMods(installedResult);
      setBusyMessage("Mod install finished");
    } catch (error) {
      console.error(error);
      setActionError(String(error));
    } finally {
      setModrinthInstallBusyId(null);
      window.setTimeout(() => setBusyMessage(""), 800);
    }
  };

  const handleUninstallMod = async (projectId: string) => {
    if (!selectedModTarget) return;

    // Находим имя файла по projectId в списке уже установленных модов
    const modEntry = installedMods.find(m => m.projectId === projectId);
    if (!modEntry) return;

    try {
      setModrinthInstallBusyId(projectId);
      setBusyMessage("Uninstalling mod...");
      await invoke("uninstall_modrinth_mod", {
        instanceId: selectedModTarget.id,
        filename: modEntry.filename
      });
      
      // Обновляем списки
      const [modsResult, installedResult] = await Promise.all([
        invoke<ModrinthSearchResponse>("search_modrinth_mods", {
          instanceId: selectedModTarget.id,
          query: modSearch.trim(),
          gameVersion: selectedModrinthVersion,
          offset: 0,
          limit: Math.max(modrinthItems.length, 24),
        }),
        invoke<InstalledModView[]>("list_installed_mods", { instanceId: selectedModTarget.id }),
      ]);

      setModrinthItems(modsResult.hits);
      setInstalledMods(installedResult);
    } catch (error) {
      setActionError(String(error));
    } finally {
      setModrinthInstallBusyId(null);
      setBusyMessage("");
    }
  };

  const handleLoadMorePacks = async () => {
    if (!selectedInstance?.version || packLoadingMore || packLoading) return;
    if (packItems.length >= packTotalHits) return;

    try {
      setPackLoadingMore(true);
      const result = await invoke<ModrinthSearchResponse>("search_modrinth_resourcepacks", {
        instanceId: selectedInstance.id,
        query: packSearch.trim(),
        gameVersion: selectedInstance.version,
        offset: packItems.length,
        limit: 24,
      });
      setPackItems((prev) => {
        const seen = new Set(prev.map((item) => item.projectId));
        return [...prev, ...result.hits.filter((item) => !seen.has(item.projectId))];
      });
      setPackTotalHits(result.totalHits);
    } catch (error) {
      console.error(error);
      setPackError(String(error));
    } finally {
      setPackLoadingMore(false);
    }
  };

  const handleInstallPack = async (projectId: string) => {
    if (!selectedInstance) return;

    try {
      setPackInstallBusyId(projectId);
      setActionError("");
      setBusyMessage("Installing resource pack...");
      await invoke<ActionResult>("install_modrinth_resourcepack", {
        instanceId: selectedInstance.id,
        projectId,
      });

      const [packsResult, installedResult] = await Promise.all([
        invoke<ModrinthSearchResponse>("search_modrinth_resourcepacks", {
          instanceId: selectedInstance.id,
          query: packSearch.trim(),
          gameVersion: selectedInstance.version,
          offset: 0,
          limit: Math.max(packItems.length, 24),
        }),
        invoke<InstalledModView[]>("list_installed_resourcepacks", {
          instanceId: selectedInstance.id,
        }),
      ]);

      setPackItems(packsResult.hits);
      setPackTotalHits(packsResult.totalHits);
      setInstalledPacks(installedResult);
      setBusyMessage("Resource pack install finished");
    } catch (error) {
      console.error(error);
      setActionError(String(error));
    } finally {
      setPackInstallBusyId(null);
      window.setTimeout(() => setBusyMessage(""), 800);
    }
  };

  const handleUninstallPack = async (projectId: string) => {
    if (!selectedInstance) return;

    const packEntry = installedPacks.find((p) => p.projectId === projectId);
    if (!packEntry) return;

    try {
      setPackInstallBusyId(projectId);
      setBusyMessage("Uninstalling resource pack...");
      await invoke<ActionResult>("uninstall_modrinth_resourcepack", {
        instanceId: selectedInstance.id,
        filename: packEntry.filename,
      });

      const [packsResult, installedResult] = await Promise.all([
        invoke<ModrinthSearchResponse>("search_modrinth_resourcepacks", {
          instanceId: selectedInstance.id,
          query: packSearch.trim(),
          gameVersion: selectedInstance.version,
          offset: 0,
          limit: Math.max(packItems.length, 24),
        }),
        invoke<InstalledModView[]>("list_installed_resourcepacks", {
          instanceId: selectedInstance.id,
        }),
      ]);

      setPackItems(packsResult.hits);
      setPackTotalHits(packsResult.totalHits);
      setInstalledPacks(installedResult);
    } catch (error) {
      console.error(error);
      setActionError(String(error));
    } finally {
      setPackInstallBusyId(null);
      setBusyMessage("");
    }
  };

  const handleLoadMoreShaders = async () => {
    if (!selectedShaderTarget?.version || shaderLoadingMore || shaderLoading) return;
    if (shaderItems.length >= shaderTotalHits) return;

    try {
      setShaderLoadingMore(true);
      const result = await invoke<ModrinthSearchResponse>("search_modrinth_shaders", {
        instanceId: selectedShaderTarget.id,
        query: shaderSearch.trim(),
        gameVersion: selectedShaderTarget.version,
        offset: shaderItems.length,
        limit: 24,
      });
      setShaderItems((prev) => {
        const seen = new Set(prev.map((item) => item.projectId));
        return [...prev, ...result.hits.filter((item) => !seen.has(item.projectId))];
      });
      setShaderTotalHits(result.totalHits);
    } catch (error) {
      console.error(error);
      setShaderError(String(error));
    } finally {
      setShaderLoadingMore(false);
    }
  };

  const handleInstallShader = async (projectId: string) => {
    if (!selectedShaderTarget) return;

    try {
      setShaderInstallBusyId(projectId);
      setActionError("");
      setBusyMessage("Installing shader...");
      await invoke<ActionResult>("install_modrinth_shader", {
        instanceId: selectedShaderTarget.id,
        projectId,
      });

      const [shadersResult, installedResult] = await Promise.all([
        invoke<ModrinthSearchResponse>("search_modrinth_shaders", {
          instanceId: selectedShaderTarget.id,
          query: shaderSearch.trim(),
          gameVersion: selectedShaderTarget.version,
          offset: 0,
          limit: Math.max(shaderItems.length, 24),
        }),
        invoke<InstalledModView[]>("list_installed_shaders", {
          instanceId: selectedShaderTarget.id,
        }),
      ]);

      setShaderItems(shadersResult.hits);
      setShaderTotalHits(shadersResult.totalHits);
      setInstalledShaders(installedResult);
      setBusyMessage("Shader install finished");
    } catch (error) {
      console.error(error);
      setActionError(String(error));
    } finally {
      setShaderInstallBusyId(null);
      window.setTimeout(() => setBusyMessage(""), 800);
    }
  };

  const handleUninstallShader = async (projectId: string) => {
    if (!selectedShaderTarget) return;

    const shaderEntry = installedShaders.find((item) => item.projectId === projectId);
    if (!shaderEntry) return;

    try {
      setShaderInstallBusyId(projectId);
      setBusyMessage("Uninstalling shader...");
      await invoke<ActionResult>("uninstall_modrinth_shader", {
        instanceId: selectedShaderTarget.id,
        filename: shaderEntry.filename,
      });

      const [shadersResult, installedResult] = await Promise.all([
        invoke<ModrinthSearchResponse>("search_modrinth_shaders", {
          instanceId: selectedShaderTarget.id,
          query: shaderSearch.trim(),
          gameVersion: selectedShaderTarget.version,
          offset: 0,
          limit: Math.max(shaderItems.length, 24),
        }),
        invoke<InstalledModView[]>("list_installed_shaders", {
          instanceId: selectedShaderTarget.id,
        }),
      ]);

      setShaderItems(shadersResult.hits);
      setShaderTotalHits(shadersResult.totalHits);
      setInstalledShaders(installedResult);
    } catch (error) {
      console.error(error);
      setActionError(String(error));
    } finally {
      setShaderInstallBusyId(null);
      setBusyMessage("");
    }
  };

  const renderOverview = () => {
    if (!selectedInstance) {
      return (
        <section className="launcher-panel">
          <div className="panel-grid panel-grid-overview-minimal">
            <div className="panel-card hero-card overview-minimal-card">
              <span className="panel-label">NO BUILDS</span>

              <h2>
                Create your
                <br />
                first build.
              </h2>

              <p className="panel-text">
                BUILDS теперь создают реальные инстансы, скачивают official files и могут запускаться в
                offline mode.
              </p>

              <div className="action-row">
                <button
                  className="primary-action play-last-button"
                  type="button"
                  onClick={() => setTabAnimated("instances")}
                >
                  OPEN BUILDS
                </button>
              </div>
            </div>
          </div>
        </section>
      );
    }

    return (
      <section className="launcher-panel">
        <div className="panel-grid panel-grid-overview-minimal">
          <div className="panel-card hero-card overview-minimal-card">
            <span className="panel-label">LAST SESSION</span>

            <h2>
              Play last
              <br />
              build.
            </h2>

            <p className="panel-text">
              Реальный offline launcher: client, libraries, natives и assets скачиваются автоматически
              перед стартом.
            </p>

            <div className="hero-meta two-col-meta">
              <div className="meta-block">
                <span className="meta-title">BUILD</span>
                <strong>{selectedInstance.name}</strong>
              </div>

              <div className="meta-block">
                <span className="meta-title">MC / LOADER</span>
                <strong>
                  {selectedInstance.version} / {selectedInstance.loader}
                </strong>
              </div>

              <div className="meta-block">
                <span className="meta-title">LAST PLAYED</span>
                <strong>{selectedInstance.lastPlayed}</strong>
              </div>

              <div className="meta-block">
                <span className="meta-title">TIME IN GAME</span>
                <strong>{selectedInstance.playtimeHours} H</strong>
              </div>
            </div>

            <div className="action-row">
              {isRunning(selectedInstance.id) ? (
                <button
                  className="primary-action play-last-button kill-action"
                  type="button"
                  onClick={() => handleKillGame(selectedInstance.id)}
                >
                  ✕ KILL GAME
                </button>
              ) : (
                <button
                  className="primary-action play-last-button"
                  type="button"
                  onClick={() => handleLaunchSelected()}
                  disabled={working}
                >
                  {working ? "WORKING..." : "PLAY LAST"}
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  };

  const renderInstances = () => {
    const sortedInstances = [...instances].reverse();
    const showCreator = createMode || instances.length === 0 || !selectedInstance;
    return (
      <section className="launcher-panel">
        <div className="panel-grid panel-grid-instances-fixed">
          <div className="panel-card instances-list-card">
            <div className="card-topline">
              <span className="panel-label">INSTANCE LIBRARY</span>
              <button
                className="ghost-action"
                type="button"
                onClick={() => {
                  setCreateMode(true);
                  setCreateError("");
                  setCreateRamGb(clampRamToSystem(launcherSettings?.defaultRamGb ?? 4, systemRamGb));
                }}
              >
                CREATE BUILD
              </button>
            </div>

            <CustomScrollArea
              className="instance-stack"
              onWheel={(e: any) => e.stopPropagation()}
              style={{ flex: 1, minHeight: 0 }}
            >
              <div style={{ height: 0, overflow: "hidden", pointerEvents: "none" }} aria-hidden="true">
                <div
                  ref={createCardMeasureRef}
                  className={`instance-card ${createMeasureAppearance.image ? "instance-card-with-image" : ""}`}
                  style={getBuildCardAppearanceStyle(createMeasureAppearance)}
                >
                  <div className="instance-card-top">
                    <span className="instance-name">{createPreviewName}</span>
                  </div>
                  <div className="instance-card-meta">
                    <span>{createPreviewVersion}</span>
                    <span>{createPreviewLoader}</span>
                    <span>{createPreviewRam} GB</span>
                    <span>NEVER</span>
                  </div>
                </div>
              </div>

              {instances.length === 0 ? (
                <div className="empty-state-box">
                  <strong>NO BUILDS YET</strong>
                  <p>Создай первую сборку, чтобы начать установку.</p>
                </div>
              ) : (
                sortedInstances.map((instance) => {
                  const cardAppearance = getBuildCardAppearance(instance.id);
                  const cardStyle: CSSProperties | undefined = getBuildCardAppearanceStyle(cardAppearance);

                  return (
                  <button
                    key={instance.id}
                    ref={(node) => {
                      if (node) {
                        instanceCardRefs.current.set(instance.id, node);
                      } else {
                        instanceCardRefs.current.delete(instance.id);
                      }
                    }}
                    className={`instance-card ${selectedInstanceId === instance.id ? "selected" : ""} ${cardAppearance.image ? "instance-card-with-image" : ""}`}
                    style={cardStyle}
                    onClick={() => {
                      setSelectedInstanceId(instance.id);
                      setCreateMode(false);
                      setMemoryGb(clampRamToSystem(instance.ram, systemRamGb));
                      setInstanceRamEditorOpen(false);
                    }}
                    type="button"
                  >
                    <div className="instance-card-top">
                      <span className="instance-name">{instance.name}</span>
                      {isRunning(instance.id) && cardAppearance.badgeEnabled && (
                        <span
                          className="instance-running-badge"
                          style={getBuildCardBadgeStyle(cardAppearance)}
                        >
                          {getBuildCardBadgeText(cardAppearance)}
                        </span>
                      )}
                    </div>
                    <div className="instance-card-meta">
                      <span>{instance.version}</span>
                      <span>{instance.loader}</span>
                      <span>{instance.ram} GB</span>
                      <span>{instance.lastPlayed}</span>
                    </div>
                  </button>
                );
                })
              )}
            </CustomScrollArea>
          </div>

          <div className="panel-card instance-details-card">
            {showCreator ? (
              <>
                <span className="panel-label">CREATE NEW BUILD</span>
                <div className="form-grid single-form-grid">
                  <label className="field">
                    <span>BUILD NAME</span>
                    <input
                      placeholder="My Vanilla Build"
                      value={createBuildName}
                      onChange={(e) => setCreateBuildName(e.target.value)}
                    />
                  </label>
                </div>

                <div className="inline-dropdown-grid" style={{ marginTop: 24 }}>
                  <InlineDropdown
                    label="MC VERSION"
                    value={createVersion || "SELECT VERSION"}
                    options={minecraftVersions}
                    isOpen={openDropdown === "create-version"}
                    onToggle={() => setOpenDropdown(openDropdown === "create-version" ? null : "create-version")}
                    onSelect={(value) => {
                      setCreateVersion(value);
                      setOpenDropdown(null);
                    }}
                  />

                  <div className="create-loader-stack">
                    <InlineDropdown
                      label="LOADER"
                      value={createLoader}
                      options={LOADER_OPTIONS}
                      isOpen={openDropdown === "create-loader"}
                      onToggle={() => setOpenDropdown(openDropdown === "create-loader" ? null : "create-loader")}
                      onSelect={(value) => {
                        const nextLoader = value as LoaderType;
                        setCreateLoader(nextLoader);
                        if (nextLoader !== "Fabric") {
                          setCreateFabricLoaderVersion("");
                        }
                        setOpenDropdown(null);
                      }}
                    />
                  </div>
                </div>

                <div className="detail-grid detail-grid-create" style={{ marginTop: 24 }}>
                  <div className="detail-block">
                    <span className="detail-title">INITIAL RAM</span>
                    <strong>{createRamGb} GB</strong>
                    <div style={{ marginTop: 14 }}>
                      <button className="ghost-action" type="button" onClick={() => setCreateRamEditorOpen(!createRamEditorOpen)}>
                        {createRamEditorOpen ? "HIDE RAM" : "EDIT RAM"}
                      </button>
                    </div>
                    {createRamEditorOpen && (
                      <div className="inline-ram-slider-wrap">
                        <ElementSlider
                          showHeader={false}
                          min={1}
                          max={systemRamGb}
                          step={1}
                          value={createRamGb}
                          tickMode="custom"
                          customTicks={Array.from(new Set([1, Math.max(1, Math.floor(systemRamGb / 3)), Math.max(1, Math.floor((systemRamGb / 3) * 2)), systemRamGb])).sort((a, b) => a - b)}
                          onChange={(value) => setCreateRamGb(clampRamToSystem(value, systemRamGb))}
                        />
                      </div>
                    )}
                  </div>

                  {createLoader === "Fabric" ? (
                    <div className="detail-block create-loader-detail-block">
                      <span className="detail-title">FABRIC LOADER VERSION</span>
                      <InlineDropdown
                        label=""
                        value={
                          fabricLoaderVersionsLoading
                            ? "LOADING..."
                            : createFabricLoaderVersion || "SELECT FABRIC VERSION"
                        }
                        options={fabricLoaderVersions}
                        isOpen={openDropdown === "create-fabric-loader"}
                        onToggle={() =>
                          setOpenDropdown(
                            openDropdown === "create-fabric-loader" ? null : "create-fabric-loader"
                          )
                        }
                        onSelect={(value) => {
                          setCreateFabricLoaderVersion(value);
                          setOpenDropdown(null);
                        }}
                      />
                    </div>
                  ) : null}
                </div>

                {createError && <p className="panel-text" style={{ color: "var(--accent)" }}>{createError}</p>}

                <div className="instance-actions">
                  <button className="primary-action" type="button" onClick={handleCreateBuild} disabled={working}>
                    {working ? "WORKING..." : "CREATE BUILD"}
                  </button>
                  {instances.length > 0 && <button className="ghost-action" onClick={() => setCreateMode(false)}>CANCEL</button>}
                  {advancedSettingsEnabled && (
                    <button
                      className="ghost-action icon-square-action settings-icon-action"
                      type="button"
                      onClick={() => openBuildCardSettings(null)}
                      title="Build settings"
                    >
                      <SettingsGearIcon />
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <span className="panel-label">BUILD CONFIGURATION</span>

                <div className="inline-dropdown-grid">
                  <InlineDropdown
                    label="SELECT BUILD"
                    value={selectedInstance?.name || "NO BUILD"}
                    options={instances.map((i) => i.name)}
                    isOpen={openDropdown === "build"}
                    onToggle={() => setOpenDropdown(openDropdown === "build" ? null : "build")}
                    onSelect={(value) => {
                      const found = instances.find((i) => i.name === value);
                      if (found) {
                        const nextRam = clampRamToSystem(found.ram, systemRamGb);
                        setSelectedInstanceId(found.id);
                        setMemoryGb(nextRam);
                        setInstanceRamDraft(nextRam);
                      }
                      setOpenDropdown(null);
                    }}
                  />

                  <div className="detail-block">
                    <span className="detail-title">MC VERSION</span>
                    <strong style={{ fontSize: "15px", display: "block", paddingTop: "18px" }}>{selectedInstance?.version}</strong>
                  </div>

                  <div className="detail-block">
                    <span className="detail-title">LOADER</span>
                    <strong style={{ fontSize: "15px", display: "block", paddingTop: "18px" }}>{selectedInstance?.loader}</strong>
                  </div>

                  <div className="detail-block">
                    <span className="detail-title">SOURCE</span>
                    <strong style={{ fontSize: "15px", display: "block", paddingTop: "18px" }}>OFFICIAL</strong>
                  </div>
                </div>

                <div className="detail-grid" style={{ marginTop: 24 }}>
                  <div className="detail-block">
                    <span className="detail-title">RAM ALLOCATED</span>
                    <strong>{instanceRamDraft} GB</strong>
                    <div style={{ marginTop: 14 }}>
                      <button className="ghost-action" type="button" onClick={() => setInstanceRamEditorOpen(!instanceRamEditorOpen)}>
                        {instanceRamEditorOpen ? "HIDE RAM" : "EDIT RAM"}
                      </button>
                    </div>
                    {instanceRamEditorOpen && (
                      <div className="inline-ram-slider-wrap">
                        <ElementSlider
                          showHeader={false}
                          min={1}
                          max={systemRamGb}
                          step={1}
                          value={instanceRamDraft}
                          tickMode="custom"
                          customTicks={Array.from(new Set([1, Math.max(1, Math.floor(systemRamGb / 3)), Math.max(1, Math.floor((systemRamGb / 3) * 2)), systemRamGb])).sort((a, b) => a - b)}
                          onChange={(value) => {
                            const nextValue = clampRamToSystem(value, systemRamGb);
                            setInstanceRamDraft(nextValue);
                            setMemoryGb(nextValue);
                          }}
                          onCommit={() => void commitSelectedInstanceRam()}
                        />
                      </div>
                    )}
                  </div>
                  <div className="detail-block">
                    <span className="detail-title">MODE</span>
                    <strong style={{ fontSize: "15px", display: "block", paddingTop: "18px" }}>OFFLINE VANILLA</strong>
                  </div>
                </div>

                {(busyMessage || actionError) && (
                  <div className="status-box">
                    {busyMessage && <p className="panel-text">{busyMessage}</p>}
                    {actionError && <p className="panel-text" style={{ color: "var(--accent)" }}>{actionError}</p>}
                  </div>
                )}

                {installProgress && (
                  <div className="download-progress-box">
                    <div className="download-progress-head">
                      <span>{installProgress.phase.toUpperCase()}</span>
                      <strong>{Math.round(installProgress.percent)}%</strong>
                    </div>
                    <div className="download-progress-track">
                      <div className="download-progress-fill" style={{ width: `${installProgress.percent}%` }} />
                    </div>
                  </div>
                )}

                <div className="instance-actions">
                  {selectedInstance && isRunning(selectedInstance.id) ? (
                    <button className="primary-action kill-action" type="button" onClick={() => handleKillGame(selectedInstance.id)}>
                      ✕ KILL GAME
                    </button>
                  ) : (
                    <button className="primary-action" type="button" onClick={() => handleLaunchSelected()} disabled={working}>
                      {working ? "WORKING..." : "PLAY BUILD"}
                    </button>
                  )}
                  <button className="ghost-action" type="button" onClick={handleInstallSelected} disabled={working}>INSTALL</button>
                  <button className="ghost-action" type="button" onClick={handleOpenFolder}>FOLDER</button>
                  <button className="ghost-action" type="button" onClick={() => setCreateMode(true)}>NEW BUILD</button>
                  <div className="instance-side-actions">
                    {advancedSettingsEnabled && (
                      <button
                        className="ghost-action icon-square-action settings-icon-action"
                        type="button"
                        onClick={() => openBuildCardSettings(selectedInstance?.id ?? null)}
                        title="Build settings"
                      >
                        <SettingsGearIcon />
                      </button>
                    )}
                    <button
                      className="ghost-action icon-square-action trash-action"
                      type="button"
                      title="Удалить сборку"
                      onClick={() => selectedInstance && handleDeleteInstance(selectedInstance.id)}
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M1 3.5h12M5 3.5V2.5a1 1 0 011-1h2a1 1 0 011 1v1M5.5 6v5M8.5 6v5M2.5 3.5l.7 8a1 1 0 001 .9h5.6a1 1 0 001-.9l.7-8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    );
  };

  const renderMods = () => (
    <section className="launcher-panel">
      <div className="panel-grid panel-grid-catalog-fixed">
        <div className="panel-card catalog-toolbar-card">
          <div className="toolbar-row toolbar-row-single modrinth-toolbar-grid">
            <label className="field compact-field search-field">
              <span>MODRINTH SEARCH</span>
              <input
                placeholder="Search Fabric mods..."
                value={modSearch}
                onChange={(e) => setModSearch(e.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="panel-card mod-list-card">
          <div className="card-topline">
            <span className="panel-label">DISCOVER / INSTALL</span>
            <span className="status-code">{modrinthItems.length} / {modrinthTotalHits} RESULTS</span>
          </div>

          {modrinthError && (
            <p className="panel-text" style={{ color: "var(--accent)", marginTop: 0 }}>
              {modrinthError}
            </p>
          )}

          {!selectedModTarget ? (
            <div className="empty-state-box">
              <strong>NO FABRIC BUILDS</strong>
              <p>Создай Fabric-сборку во вкладке BUILDS, чтобы устанавливать моды с Modrinth.</p>
            </div>
          ) : (
            <CustomScrollArea
              className="mod-list mods-feed"
              onWheel={(e: any) => e.stopPropagation()}
              onScroll={(e) => {
                const target = e.currentTarget;
                const remaining = target.scrollHeight - target.scrollTop - target.clientHeight;
                if (remaining < 280) {
                  void handleLoadMoreMods();
                }
              }}
              style={{ flex: 1, minHeight: 0 }}
            >
              {modrinthLoading && modrinthItems.length === 0 ? (
                <div className="empty-state-box">
                  <strong>LOADING MODS</strong>
                  <p>Подтягиваю список модов с Modrinth.</p>
                </div>
              ) : modrinthItems.length === 0 ? (
                <div className="empty-state-box">
                  <strong>NOTHING FOUND</strong>
                  <p>Попробуй другой запрос или другую Fabric-версию.</p>
                </div>
              ) : (
                <>
{modrinthItems.map((item) => {
  const category = item.displayCategories?.[0] || item.categories?.[0] || "Fabric";
  const installing = modrinthInstallBusyId === item.projectId;
  return (
    <div 
      className="mod-card modrinth-card" 
      key={item.projectId}
      onClick={() => setViewingMod(item)} // Открытие модалки при клике на карточку
      style={{ cursor: 'pointer' }}
    >
      <div className="mod-card-head">
        <div className="mod-title-row">
          <h3>{item.title}</h3>
          <span className="mod-category">{category.toUpperCase()}</span>
        </div>
        
        <div style={{ display: 'flex', gap: '8px' }} onClick={(e) => e.stopPropagation()}> 
          {/* stopPropagation чтобы клик по кнопке не открывал модалку */}
          {item.installed ? (
            <>
              <button
                className="ghost-action"
                style={{ color: 'var(--accent)', borderColor: 'rgba(194, 65, 12, 0.2)' }}
                type="button"
                onClick={() => void handleUninstallMod(item.projectId)}
                disabled={installing}
              >
                {installing ? "..." : "REMOVE"}
              </button>
              <button
                className="ghost-action installed"
                type="button"
                onClick={() => void handleInstallMod(item.projectId)}
                disabled={installing}
              >
                {installing ? "..." : "UPDATE"}
              </button>
            </>
          ) : (
            <button
              className="primary-action"
              style={{ padding: '10px 20px', fontSize: '10px' }}
              type="button"
              onClick={() => void handleInstallMod(item.projectId)}
              disabled={installing || !selectedModTarget}
            >
              {installing ? "INSTALLING..." : "INSTALL"}
            </button>
          )}
        </div>
      </div>

      {/* ПЕРЕНЕСЛИ ОПИСАНИЕ ВЫШЕ */}
      <p className="mod-description" style={{ marginTop: '4px', marginBottom: '12px' }}>
        {item.description.length > 160 
          ? item.description.substring(0, 160) + "..." 
          : item.description}
      </p>

      <div className="mod-meta-strip">
        <span>BY {item.author.toUpperCase()}</span>
        <span>{item.downloads.toLocaleString()} DOWNLOADS</span>
        <span>{item.follows.toLocaleString()} FOLLOWERS</span>
      </div>
    </div>
  );
})}

                  {modrinthLoadingMore && (
                    <div className="catalog-loading-row">Loading more mods...</div>
                  )}
                </>
              )}
            </CustomScrollArea>
          )}
        </div>

        <div className="panel-card install-sidebar-card">
          <span className="panel-label">CURRENT TARGET</span>

          <div style={{ marginBottom: 24 }}>
            <InlineDropdown
              label="FABRIC BUILD"
              value={selectedModTarget?.name || "SELECT FABRIC BUILD"}
              options={fabricInstances.map((i) => i.name)}
              isOpen={openDropdown === "target-mods"}
              onToggle={() => setOpenDropdown(openDropdown === "target-mods" ? null : "target-mods")}
              onSelect={(value) => {
                const found = fabricInstances.find((i) => i.name === value);
                if (found) {
                  setSelectedInstanceId(found.id);
                  setSelectedModrinthVersion(found.version);
                }
                setOpenDropdown(null);
              }}
            />
          </div>

          <div className="detail-grid">
            <div className="detail-block">
              <span className="detail-title">TARGET VERSION</span>
              <strong>{selectedModTarget?.version || selectedModrinthVersion || "—"}</strong>
            </div>
            <div className="detail-block">
              <span className="detail-title">LOADER</span>
              <strong>FABRIC</strong>
            </div>
          </div>

          <div className="installed-mods-block">
            <div className="card-topline installed-mods-head">
              <span className="panel-label">INSTALLED MODS</span>
              <span className="status-code">{installedMods.length}</span>
            </div>

            <div className="installed-mods-list">
              {installedModsLoading ? (
                <div className="catalog-loading-row">Reading installed mods...</div>
              ) : installedMods.length === 0 ? (
                <div className="empty-state-box compact-empty">
                  <strong>EMPTY</strong>
                  <p>Пока что в этой сборке нет установленных модов.</p>
                </div>
              ) : (
installedMods.map((mod) => {
  const uninstalling = modrinthInstallBusyId === mod.projectId;

  return (
    <div
      className="installed-mod-swipe"
      key={`${mod.filename}-${mod.projectId ?? "local"}`}
    >
      <div className="installed-mod-delete-slot">
        <button
          className="installed-mod-delete-btn"
          type="button"
          title="Удалить мод"
          disabled={uninstalling || !mod.projectId}
          onClick={() => mod.projectId && void handleUninstallMod(mod.projectId)}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M1 3.5h12M5 3.5V2.5a1 1 0 011-1h2a1 1 0 011 1v1M5.5 6v5M8.5 6v5M2.5 3.5l.7 8a1 1 0 001 .9h5.6a1 1 0 001-.9l.7-8"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <div className="installed-mod-row">
        <div>
          <strong>{mod.title}</strong>
          <span>{mod.versionNumber || mod.filename}</span>
        </div>
        <em>{mod.source.toUpperCase()}</em>
      </div>
    </div>
  );
})
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );

  const renderResourcepacks = () => (
    <section className="launcher-panel">
      <div className="panel-grid panel-grid-catalog-fixed">
        <div className="panel-card catalog-toolbar-card">
          <div className="toolbar-row toolbar-row-single">
            <label className="field compact-field search-field">
              <span>PACK SEARCH</span>
              <input
                placeholder="Search resource packs..."
                value={packSearch}
                onChange={(e) => setPackSearch(e.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="panel-card mod-list-card">
          <div className="card-topline">
            <span className="panel-label">RESOURCE PACKS</span>
            <span className="status-code">
              {packItems.length} / {packTotalHits} RESULTS
            </span>
          </div>

          {packError && (
            <p className="panel-text" style={{ color: "var(--accent)", marginTop: 0 }}>
              {packError}
            </p>
          )}

          {!selectedInstance ? (
            <div className="empty-state-box">
              <strong>NO BUILDS</strong>
              <p>Создай сборку во вкладке BUILDS, чтобы ставить resource packs с Modrinth.</p>
            </div>
          ) : (
            <CustomScrollArea
              className="mod-list mods-feed"
              onWheel={(e: any) => e.stopPropagation()}
              onScroll={(e) => {
                const target = e.currentTarget;
                const remaining = target.scrollHeight - target.scrollTop - target.clientHeight;
                if (remaining < 280) {
                  void handleLoadMorePacks();
                }
              }}
              style={{ flex: 1, minHeight: 0 }}
            >
                {packLoading && packItems.length === 0 ? (
                  <div className="empty-state-box loading-state-box">
                    <strong>LOADING RESOURCE PACKS</strong>
                    <p>Подгружаю каталог resource packs.</p>
                  </div>
                ) : packItems.length === 0 ? (
                <div className="empty-state-box">
                  <strong>NOTHING FOUND</strong>
                  <p>Попробуй другой запрос или другую версию Minecraft.</p>
                </div>
              ) : (
                <>
                  {packItems.map((item) => {
                    const category =
                      item.displayCategories?.[0] ||
                      item.categories?.[0] ||
                      "Resource Pack";
                    const installing = packInstallBusyId === item.projectId;

                    return (
                      <div
                        className="mod-card modrinth-card"
                        key={item.projectId}
                        onClick={() => setViewingMod(item)}
                        style={{ cursor: "pointer" }}
                      >
                        <div className="mod-card-head">
                          <div className="mod-title-row">
                            <h3>{item.title}</h3>
                            <span className="mod-category">{category.toUpperCase()}</span>
                          </div>

                          <div
                            style={{ display: "flex", gap: "8px" }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {item.installed ? (
                              <>
                                <button
                                  className="ghost-action"
                                  style={{
                                    color: "var(--accent)",
                                    borderColor: "rgba(194, 65, 12, 0.2)",
                                  }}
                                  type="button"
                                  onClick={() => void handleUninstallPack(item.projectId)}
                                  disabled={installing}
                                >
                                  {installing ? "..." : "REMOVE"}
                                </button>
                                <button
                                  className="ghost-action installed"
                                  type="button"
                                  onClick={() => void handleInstallPack(item.projectId)}
                                  disabled={installing}
                                >
                                  {installing ? "..." : "UPDATE"}
                                </button>
                              </>
                            ) : (
                              <button
                                className="primary-action"
                                style={{ padding: "10px 20px", fontSize: "10px" }}
                                type="button"
                                onClick={() => void handleInstallPack(item.projectId)}
                                disabled={installing || !selectedInstance}
                              >
                                {installing ? "INSTALLING..." : "INSTALL"}
                              </button>
                            )}
                          </div>
                        </div>

                        <p
                          className="mod-description"
                          style={{ marginTop: "4px", marginBottom: "12px" }}
                        >
                          {item.description.length > 160
                            ? item.description.substring(0, 160) + "..."
                            : item.description}
                        </p>

                        <div className="mod-meta-strip">
                          <span>BY {item.author.toUpperCase()}</span>
                          <span>{item.downloads.toLocaleString()} DOWNLOADS</span>
                          <span>{item.follows.toLocaleString()} FOLLOWERS</span>
                        </div>
                      </div>
                    );
                  })}

                  {packLoadingMore && (
                    <div className="catalog-loading-row">Loading more packs...</div>
                  )}
                </>
              )}
            </CustomScrollArea>
          )}
        </div>

        <div className="panel-card install-sidebar-card">
          <span className="panel-label">ACTIVE PROFILE</span>

          <div style={{ marginBottom: 24 }}>
            <InlineDropdown
              label="TARGET BUILD"
              value={selectedInstance?.name || "SELECT BUILD"}
              options={instances.map((i) => i.name)}
              isOpen={openDropdown === "target-packs"}
              onToggle={() => setOpenDropdown(openDropdown === "target-packs" ? null : "target-packs")}
              onSelect={(value) => {
                const found = instances.find((i) => i.name === value);
                if (found) setSelectedInstanceId(found.id);
                setOpenDropdown(null);
              }}
            />
          </div>

          <div className="detail-grid">
            <div className="detail-block">
              <span className="detail-title">TARGET VERSION</span>
              <strong>{selectedInstance?.version || "—"}</strong>
            </div>
            <div className="detail-block">
              <span className="detail-title">FOLDER</span>
              <strong>RESOURCEPACKS</strong>
            </div>
          </div>

          <div className="installed-mods-block">
            <div className="card-topline installed-mods-head">
              <span className="panel-label">INSTALLED PACKS</span>
              <span className="status-code">{installedPacks.length}</span>
            </div>

            <div className="installed-mods-list">
              {installedPacksLoading ? (
                <div className="catalog-loading-row">Reading installed resource packs...</div>
              ) : installedPacks.length === 0 ? (
                <div className="empty-state-box compact-empty">
                  <strong>EMPTY</strong>
                  <p>Пока что в этой сборке нет установленных resource packs.</p>
                </div>
              ) : (
                installedPacks.map((pack) => {
                  const uninstalling = packInstallBusyId === pack.projectId;

                  return (
                    <div className="installed-mod-swipe" key={pack.filename}>
                      <div
                        className="installed-mod-delete-slot"
                        style={{ opacity: 1, pointerEvents: "auto" }}
                      >
                      <button
                        className="installed-mod-delete-btn"
                        type="button"
                        title="Удалить ресурс пак"
                        disabled={!pack.projectId || uninstalling}
                        onClick={() => pack.projectId && void handleUninstallPack(pack.projectId)}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 14 14"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M1 3.5h12M5 3.5V2.5a1 1 0 011-1h2a1 1 0 011 1v1M5.5 6v5M8.5 6v5M2.5 3.5l.7 8a1 1 0 001 .9h5.6a1 1 0 001-.9l.7-8"
                            stroke="currentColor"
                            strokeWidth="1.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                      </div>

                      <div className="installed-mod-row">
                        <div>
                          <strong>{pack.title}</strong>
                          <span>{pack.versionNumber || pack.filename}</span>
                        </div>
                        <em>{pack.source.toUpperCase()}</em>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );

  const renderShaders = () => (
    <section className="launcher-panel">
      <div className="panel-grid panel-grid-catalog-fixed">
        <div className="panel-card catalog-toolbar-card">
          <div className="toolbar-row toolbar-row-single">
            <label className="field compact-field search-field">
              <span>SHADER SEARCH</span>
              <input
                placeholder="Search shaders..."
                value={shaderSearch}
                onChange={(e) => setShaderSearch(e.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="panel-card mod-list-card">
          <div className="card-topline">
            <span className="panel-label">SHADERPACKS</span>
            <span className="status-code">{shaderItems.length} / {shaderTotalHits} RESULTS</span>
          </div>

          {shaderError && (
            <p className="panel-text" style={{ color: "var(--accent)", marginTop: 0 }}>
              {shaderError}
            </p>
          )}

          {!selectedShaderTarget ? (
            <div className="empty-state-box">
              <strong>NO BUILDS</strong>
              <p>Создай сборку во вкладке BUILDS, чтобы ставить shaderpacks с Modrinth.</p>
            </div>
          ) : (
            <CustomScrollArea
              className="mod-list mods-feed"
              onWheel={(e: any) => e.stopPropagation()}
              onScroll={(e) => {
                const target = e.currentTarget;
                const remaining = target.scrollHeight - target.scrollTop - target.clientHeight;
                if (remaining < 280) {
                  void handleLoadMoreShaders();
                }
              }}
              style={{ flex: 1, minHeight: 0 }}
            >
                {shaderLoading && shaderItems.length === 0 ? (
                  <div className="empty-state-box loading-state-box">
                    <strong>LOADING SHADERS</strong>
                    <p>Подгружаю каталог shaderpacks.</p>
                  </div>
                ) : shaderItems.length === 0 ? (
                <div className="empty-state-box">
                  <strong>NOTHING FOUND</strong>
                  <p>Попробуй другой запрос или другую версию Minecraft.</p>
                </div>
              ) : (
                <>
                  {shaderItems.map((item) => {
                    const category =
                      item.displayCategories?.[0] ||
                      item.categories?.[0] ||
                      "Shader";
                    const installing = shaderInstallBusyId === item.projectId;

                    return (
                      <div
                        className="mod-card modrinth-card"
                        key={item.projectId}
                        onClick={() => setViewingMod(item)}
                        style={{ cursor: "pointer" }}
                      >
                        <div className="mod-card-head">
                          <div className="mod-title-row">
                            <h3>{item.title}</h3>
                            <span className="mod-category">{category.toUpperCase()}</span>
                          </div>

                          <div
                            style={{ display: "flex", gap: "8px" }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {item.installed ? (
                              <>
                                <button
                                  className="ghost-action installed"
                                  type="button"
                                  disabled
                                >
                                  DOWNLOADED
                                </button>
                                <button
                                  className="ghost-action"
                                  type="button"
                                  disabled={installing}
                                  onClick={() => void handleUninstallShader(item.projectId)}
                                >
                                  {installing ? "REMOVING..." : "DELETE"}
                                </button>
                              </>
                            ) : (
                              <button
                                className="ghost-action"
                                type="button"
                                disabled={installing}
                                onClick={() => void handleInstallShader(item.projectId)}
                              >
                                {installing ? "INSTALLING..." : "INSTALL"}
                              </button>
                            )}
                          </div>
                        </div>

                        <p className="mod-description">
                          {item.description.length > 160
                            ? `${item.description.slice(0, 160)}...`
                            : item.description}
                        </p>

                        <div className="mod-meta-strip">
                          <span>BY {item.author.toUpperCase()}</span>
                          <span>{item.downloads.toLocaleString()} DOWNLOADS</span>
                          <span>{item.follows.toLocaleString()} FOLLOWERS</span>
                        </div>
                      </div>
                    );
                  })}

                  {shaderLoadingMore && (
                    <div className="catalog-loading-row">Loading more shaders...</div>
                  )}
                </>
              )}
            </CustomScrollArea>
          )}
        </div>

        <div className="panel-card install-sidebar-card">
          <span className="panel-label">ACTIVE PROFILE</span>

          <div style={{ marginBottom: 24 }}>
            <InlineDropdown
              label="TARGET BUILD"
              value={selectedShaderTarget?.name || "SELECT BUILD"}
              options={instances.map((i) => i.name)}
              isOpen={openDropdown === "target-shaders"}
              onToggle={() =>
                setOpenDropdown(openDropdown === "target-shaders" ? null : "target-shaders")
              }
              onSelect={(value) => {
                const found = instances.find((i) => i.name === value);
                if (found) setSelectedInstanceId(found.id);
                setOpenDropdown(null);
              }}
              instanceInfos={instances.map((i) => ({
                name: i.name,
                id: i.id,
                loader: i.loader,
              }))}
            />
          </div>

          <div className="detail-grid">
            <div className="detail-block">
              <span className="detail-title">TARGET VERSION</span>
              <strong>{selectedShaderTarget?.version || "—"}</strong>
            </div>
            <div className="detail-block">
              <span className="detail-title">FOLDER</span>
              <strong>SHADERPACKS</strong>
            </div>
          </div>

          <div className="installed-mods-block">
            <div className="card-topline installed-mods-head">
              <span className="panel-label">INSTALLED SHADERS</span>
              <span className="status-code">{installedShaders.length}</span>
            </div>

            <div className="installed-mods-list">
              {installedShadersLoading ? (
                <div className="catalog-loading-row">Reading installed shaders...</div>
              ) : installedShaders.length === 0 ? (
                <div className="empty-state-box compact-empty">
                  <strong>EMPTY</strong>
                  <p>Пока что в этой сборке нет установленных shaderpacks.</p>
                </div>
              ) : (
                installedShaders.map((shader) => {
                  const uninstalling = shaderInstallBusyId === shader.projectId;

                  return (
                    <div className="installed-mod-swipe" key={shader.filename}>
                      <div
                        className="installed-mod-delete-slot"
                        style={{ opacity: 1, pointerEvents: "auto" }}
                      >
<button
  className="installed-mod-delete-btn"
  type="button"
  title="Удалить шейдер"
  disabled={!shader.projectId || uninstalling}
  onClick={() =>
    shader.projectId && void handleUninstallShader(shader.projectId)
  }
>
  <svg
    width="14"
    height="14"
    viewBox="0 0 14 14"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M1 3.5h12M5 3.5V2.5a1 1 0 011-1h2a1 1 0 011 1v1M5.5 6v5M8.5 6v5M2.5 3.5l.7 8a1 1 0 001 .9h5.6a1 1 0 001-.9l.7-8"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
</button>
                      </div>

                      <div className="installed-mod-row">
                        <div>
                          <strong>{shader.title}</strong>
                          <span>{shader.versionNumber || shader.filename}</span>
                        </div>
                        <em>{shader.source.toUpperCase()}</em>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );

  const renderSettings = () => (
    <section className="launcher-panel">
      <div className="panel-grid simple-two-col-fixed">
        <div className="panel-card">
          <span className="panel-label">LAUNCHER SETTINGS</span>

          <div className="settings-memory-block">
            <div className="memory-readout">
              <span className="memory-number">{settingsRamDraft}</span>
              <span className="memory-unit">GB</span>
            </div>

            <div className="settings-element-slider">
              <ElementSlider
                showHeader={false}
                min={1}
                max={systemRamGb}
                step={1}
                value={settingsRamDraft}
                tickMode="custom"
                customTicks={Array.from(new Set([1, Math.max(1, Math.floor(systemRamGb / 3)), Math.max(1, Math.floor((systemRamGb / 3) * 2)), systemRamGb])).sort((a, b) => a - b)}
                onChange={(value) => {
                  setSettingsRamDraft(clampRamToSystem(value, systemRamGb));
                }}
                onCommit={() => void saveSettingsRam()}
              />
            </div>
          </div>


          <div className="settings-toggle-block">
            <ElementToggle
              title="WHEEL TAB SWITCHING"
              note="Переключение вкладок движением колеса мыши."
              enabled={wheelTabSwitching}
              onToggle={() => setWheelTabSwitching((prev) => !prev)}
            />

            <ElementToggle
              title="SHOW SNAPSHOTS"
              note="Показывать snapshot версии в списке доступных установок."
              enabled={showSnapshots}
              onToggle={() => setShowSnapshots((prev) => !prev)}
            />

            <ElementToggle
              title="SHOW PRE-RELEASES"
              note="Показывать pre-release и release candidate версии."
              enabled={showPreReleases}
              onToggle={() => setShowPreReleases((prev) => !prev)}
            />

            <ElementToggle
              title="ADVANCED SETTINGS"
              note="Включает кнопку SETTINGS у сборок и в режиме создания для кастомного фона карточки версии."
              enabled={advancedSettingsEnabled}
              onToggle={() => {
                setAdvancedSettingsEnabled((prev) => {
                  const next = !prev;
                  window.localStorage.setItem(
                    ADVANCED_SETTINGS_STORAGE_KEY,
                    String(next)
                  );
                  return next;
                });
              }}
            />
          </div>

          <div className="form-grid single-form-grid">
            <label className="field">
              <span>JAVA PATH</span>
              <input value="JAVA_HOME or PATH" readOnly />
            </label>
          </div>
        </div>

        <div className="panel-card">
          <span className="panel-label">RUNTIME</span>
          <div className="stat-list">
            <div className="stat-row">
              <span>WINDOW ENGINE</span>
              <strong>TAURI</strong>
            </div>
            <div className="stat-row">
              <span>CORE</span>
              <strong>RUST</strong>
            </div>
            <div className="stat-row">
              <span>FRONTEND</span>
              <strong>REACT</strong>
            </div>
            <div className="stat-row">
              <span>ACCOUNT</span>
              <strong>{accountType}</strong>
            </div>
            <div className="stat-row">
              <span>SYSTEM RAM</span>
              <strong>{systemRamGb} GB</strong>
            </div>
            <div className="stat-row">
              <span>DEFAULT BUILD RAM</span>
              <strong>{settingsRamDraft} GB</strong>
            </div>
            <div className="stat-row">
              <span>SNAPSHOTS</span>
              <strong>{showSnapshots ? "ON" : "OFF"}</strong>
            </div>
            <div className="stat-row">
              <span>PRE-RELEASES</span>
              <strong>{showPreReleases ? "ON" : "OFF"}</strong>
            </div>
            <div className="stat-row">
              <span>ADVANCED SETTINGS</span>
              <strong>{advancedSettingsEnabled ? "ON" : "OFF"}</strong>
            </div>
            <div className="stat-row">
              <span>MANIFEST</span>
              <strong>{manifestLoading ? "LOADING" : manifest ? "READY" : "ERROR"}</strong>
            </div>
          </div>
        </div>
      </div>
    </section>
  );

  const renderMainContent = () => {
    switch (activeTab) {
      case "overview": return renderOverview();
      case "instances": return renderInstances();
      case "mods": return renderMods();
      case "resourcepacks": return renderResourcepacks();
      case "shaders": return renderShaders();
      case "settings": return renderSettings();
      default: return renderOverview();
    }
  };

  const renderRightPanel = () => {
    if (activeTab !== "overview" || !selectedInstance) return null;

    return (
      <div className="image-mockup launcher-mockup">
        <div className="lines-pattern" />
        <div className="mockup-overlay">
          <div className="mockup-block">
            <span className="mockup-label">ACTIVE BUILD</span>
            <strong>{selectedInstance.name}</strong>
          </div>

          <div className="mockup-block">
            <span className="mockup-label">TIME IN GAME</span>
            <strong>{selectedInstance.playtimeHours} H</strong>
          </div>

          <div className="mockup-split-row">
            <div className="mockup-block">
              <span className="mockup-label">NICKNAME</span>

              <HoverRevealValue value={nickname}>
                <input
                  className="mockup-input mockup-input-uppercase"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  spellCheck={false}
                />
              </HoverRevealValue>
            </div>

            <div className="mockup-block mockup-account-dropdown">
              <InlineDropdown
                label="ACCOUNT"
                value={accountType}
                options={["OFFLINE", "MICROSOFT"]}
                isOpen={openDropdown === "account"}
                onToggle={() =>
                  setOpenDropdown(openDropdown === "account" ? null : "account")
                }
                onSelect={(value) => {
                  setAccountType(value);
                  setOpenDropdown(null);
                }}
              />
            </div>
          </div>
        </div>
      </div>
    );
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
          {renderRightPanel()}
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
          buildName={buildSettingsTargetId ? selectedInstance?.name || "SELECTED BUILD" : createPreviewName}
          buildVersion={buildSettingsTargetId ? selectedInstance?.version || "—" : createPreviewVersion}
          buildLoader={buildSettingsTargetId ? selectedInstance?.loader || "—" : createPreviewLoader}
          buildRamGb={buildSettingsTargetId ? selectedInstance?.ram || 0 : createPreviewRam}
          lastPlayedLabel={buildSettingsTargetId ? selectedInstance?.lastPlayed || "NEVER" : "NEVER"}
          previewCardSize={buildCardPreviewSize}
          draft={buildCardSettingsDraft}
          onDraftChange={setBuildCardSettingsDraft}
          onUploadImage={handleBuildCardImagePicked}
          onResetAll={clearBuildCardSettings}
          onClose={closeBuildCardSettings}
          onSave={saveBuildCardSettings}
        />
      )}

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
    </div>
  );
}

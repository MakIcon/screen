import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  ActionResult,
  InstalledModView,
  InstanceItem,
  ModDownloadProgressPayload,
  ModrinthProject,
  ModrinthSearchResponse,
  TabKey,
} from "../types";
import { toErrorMessage } from "../utils/errors";
import { RequestGeneration } from "../utils/requestGeneration";
import type { PushToast } from "./useToasts";

export type ModrinthContentKind = "mods" | "resourcepacks" | "shaders";

type ContentCommands = {
  tab: TabKey;
  search: string;
  list: string;
  install: string;
  uninstall: string;
  includeGameVersion: boolean;
  installingMessage: string;
  installedMessage: string;
  uninstallingMessage: string;
  installedTitle: string;
  installFailedTitle: string;
  removedTitle: string;
};

const PAGE_SIZE = 24;
const SEARCH_DEBOUNCE_MS = 180;

const CONTENT_COMMANDS: Record<ModrinthContentKind, ContentCommands> = {
  mods: {
    tab: "mods",
    search: "search_modrinth_mods",
    list: "list_installed_mods",
    install: "install_modrinth_project",
    uninstall: "uninstall_modrinth_mod",
    includeGameVersion: false,
    installingMessage: "Установка мода и обязательных зависимостей…",
    installedMessage: "Мод и обязательные зависимости установлены",
    uninstallingMessage: "Uninstalling mod...",
    installedTitle: "Mod installed",
    installFailedTitle: "Mod install failed",
    removedTitle: "Mod removed",
  },
  resourcepacks: {
    tab: "resourcepacks",
    search: "search_modrinth_resourcepacks",
    list: "list_installed_resourcepacks",
    install: "install_modrinth_resourcepack",
    uninstall: "uninstall_modrinth_resourcepack",
    includeGameVersion: true,
    installingMessage: "Installing resource pack...",
    installedMessage: "Resource pack install finished",
    uninstallingMessage: "Uninstalling resource pack...",
    installedTitle: "Resource pack installed",
    installFailedTitle: "Resource pack install failed",
    removedTitle: "Resource pack removed",
  },
  shaders: {
    tab: "shaders",
    search: "search_modrinth_shaders",
    list: "list_installed_shaders",
    install: "install_modrinth_shader",
    uninstall: "uninstall_modrinth_shader",
    includeGameVersion: true,
    installingMessage: "Installing shader...",
    installedMessage: "Shader install finished",
    uninstallingMessage: "Uninstalling shader...",
    installedTitle: "Shader installed",
    installFailedTitle: "Shader install failed",
    removedTitle: "Shader removed",
  },
};

type UseModrinthContentParams = {
  kind: ModrinthContentKind;
  activeTab: TabKey;
  target: InstanceItem | null;
  setActionError: (message: string) => void;
  setBusyMessage: (message: string) => void;
  pushToast: PushToast;
};

export type ModrinthContentController = {
  search: string;
  setSearch: (value: string) => void;
  items: ModrinthProject[];
  totalHits: number;
  loading: boolean;
  loadingMore: boolean;
  error: string;
  busyProjectId: string | null;
  installedItems: InstalledModView[];
  installedLoading: boolean;
  downloadProgress: ModDownloadProgressPayload | null;
  loadMore: () => Promise<void>;
  install: (projectId: string) => Promise<void>;
  uninstall: (projectId: string) => Promise<void>;
  setDownloadPaused: (paused: boolean) => Promise<void>;
  cancelDownload: () => Promise<void>;
};

export function useModrinthContent({
  kind,
  activeTab,
  target,
  setActionError,
  setBusyMessage,
  pushToast,
}: UseModrinthContentParams): ModrinthContentController {
  const commands = CONTENT_COMMANDS[kind];
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<ModrinthProject[]>([]);
  const [totalHits, setTotalHits] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [busyProjectId, setBusyProjectId] = useState<string | null>(null);
  const [installedItems, setInstalledItems] = useState<InstalledModView[]>([]);
  const [installedLoading, setInstalledLoading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<ModDownloadProgressPayload | null>(null);
  const clearBusyTimer = useRef<number | null>(null);
  const searchRequests = useRef(new RequestGeneration());
  const installedRequests = useRef(new RequestGeneration());
  const loadMoreInFlight = useRef<(() => boolean) | null>(null);
  const targetKey = JSON.stringify([
    kind,
    target?.id,
    target?.version,
    target?.loader,
    target?.loaderVersion,
  ]);
  const searchKey = JSON.stringify([targetKey, activeTab, search.trim()]);
  const contextRef = useRef({ targetKey, searchKey });
  contextRef.current = { targetKey, searchKey };

  const buildSearchArguments = (offset: number, limit: number) => ({
    instanceId: target?.id,
    query: search.trim(),
    ...(commands.includeGameVersion ? { gameVersion: target?.version } : {}),
    offset,
    limit,
  });

  const fetchSearchPage = (offset: number, limit: number) =>
    invoke<ModrinthSearchResponse>(commands.search, buildSearchArguments(offset, limit));

  const fetchInstalled = () => {
    if (!target) return Promise.resolve([] as InstalledModView[]);
    return invoke<InstalledModView[]>(commands.list, { instanceId: target.id });
  };

  const refreshContent = async () => {
    if (contextRef.current.targetKey !== targetKey) return;
    const refreshSearch = contextRef.current.searchKey === searchKey;
    const searchCurrent = refreshSearch ? searchRequests.current.begin() : () => false;
    const installedCurrent = installedRequests.current.begin();
    if (refreshSearch) {
      setLoading(true);
      setLoadingMore(false);
    }
    const [searchResult, installedResult] = await Promise.allSettled([
      refreshSearch ? fetchSearchPage(0, Math.max(items.length, PAGE_SIZE)) : Promise.resolve(null),
      fetchInstalled(),
    ]);
    if (searchCurrent() && contextRef.current.searchKey === searchKey) {
      if (searchResult.status === "fulfilled" && searchResult.value) {
        setItems(searchResult.value.hits);
        setTotalHits(searchResult.value.totalHits);
      } else if (searchResult.status === "rejected") setError(toErrorMessage(searchResult.reason));
      setLoading(false);
    }
    if (installedCurrent() && contextRef.current.targetKey === targetKey) {
      if (installedResult.status === "fulfilled") setInstalledItems(installedResult.value);
      else setError(toErrorMessage(installedResult.reason));
      setInstalledLoading(false);
    }
  };

  const scheduleBusyMessageClear = () => {
    if (clearBusyTimer.current !== null) {
      window.clearTimeout(clearBusyTimer.current);
    }
    clearBusyTimer.current = window.setTimeout(() => {
      setBusyMessage("");
      clearBusyTimer.current = null;
    }, 800);
  };

  useEffect(() => {
    return () => {
      if (clearBusyTimer.current !== null) {
        window.clearTimeout(clearBusyTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (kind !== "mods") return;
    setDownloadProgress(null);
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<ModDownloadProgressPayload>("mod-download-progress", (event) => {
      if (event.payload.instanceId !== target?.id) return;
      setDownloadProgress(event.payload);
    })
      .then((dispose) => {
        if (disposed) dispose();
        else unlisten = dispose;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [kind, target?.id]);

  useEffect(() => {
    const requests = installedRequests.current;
    const current = requests.begin();
    const isCurrent = () => current() && contextRef.current.targetKey === targetKey;
    setInstalledItems([]);

    if (!target) {
      setInstalledLoading(false);
      return;
    }

    setInstalledLoading(true);
    void invoke<InstalledModView[]>(commands.list, { instanceId: target.id })
      .then((result) => {
        if (isCurrent()) setInstalledItems(result);
      })
      .catch((caught) => {
        if (isCurrent()) {
          setInstalledItems([]);
          setError(toErrorMessage(caught));
        }
      })
      .finally(() => {
        if (isCurrent()) setInstalledLoading(false);
      });

    return () => {
      requests.invalidate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- targetKey covers the target identity and compatibility fields
  }, [commands.list, targetKey]);

  useEffect(() => {
    const requests = searchRequests.current;
    const current = requests.begin();
    const isCurrent = () => current() && contextRef.current.searchKey === searchKey;
    setLoading(false);
    setLoadingMore(false);
    setItems([]);
    setTotalHits(0);
    if (activeTab !== commands.tab || !target || (commands.includeGameVersion && !target.version)) {
      return;
    }

    setLoading(true);
    const timer = window.setTimeout(() => {
      setError("");
      void invoke<ModrinthSearchResponse>(commands.search, buildSearchArguments(0, PAGE_SIZE))
        .then((result) => {
          if (!isCurrent()) return;
          setItems(result.hits);
          setTotalHits(result.totalHits);
        })
        .catch((caught) => {
          if (!isCurrent()) return;
          setItems([]);
          setTotalHits(0);
          setError(toErrorMessage(caught));
        })
        .finally(() => {
          if (isCurrent()) setLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      requests.invalidate();
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- searchKey includes tab, query and target compatibility; args are rebuilt inside
  }, [commands, searchKey]);

  const loadMore = async () => {
    if (!target || loadingMore || loading || items.length >= totalHits) return;
    if (loadMoreInFlight.current?.()) return;
    const current = searchRequests.current.capture();
    const isCurrent = () => current() && contextRef.current.searchKey === searchKey;
    loadMoreInFlight.current = isCurrent;

    try {
      setLoadingMore(true);
      const result = await fetchSearchPage(items.length, PAGE_SIZE);
      if (!isCurrent()) return;
      setItems((current) => {
        const existingIds = new Set(current.map((item) => item.projectId));
        return [...current, ...result.hits.filter((item) => !existingIds.has(item.projectId))];
      });
      setTotalHits(result.totalHits);
    } catch (caught) {
      if (isCurrent()) setError(toErrorMessage(caught));
    } finally {
      if (loadMoreInFlight.current === isCurrent) loadMoreInFlight.current = null;
      if (isCurrent()) setLoadingMore(false);
    }
  };

  const install = async (projectId: string) => {
    if (!target || busyProjectId) return;
    const projectName = items.find((item) => item.projectId === projectId)?.title ?? projectId;

    try {
      setBusyProjectId(projectId);
      if (kind === "mods") {
        setDownloadProgress({
          instanceId: target.id,
          projectId,
          filename: projectName,
          receivedBytes: 0,
          totalBytes: 0,
          percent: 0,
          state: "downloading",
        });
      }
      setActionError("");
      setBusyMessage(commands.installingMessage);
      const result = await invoke<ActionResult>(commands.install, {
        instanceId: target.id,
        projectId,
      });
      await refreshContent();
      setBusyMessage(commands.installedMessage);
      pushToast(
        "info",
        `${projectName} → ${target.name}${kind === "mods" ? ` · ${result.message}` : ""}`,
        {
          title: commands.installedTitle,
        },
      );
    } catch (caught) {
      const message = toErrorMessage(caught);
      if (message.includes("MOD_DOWNLOAD_CANCELLED")) {
        setBusyMessage("");
        pushToast("info", `${projectName}: загрузка отменена`, { title: "Download cancelled" });
        return;
      }
      setActionError(message);
      pushToast("error", message, { title: commands.installFailedTitle });
    } finally {
      setBusyProjectId(null);
      if (kind === "mods") setDownloadProgress(null);
      scheduleBusyMessageClear();
    }
  };

  const setDownloadPaused = async (paused: boolean) => {
    if (kind !== "mods" || !target || !busyProjectId) return;
    setDownloadProgress((current) =>
      current ? { ...current, state: paused ? "paused" : "downloading" } : current,
    );
    try {
      await invoke("set_modrinth_download_paused", {
        instanceId: target.id,
        projectId: busyProjectId,
        paused,
      });
    } catch (caught) {
      setActionError(toErrorMessage(caught));
    }
  };

  const cancelDownload = async () => {
    if (kind !== "mods" || !target || !busyProjectId) return;
    setDownloadProgress((current) => (current ? { ...current, state: "cancelled" } : current));
    try {
      await invoke("cancel_modrinth_download", {
        instanceId: target.id,
        projectId: busyProjectId,
      });
    } catch (caught) {
      setActionError(toErrorMessage(caught));
    }
  };

  const uninstall = async (projectId: string) => {
    if (!target || busyProjectId) return;
    const installedEntry = installedItems.find((item) => item.projectId === projectId);
    if (!installedEntry) return;

    try {
      setBusyProjectId(projectId);
      setActionError("");
      setBusyMessage(commands.uninstallingMessage);
      await invoke(commands.uninstall, {
        instanceId: target.id,
        filename: installedEntry.filename,
      });
      await refreshContent();
      pushToast("info", `${installedEntry.title} удалён из ${target.name}`, {
        title: commands.removedTitle,
      });
    } catch (caught) {
      const message = toErrorMessage(caught);
      setActionError(message);
      pushToast("error", message, { title: "Uninstall failed" });
    } finally {
      setBusyProjectId(null);
      setBusyMessage("");
    }
  };

  return {
    search,
    setSearch,
    items,
    totalHits,
    loading,
    loadingMore,
    error,
    busyProjectId,
    installedItems,
    installedLoading,
    downloadProgress,
    loadMore,
    install,
    uninstall,
    setDownloadPaused,
    cancelDownload,
  };
}

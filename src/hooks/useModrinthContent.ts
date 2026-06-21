import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  InstalledModView,
  InstanceItem,
  ModrinthProject,
  ModrinthSearchResponse,
  TabKey,
} from "../types";
import { toErrorMessage } from "../utils/errors";
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
    installingMessage: "Installing Modrinth mod...",
    installedMessage: "Mod install finished",
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
  loadMore: () => Promise<void>;
  install: (projectId: string) => Promise<void>;
  uninstall: (projectId: string) => Promise<void>;
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
  const clearBusyTimer = useRef<number | null>(null);

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
    const [searchResult, installedResult] = await Promise.all([
      fetchSearchPage(0, Math.max(items.length, PAGE_SIZE)),
      fetchInstalled(),
    ]);
    setItems(searchResult.hits);
    setTotalHits(searchResult.totalHits);
    setInstalledItems(installedResult);
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
    let cancelled = false;

    if (!target) {
      setInstalledItems([]);
      return;
    }

    setInstalledLoading(true);
    void invoke<InstalledModView[]>(commands.list, { instanceId: target.id })
      .then((result) => {
        if (!cancelled) setInstalledItems(result);
      })
      .catch((caught) => {
        if (!cancelled) {
          setInstalledItems([]);
          setError(toErrorMessage(caught));
        }
      })
      .finally(() => {
        if (!cancelled) setInstalledLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload installed items only when the target id changes, not on object identity
  }, [commands.list, target?.id]);

  useEffect(() => {
    if (activeTab !== commands.tab || !target || (commands.includeGameVersion && !target.version)) {
      if (!target) {
        setItems([]);
        setTotalHits(0);
      }
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      void invoke<ModrinthSearchResponse>(commands.search, buildSearchArguments(0, PAGE_SIZE))
        .then((result) => {
          if (cancelled) return;
          setItems(result.hits);
          setTotalHits(result.totalHits);
        })
        .catch((caught) => {
          if (cancelled) return;
          setItems([]);
          setTotalHits(0);
          setError(toErrorMessage(caught));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- id/version are the real search triggers; args are rebuilt inside
  }, [activeTab, commands, search, target?.id, target?.version]);

  const loadMore = async () => {
    if (!target || loadingMore || loading || items.length >= totalHits) return;

    try {
      setLoadingMore(true);
      const result = await fetchSearchPage(items.length, PAGE_SIZE);
      setItems((current) => {
        const existingIds = new Set(current.map((item) => item.projectId));
        return [...current, ...result.hits.filter((item) => !existingIds.has(item.projectId))];
      });
      setTotalHits(result.totalHits);
    } catch (caught) {
      setError(toErrorMessage(caught));
    } finally {
      setLoadingMore(false);
    }
  };

  const install = async (projectId: string) => {
    if (!target) return;
    const projectName = items.find((item) => item.projectId === projectId)?.title ?? projectId;

    try {
      setBusyProjectId(projectId);
      setActionError("");
      setBusyMessage(commands.installingMessage);
      await invoke(commands.install, { instanceId: target.id, projectId });
      await refreshContent();
      setBusyMessage(commands.installedMessage);
      pushToast("info", `${projectName} → ${target.name}`, { title: commands.installedTitle });
    } catch (caught) {
      const message = toErrorMessage(caught);
      setActionError(message);
      pushToast("error", message, { title: commands.installFailedTitle });
    } finally {
      setBusyProjectId(null);
      scheduleBusyMessageClear();
    }
  };

  const uninstall = async (projectId: string) => {
    if (!target) return;
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
    loadMore,
    install,
    uninstall,
  };
}

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { InstalledModView, ModrinthProject, ModrinthSearchResponse, TabKey } from "../types";
import type { InstanceItem } from "../types";

interface UsePackActionsParams {
  activeTab: TabKey;
  selectedInstance: InstanceItem | null;
  setActionError: (msg: string) => void;
  setBusyMessage: (msg: string) => void;
}

export function usePackActions({
  activeTab,
  selectedInstance,
  setActionError,
  setBusyMessage,
}: UsePackActionsParams) {
  const [packSearch, setPackSearch] = useState("");
  const [packItems, setPackItems] = useState<ModrinthProject[]>([]);
  const [packTotalHits, setPackTotalHits] = useState(0);
  const [packLoading, setPackLoading] = useState(false);
  const [packLoadingMore, setPackLoadingMore] = useState(false);
  const [packError, setPackError] = useState("");
  const [packInstallBusyId, setPackInstallBusyId] = useState<string | null>(null);
  const [installedPacks, setInstalledPacks] = useState<InstalledModView[]>([]);
  const [installedPacksLoading, setInstalledPacksLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!selectedInstance) { setInstalledPacks([]); return; }
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
    void load();
  }, [selectedInstance?.id, packInstallBusyId]);

  useEffect(() => {
    if (activeTab !== "resourcepacks" || !selectedInstance?.version) return;

    const load = async () => {
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

    const timer = window.setTimeout(() => void load(), 180);
    return () => window.clearTimeout(timer);
  }, [activeTab, packSearch, selectedInstance?.id, selectedInstance?.version]);

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
      await invoke("install_modrinth_resourcepack", {
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
      await invoke("uninstall_modrinth_resourcepack", {
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

  return {
    packSearch, setPackSearch,
    packItems, packTotalHits, packLoading, packLoadingMore, packError,
    packInstallBusyId,
    installedPacks, installedPacksLoading,
    handleLoadMorePacks, handleInstallPack, handleUninstallPack,
  };
}

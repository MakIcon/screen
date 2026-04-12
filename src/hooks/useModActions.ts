import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { InstalledModView, ModrinthProject, ModrinthSearchResponse, TabKey } from "../types";
import type { InstanceItem } from "../types";

interface UseModActionsParams {
  activeTab: TabKey;
  selectedModTarget: InstanceItem | null;
  setActionError: (msg: string) => void;
  setBusyMessage: (msg: string) => void;
}

export function useModActions({
  activeTab,
  selectedModTarget,
  setActionError,
  setBusyMessage,
}: UseModActionsParams) {
  const [modSearch, setModSearch] = useState("");
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

  useEffect(() => {
    const load = async () => {
      try {
        const versions = await invoke<string[]>("get_modrinth_fabric_versions");
        setModrinthVersionOptions(versions);
      } catch (error) {
        console.error(error);
      }
    };
    void load();
  }, []);

  useEffect(() => {
    if (selectedModTarget?.version) {
      setSelectedModrinthVersion(selectedModTarget.version);
      return;
    }
    setSelectedModrinthVersion((current) => current || modrinthVersionOptions[0] || "");
  }, [selectedModTarget?.version, modrinthVersionOptions]);

  useEffect(() => {
    const load = async () => {
      if (!selectedModTarget) { setInstalledMods([]); return; }
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
    void load();
  }, [selectedModTarget?.id, modrinthInstallBusyId]);

  useEffect(() => {
    if (activeTab !== "mods" || !selectedModrinthVersion) return;

    const load = async () => {
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

    const timer = window.setTimeout(() => void load(), 180);
    return () => window.clearTimeout(timer);
  }, [activeTab, modSearch, selectedModTarget?.id, selectedModrinthVersion]);

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
      await invoke("install_modrinth_project", { instanceId: selectedModTarget.id, projectId });

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

    const modEntry = installedMods.find((m) => m.projectId === projectId);
    if (!modEntry) return;

    try {
      setModrinthInstallBusyId(projectId);
      setBusyMessage("Uninstalling mod...");
      await invoke("uninstall_modrinth_mod", {
        instanceId: selectedModTarget.id,
        filename: modEntry.filename,
      });

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

  return {
    modSearch, setModSearch,
    modrinthVersionOptions,
    selectedModrinthVersion, setSelectedModrinthVersion,
    modrinthItems, modrinthTotalHits, modrinthLoading, modrinthLoadingMore, modrinthError,
    modrinthInstallBusyId,
    installedMods, installedModsLoading,
    handleLoadMoreMods, handleInstallMod, handleUninstallMod,
  };
}

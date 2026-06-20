import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { InstalledModView, ModrinthProject, ModrinthSearchResponse, TabKey } from "../types";
import type { InstanceItem } from "../types";
import type { PushToast } from "./useToasts";

interface UseShaderActionsParams {
  activeTab: TabKey;
  selectedShaderTarget: InstanceItem | null;
  setActionError: (msg: string) => void;
  setBusyMessage: (msg: string) => void;
  pushToast: PushToast;
}

export function useShaderActions({
  activeTab,
  selectedShaderTarget,
  setActionError,
  setBusyMessage,
  pushToast,
}: UseShaderActionsParams) {
  const [shaderSearch, setShaderSearch] = useState("");
  const [shaderItems, setShaderItems] = useState<ModrinthProject[]>([]);
  const [shaderTotalHits, setShaderTotalHits] = useState(0);
  const [shaderLoading, setShaderLoading] = useState(false);
  const [shaderLoadingMore, setShaderLoadingMore] = useState(false);
  const [shaderError, setShaderError] = useState("");
  const [shaderInstallBusyId, setShaderInstallBusyId] = useState<string | null>(null);
  const [installedShaders, setInstalledShaders] = useState<InstalledModView[]>([]);
  const [installedShadersLoading, setInstalledShadersLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!selectedShaderTarget) { setInstalledShaders([]); return; }
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
    void load();
  }, [selectedShaderTarget?.id, shaderInstallBusyId]);

  useEffect(() => {
    if (activeTab !== "shaders" || !selectedShaderTarget?.version) return;

    const load = async () => {
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

    const timer = window.setTimeout(() => void load(), 180);
    return () => window.clearTimeout(timer);
  }, [activeTab, shaderSearch, selectedShaderTarget?.id, selectedShaderTarget?.version]);

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

    const shaderName = shaderItems.find((s) => s.projectId === projectId)?.title ?? projectId;

    try {
      setShaderInstallBusyId(projectId);
      setActionError("");
      setBusyMessage("Installing shader...");
      await invoke("install_modrinth_shader", {
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
      pushToast("info", `${shaderName} → ${selectedShaderTarget.name}`, {
        title: "Shader installed",
      });
    } catch (error) {
      console.error(error);
      setActionError(String(error));
      pushToast("error", String(error), { title: "Shader install failed" });
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
      await invoke("uninstall_modrinth_shader", {
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
      pushToast("info", `${shaderEntry.title} удалён из ${selectedShaderTarget.name}`, { title: "Shader removed" });
    } catch (error) {
      console.error(error);
      setActionError(String(error));
      pushToast("error", String(error), { title: "Uninstall failed" });
    } finally {
      setShaderInstallBusyId(null);
      setBusyMessage("");
    }
  };

  return {
    shaderSearch, setShaderSearch,
    shaderItems, shaderTotalHits, shaderLoading, shaderLoadingMore, shaderError,
    shaderInstallBusyId,
    installedShaders, installedShadersLoading,
    handleLoadMoreShaders, handleInstallShader, handleUninstallShader,
  };
}

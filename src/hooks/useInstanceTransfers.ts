import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import type {
  ExportedItem,
  ImportContentResult,
  ImportInstanceResult,
  InstanceExportData,
  InstanceItem,
} from "../types";
import type { InstanceTransferOptions } from "../components/transfer/types";
import type { PushToast } from "./useToasts";
import {
  hasEnvironmentVariablesData,
  hasJavaArgsData,
  hasJavaPathData,
  hasWindowSettingsData,
} from "../utils/instanceTransfer";
import { logger } from "../utils/logger";
import { toErrorMessage } from "../utils/errors";

const DEFAULT_OPTIONS: InstanceTransferOptions = {
  name: true,
  ram: true,
  javaArgs: true,
  javaPath: true,
  environmentVariables: false,
  window: true,
  mods: true,
  shaders: true,
  resourcePacks: true,
};

export type ImportProgress = {
  operationId: string;
  stage: "preparing" | "installing" | "downloading" | "extracting" | "complete";
  processed: number;
  total: number;
  filename: string;
};

function exportSlug(name: string) {
  return (
    (name || "build")
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}_-]+/gu, "-")
      .replace(/^-+|-+$/g, "") || "build"
  );
}

export function useInstanceTransfers({
  defaultRamGb,
  refreshInstances,
  pushToast,
}: {
  defaultRamGb: number;
  refreshInstances: (preferredId?: string) => Promise<void>;
  pushToast: PushToast;
}) {
  const [exportInstanceId, setExportInstanceId] = useState<string | null>(null);
  const [exportData, setExportData] = useState<InstanceExportData | null>(null);
  const [exportOptions, setExportOptions] = useState<InstanceTransferOptions>(DEFAULT_OPTIONS);
  const [exportWorking, setExportWorking] = useState(false);
  const [exportError, setExportError] = useState("");

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importData, setImportData] = useState<InstanceExportData | null>(null);
  const [importOptions, setImportOptions] = useState<InstanceTransferOptions>(DEFAULT_OPTIONS);
  const [importCustomName, setImportCustomName] = useState("");
  const [importWorking, setImportWorking] = useState(false);
  const [importError, setImportError] = useState("");
  const [importSourcePath, setImportSourcePath] = useState("");
  const [importSourceFormat, setImportSourceFormat] = useState<"slbuild" | "mrpack">("slbuild");
  const [importResult, setImportResult] = useState<ImportInstanceResult | null>(null);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [importCancelRequested, setImportCancelRequested] = useState(false);
  const importOperationIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void listen<ImportProgress>("build-import-progress", (event) => {
      if (event.payload.operationId === importOperationIdRef.current) {
        setImportProgress(event.payload);
      }
    })
      .then((stop) => {
        if (cancelled) stop();
        else unlisten = stop;
      })
      .catch((error) => {
        logger.error("build-import-progress listener failed", error);
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

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
        environmentVariables: false,
        window: hasWindowSettingsData(data),
        mods: data.mods.length > 0,
        shaders: data.shaders.length > 0,
        resourcePacks: data.resourcePacks.length > 0,
      });
    } catch (caught) {
      logger.error(caught);
      setExportError(toErrorMessage(caught));
    }
  };

  const handleExportDownload = () => {
    if (!exportData || !exportInstanceId) return;
    const output = {
      schemaVersion: 2,
      name: exportOptions.name ? exportData.name : "",
      version: exportData.version,
      loader: exportData.loader,
      loaderVersion: exportData.loaderVersion ?? null,
      ram: exportOptions.ram ? exportData.ram : 0,
      javaArgs: exportOptions.javaArgs ? (exportData.javaArgs ?? null) : null,
      javaPath: exportOptions.javaPath ? (exportData.javaPath ?? null) : null,
      environmentVariables: exportOptions.environmentVariables
        ? (exportData.environmentVariables ?? {})
        : {},
      windowWidth: exportOptions.window ? (exportData.windowWidth ?? null) : null,
      windowHeight: exportOptions.window ? (exportData.windowHeight ?? null) : null,
      fullscreen: exportOptions.window ? (exportData.fullscreen ?? false) : false,
      mods: exportOptions.mods
        ? exportData.mods.filter((item) => item.source === "modrinth")
        : ([] as ExportedItem[]),
      shaders: exportOptions.shaders
        ? exportData.shaders.filter((item) => item.source === "modrinth")
        : ([] as ExportedItem[]),
      resourcePacks: exportOptions.resourcePacks
        ? exportData.resourcePacks.filter((item) => item.source === "modrinth")
        : ([] as ExportedItem[]),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(output, null, 2)], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${exportSlug(exportOptions.name ? exportData.name : "build")}.slbuild`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    setExportInstanceId(null);
    pushToast("info", `${exportData.name} экспортирована (.slbuild)`, {
      title: "Build exported",
    });
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
          includeEnvironmentVariables: exportOptions.environmentVariables,
          includeWindow: exportOptions.window,
          includeMods: exportOptions.mods,
          includeShaders: exportOptions.shaders,
          includeResourcePacks: exportOptions.resourcePacks,
        },
      });
      setExportInstanceId(null);
      pushToast("info", `${exportData.name} экспортирована (.mrpack)`, {
        title: "Build exported",
      });
    } catch (caught) {
      setExportError(toErrorMessage(caught));
      pushToast("error", toErrorMessage(caught), { title: "Export failed" });
    } finally {
      setExportWorking(false);
    }
  };

  const prepareImport = (data: InstanceExportData, path: string, format: "slbuild" | "mrpack") => {
    setImportData(data);
    setImportSourcePath(path);
    setImportSourceFormat(format);
    setImportCustomName(data.name || "");
    setImportOptions({
      name: Boolean(data.name),
      ram: Boolean(data.ram),
      javaArgs: hasJavaArgsData(data),
      javaPath: hasJavaPathData(data),
      environmentVariables: hasEnvironmentVariablesData(data),
      window: hasWindowSettingsData(data),
      mods: (data.mods?.length ?? 0) > 0,
      shaders: (data.shaders?.length ?? 0) > 0,
      resourcePacks: (data.resourcePacks?.length ?? 0) > 0,
    });
    setImportError("");
    setImportResult(null);
    setImportProgress(null);
    setImportCancelRequested(false);
    setImportModalOpen(true);
  };

  const importBuildFromPath = async (path: string) => {
    try {
      const isMrpack = path.toLowerCase().endsWith(".mrpack");
      const data = await invoke<InstanceExportData>(
        isMrpack ? "inspect_mrpack" : "read_slbuild_file",
        { path },
      );
      prepareImport(data, path, isMrpack ? "mrpack" : "slbuild");
    } catch (caught) {
      setImportData(null);
      setImportSourcePath("");
      setImportError(toErrorMessage(caught));
      setImportModalOpen(true);
    }
  };

  const handleImportBuild = async () => {
    try {
      const selectedPath = await openDialog({
        title: "Import build",
        multiple: false,
        directory: false,
        filters: [{ name: "Launcher builds", extensions: ["slbuild", "mrpack", "json"] }],
      });
      if (!selectedPath || Array.isArray(selectedPath)) return;
      await importBuildFromPath(selectedPath);
    } catch (caught) {
      setImportData(null);
      setImportSourcePath("");
      setImportError(toErrorMessage(caught));
      setImportModalOpen(true);
    }
  };

  const handleImportConfirm = async () => {
    if (!importData) return;
    setImportWorking(true);
    setImportError("");
    setImportCancelRequested(false);
    const operationId = crypto.randomUUID();
    importOperationIdRef.current = operationId;
    setImportProgress({ operationId, stage: "preparing", processed: 0, total: 0, filename: "" });
    const name = importOptions.name ? importData.name : importCustomName;
    const ram = importOptions.ram && importData.ram ? importData.ram : defaultRamGb;
    try {
      if (importResult) {
        const retryable = (entry: ImportContentResult) =>
          !entry.success && entry.item.source === "modrinth" && !!entry.item.projectId;
        const failed = importResult.items.filter(retryable);
        if (failed.length === 0) {
          setImportModalOpen(false);
          setImportData(null);
          setImportSourcePath("");
          return;
        }
        const retried = await invoke<ImportContentResult[]>("retry_import_content", {
          operationId,
          instanceId: importResult.instance.id,
          mods: failed.filter((entry) => entry.category === "mods").map((entry) => entry.item),
          shaders: failed
            .filter((entry) => entry.category === "shaders")
            .map((entry) => entry.item),
          resourcePacks: failed
            .filter((entry) => entry.category === "resourcePacks")
            .map((entry) => entry.item),
        });
        let index = 0;
        const nextItems = importResult.items.map((entry) =>
          retryable(entry) ? (retried[index++] ?? entry) : entry,
        );
        setImportResult({ ...importResult, items: nextItems });
        await refreshInstances(importResult.instance.id);
        if (nextItems.every((entry) => entry.success)) {
          pushToast("info", "Все компоненты сборки установлены", { title: "Import complete" });
        }
        return;
      }
      if (importSourceFormat === "mrpack") {
        const newInstance = await invoke<InstanceItem>("import_mrpack", {
          operationId,
          path: importSourcePath,
          options: {
            name,
            ram,
            javaArgs: importOptions.javaArgs ? (importData.javaArgs ?? null) : null,
            javaPath: importOptions.javaPath ? (importData.javaPath ?? null) : null,
            environmentVariables: importOptions.environmentVariables
              ? (importData.environmentVariables ?? {})
              : {},
            windowWidth: importOptions.window ? (importData.windowWidth ?? null) : null,
            windowHeight: importOptions.window ? (importData.windowHeight ?? null) : null,
            fullscreen: importOptions.window ? (importData.fullscreen ?? false) : false,
            includeMods: importOptions.mods,
            includeShaders: importOptions.shaders,
            includeResourcePacks: importOptions.resourcePacks,
          },
        });
        await refreshInstances(newInstance.id);
        setImportModalOpen(false);
        setImportData(null);
        setImportSourcePath("");
        pushToast("info", `Сборка ${newInstance.name} импортирована`, { title: "Build imported" });
      } else {
        const result = await invoke<ImportInstanceResult>("import_instance", {
          operationId,
          payload: {
            name,
            version: importData.version,
            loader: importData.loader,
            loaderVersion: importData.loaderVersion ?? null,
            ram,
            javaArgs: importOptions.javaArgs ? (importData.javaArgs ?? null) : null,
            javaPath: importOptions.javaPath ? (importData.javaPath ?? null) : null,
            environmentVariables: importOptions.environmentVariables
              ? (importData.environmentVariables ?? {})
              : {},
            windowWidth: importOptions.window ? (importData.windowWidth ?? null) : null,
            windowHeight: importOptions.window ? (importData.windowHeight ?? null) : null,
            fullscreen: importOptions.window ? (importData.fullscreen ?? false) : false,
            mods: importOptions.mods ? (importData.mods ?? []) : [],
            shaders: importOptions.shaders ? (importData.shaders ?? []) : [],
            resourcePacks: importOptions.resourcePacks ? (importData.resourcePacks ?? []) : [],
          },
        });
        await refreshInstances(result.instance.id);
        setImportResult(result);
        const failedCount = result.items.filter((entry) => !entry.success).length;
        pushToast(
          failedCount ? "warning" : "info",
          failedCount
            ? `Сборка создана, не удалось установить ${failedCount} компонентов`
            : `Сборка ${result.instance.name} импортирована`,
          {
            title: failedCount ? "Import incomplete" : "Build imported",
          },
        );
      }
    } catch (caught) {
      if (toErrorMessage(caught).includes("IMPORT_CANCELLED")) {
        await refreshInstances();
        setImportError(
          importResult
            ? "Повторная установка отменена. Уже установленные файлы сохранены."
            : "Импорт отменён. Можно изменить параметры и повторить.",
        );
        pushToast("info", "Импорт сборки отменён", { title: "Import cancelled" });
        return;
      }
      setImportError(toErrorMessage(caught));
      pushToast("error", toErrorMessage(caught), { title: "Import failed" });
    } finally {
      importOperationIdRef.current = null;
      setImportProgress(null);
      setImportCancelRequested(false);
      setImportWorking(false);
    }
  };

  const handleImportCancel = async () => {
    const operationId = importOperationIdRef.current;
    if (!operationId || importCancelRequested) return;
    setImportCancelRequested(true);
    try {
      await invoke("cancel_import", { operationId });
    } catch (caught) {
      // The backend may have completed while the button was clicked.
      logger.error("cancel_import failed", caught);
      setImportCancelRequested(false);
    }
  };

  return {
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
    setImportError,
    setImportSourcePath,
    importSourceFormat,
    importResult,
    importProgress,
    importCancelRequested,
    importBuildFromPath,
    handleImportBuild,
    handleImportConfirm,
    handleImportCancel,
  };
}

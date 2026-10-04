import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { WorldBackupInfo, WorldBackupState, WorldRestoreResult } from "../types";
import type { PushToast } from "./useToasts";
import { toErrorMessage } from "../utils/errors";

type Operation = "create" | "restore" | "delete" | "refresh" | null;

export function useWorldBackups(instanceId: string, running: boolean, pushToast: PushToast) {
  const [data, setData] = useState<WorldBackupState>({
    worlds: [],
    backups: [],
    selectedWorlds: [],
  });
  const [loading, setLoading] = useState(true);
  const [operation, setOperation] = useState<Operation>(null);
  const [error, setError] = useState("");
  const [restoredId, setRestoredId] = useState<string | null>(null);
  const mounted = useRef(false);
  const busy = useRef(false);
  const selectionWrites = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    let active = true;
    mounted.current = true;
    invoke<WorldBackupState>("get_world_backup_state", { instanceId })
      .then((state) => {
        if (active) setData(state);
      })
      .catch((cause) => {
        if (active) setError(toErrorMessage(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [instanceId]);

  const selectWorlds = (names: string[]) => {
    if (loading || busy.current) return;
    setData((current) => ({ ...current, selectedWorlds: names }));
    // Persist immediately and in order, including when the dialog is closed quickly.
    selectionWrites.current = selectionWrites.current
      .then(() => invoke("set_world_backup_selection", { instanceId, worldNames: names }))
      .catch((cause) => {
        if (mounted.current) setError(toErrorMessage(cause));
      });
  };

  const run = async <T>(
    kind: Exclude<Operation, null>,
    task: () => Promise<T>,
    success: (result: T) => string,
  ) => {
    if (busy.current || loading || (running && (kind === "create" || kind === "restore")))
      return false;
    busy.current = true;
    setOperation(kind);
    setError("");
    try {
      await selectionWrites.current;
      const result = await task();
      const message = success(result);
      if (message) pushToast("info", message, { title: "Резервные копии" });
      // An operation that succeeded must stay successful even if refreshing fails.
      try {
        const state = await invoke<WorldBackupState>("get_world_backup_state", { instanceId });
        if (mounted.current) setData(state);
      } catch (cause) {
        if (mounted.current) setError(`Не удалось обновить список: ${toErrorMessage(cause)}`);
      }
      return true;
    } catch (cause) {
      if (mounted.current) setError(toErrorMessage(cause));
      return false;
    } finally {
      busy.current = false;
      if (mounted.current) setOperation(null);
    }
  };

  const rememberBackup = (backup: WorldBackupInfo) => {
    if (!mounted.current) return;
    setData((current) => ({
      ...current,
      backups: [backup, ...current.backups.filter((item) => item.id !== backup.id)],
    }));
  };

  const create = (name: string) =>
    run(
      "create",
      () =>
        invoke<WorldBackupInfo>("create_world_backup", {
          instanceId,
          worldNames: data.selectedWorlds,
          name,
        }),
      (backup) => {
        // Keep the confirmed result visible even if the following refresh fails.
        rememberBackup(backup);
        return `Копия создана. Сохранено миров: ${backup.worldCount}.`;
      },
    );

  const restore = (backupId: string, names: string[]) =>
    run(
      "restore",
      () =>
        invoke<WorldRestoreResult>("restore_world_backup", {
          instanceId,
          backupId,
          worldNames: names,
        }),
      (result) => {
        if (result.safetyBackup) rememberBackup(result.safetyBackup);
        if (mounted.current) setRestoredId(backupId);
        const worlds = result.restoredWorlds.slice(0, 3).join(", ");
        const extra =
          result.restoredWorlds.length > 3 ? ` и ещё ${result.restoredWorlds.length - 3}` : "";
        return `Восстановлено в игру: ${worlds}${extra}.${result.safetyBackup ? " Предыдущие версии сохранены в страховочной копии." : " Миры снова доступны в сборке."}`;
      },
    );

  const remove = (backupId: string) =>
    run(
      "delete",
      () => invoke("delete_world_backup", { instanceId, backupId }),
      () => {
        if (mounted.current) {
          setData((current) => ({
            ...current,
            backups: current.backups.filter((backup) => backup.id !== backupId),
          }));
          setRestoredId((current) => (current === backupId ? null : current));
        }
        return "Копия удалена. Миры в игре сохранены.";
      },
    );

  const refresh = () =>
    run(
      "refresh",
      async () => undefined,
      () => "",
    );

  return {
    ...data,
    loading,
    operation,
    working: loading || operation !== null,
    error,
    restoredId,
    selectWorlds,
    create,
    restore,
    remove,
    refresh,
  };
}

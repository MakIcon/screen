import { invoke } from "@tauri-apps/api/core";

/** The backend reservation closes the gap between the final check and process exit. */
export async function installWhenIdle(
  deferred: () => boolean,
  install: () => Promise<void>,
): Promise<boolean> {
  if (deferred()) return false;
  const token = await invoke<string | null>("prepare_launcher_update");
  if (!token) return false;
  try {
    await install();
    return true;
  } finally {
    await invoke("finish_launcher_update", { token });
  }
}

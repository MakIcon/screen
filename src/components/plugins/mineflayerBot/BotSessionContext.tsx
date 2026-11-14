import { createContext, useCallback, useContext } from "react";
import { invoke } from "@tauri-apps/api/core";

export const BotSessionContext = createContext("default");

export function useBotId() {
  return useContext(BotSessionContext);
}

export function useBotInvoke() {
  const botId = useBotId();
  return useCallback(
    <T,>(command: string, args?: Record<string, unknown>): Promise<T> =>
      invoke<T>(command, { ...args, botId }),
    [botId],
  );
}

export function botStorageKey(key: string, botId: string) {
  return botId === "default" ? key : `${key}:${botId}`;
}

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { LauncherSettings, MicrosoftAccount } from "../types";
import { logger } from "../utils/logger";

const ACTIVE_MICROSOFT_ACCOUNT_KEY = "screen.activeMicrosoftAccountId";
const ACCOUNT_TYPE_KEY = "screen.accountType";
const NICKNAME_KEY = "screen.nickname";
const PENDING_NICKNAME_KEY = "screen.pendingNickname";

function readNickname(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function cacheNickname(nickname: string, pending = false) {
  try {
    window.localStorage.setItem(NICKNAME_KEY, nickname);
    if (pending) window.localStorage.setItem(PENDING_NICKNAME_KEY, nickname);
  } catch {
    // Native settings remain available when webview storage is unavailable.
  }
}

function readStoredAccountType() {
  return window.localStorage.getItem(ACCOUNT_TYPE_KEY) === "MICROSOFT" ? "MICROSOFT" : "OFFLINE";
}

/**
 * Player identity used to launch the game: the offline nickname, the selected
 * account type, and the Microsoft account list / active selection. Bootstrap
 * fills these in once the backend responds; the settings UI mutates them.
 */
export function useAccounts(settings: LauncherSettings | null) {
  const [nickname, setNicknameState] = useState(
    () => readNickname(PENDING_NICKNAME_KEY) ?? readNickname(NICKNAME_KEY) ?? "PLAYER",
  );
  const nicknameEdited = useRef(false);
  const nicknameLoaded = useRef(false);
  const savingNickname = useRef<Promise<unknown>>(Promise.resolve());
  const persistNickname = useCallback((value: string) => {
    // Serialize keystrokes so a slower earlier write cannot restore an old name.
    savingNickname.current = savingNickname.current
      .then(() => invoke("set_player_nickname", { nickname: value }))
      .then(() => {
        try {
          if (window.localStorage.getItem(PENDING_NICKNAME_KEY) === value)
            window.localStorage.removeItem(PENDING_NICKNAME_KEY);
        } catch {
          // The native write already succeeded.
        }
      })
      .catch((error) => logger.error("set_player_nickname failed", error));
  }, []);
  const setNickname = useCallback(
    (value: string) => {
      nicknameEdited.current = true;
      setNicknameState(value);
      cacheNickname(value, true);
      persistNickname(value);
    },
    [persistNickname],
  );

  useEffect(() => {
    if (!settings || nicknameLoaded.current) return;
    nicknameLoaded.current = true;
    // A delayed bootstrap response must not undo an edit made while loading.
    if (nicknameEdited.current) return;
    const value =
      readNickname(PENDING_NICKNAME_KEY) ?? settings.playerNickname ?? readNickname(NICKNAME_KEY);
    if (value === null) return;
    setNicknameState(value);
    cacheNickname(value);
    // Migrate a cached nickname, or retry a write interrupted by shutdown.
    if (value !== settings.playerNickname) persistNickname(value);
  }, [settings, persistNickname]);
  const [accountType, setAccountType] = useState(readStoredAccountType);
  const [msAccounts, setMsAccounts] = useState<MicrosoftAccount[]>([]);
  const [activeMsAccountId, setActiveMsAccountId] = useState<string | null>(() =>
    window.localStorage.getItem(ACTIVE_MICROSOFT_ACCOUNT_KEY),
  );
  const [showMsModal, setShowMsModal] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(ACCOUNT_TYPE_KEY, accountType);
  }, [accountType]);

  useEffect(() => {
    if (activeMsAccountId) {
      window.localStorage.setItem(ACTIVE_MICROSOFT_ACCOUNT_KEY, activeMsAccountId);
    } else {
      window.localStorage.removeItem(ACTIVE_MICROSOFT_ACCOUNT_KEY);
    }
  }, [activeMsAccountId]);

  return {
    nickname,
    setNickname,
    accountType,
    setAccountType,
    msAccounts,
    setMsAccounts,
    activeMsAccountId,
    setActiveMsAccountId,
    showMsModal,
    setShowMsModal,
  };
}

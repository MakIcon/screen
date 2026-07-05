import { useEffect, useState } from "react";
import type { MicrosoftAccount } from "../types";

const ACTIVE_MICROSOFT_ACCOUNT_KEY = "screen.activeMicrosoftAccountId";
const ACCOUNT_TYPE_KEY = "screen.accountType";

function readStoredAccountType() {
  return window.localStorage.getItem(ACCOUNT_TYPE_KEY) === "MICROSOFT" ? "MICROSOFT" : "OFFLINE";
}

/**
 * Player identity used to launch the game: the offline nickname, the selected
 * account type, and the Microsoft account list / active selection. Bootstrap
 * fills these in once the backend responds; the settings UI mutates them.
 */
export function useAccounts() {
  const [nickname, setNickname] = useState("PLAYER");
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

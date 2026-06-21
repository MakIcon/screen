import { useState } from "react";
import type { MicrosoftAccount } from "../types";

/**
 * Player identity used to launch the game: the offline nickname, the selected
 * account type, and the Microsoft account list / active selection. Bootstrap
 * fills these in once the backend responds; the settings UI mutates them.
 */
export function useAccounts() {
  const [nickname, setNickname] = useState("PLAYER");
  const [accountType, setAccountType] = useState("OFFLINE");
  const [msAccounts, setMsAccounts] = useState<MicrosoftAccount[]>([]);
  const [activeMsAccountId, setActiveMsAccountId] = useState<string | null>(null);
  const [showMsModal, setShowMsModal] = useState(false);

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

import { useState } from "react";
import { useTranslation } from "../../../i18n/locale";
import type { MineflayerBotStatus } from "../../../types";
import { toErrorMessage } from "../../../utils/errors";
import { TextField } from "../../inputs/TextField";
import { PluginSettingsGroup } from "../PluginSettingsGroup";
import { useBotInvoke } from "./BotSessionContext";

const actions = ["take", "bot", "camera"] as const;

export function MineflayerPlayerControl({
  status, enabled, accountName, onToggle, onUseActiveAccount, onOpenAccount,
}: {
  status: MineflayerBotStatus | null;
  enabled: boolean;
  accountName?: string;
  onToggle: () => void;
  onUseActiveAccount?: () => void;
  onOpenAccount: () => void;
}) {
  const tr = useTranslation();
  const invoke = useBotInvoke();
  const control = status?.playerControl;
  const address = control?.address;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  async function setMode(action: (typeof actions)[number]) {
    setPending(true);
    setError("");
    try {
      await invoke("set_mineflayer_player_control", { action });
    } catch (failure) {
      setError(toErrorMessage(failure));
    } finally {
      setPending(false);
    }
  }

  return (
    <PluginSettingsGroup title={tr("bot.player.title")} collapsible={false}>
      <p>{tr("bot.player.description")}</p>
      <div className="mineflayer-coordinate-actions">
        <button type="button" aria-pressed={enabled} disabled={status?.running} onClick={onToggle}>
          {tr(enabled ? "bot.player.disable" : "bot.player.enable")}
        </button>
        {enabled && !status?.running && (onUseActiveAccount || !accountName) && (
          <button type="button" onClick={onUseActiveAccount ?? onOpenAccount}>
            {tr(onUseActiveAccount ? "bot.player.useAccount" : "bot.player.chooseAccount")}
          </button>
        )}
      </div>
      {enabled && !address && (
        <p>{tr(accountName ? "bot.player.startBot" : "bot.player.accountRequired")}</p>
      )}
      {control && address && (
        <>
          <div className="mineflayer-bot-grid">
            <label className="mineflayer-bot-field">
              <span>{tr("bot.player.address")}</span>
              <TextField readOnly value={address} />
            </label>
            <div className="mineflayer-coordinate-actions">
              <button type="button" onClick={() => {
                setError("");
                void navigator.clipboard.writeText(address)
                  .then(() => setCopiedAddress(address), failure => setError(toErrorMessage(failure)));
              }}>
                {tr(copiedAddress === address ? "bot.player.copied" : "bot.player.copy")}
              </button>
            </div>
          </div>
          <p>{tr("bot.player.join", { account: status?.botUsername ?? accountName ?? "Microsoft" })}</p>
          <p role="status">{tr(control.switching ? "bot.player.switching" : `bot.player.mode.${control.mode}`)}</p>
          <div className="mineflayer-coordinate-actions">
            {actions.map(action => (
              <button
                key={action}
                type="button"
                disabled={pending || control.switching || control.mode === "bot" ||
                  (action === "take" && control.mode === "player") ||
                  (action === "bot" && control.mode === "camera")}
                onClick={() => void setMode(action)}
              >
                {tr(`bot.player.action.${action}`)} <code>.{action}</code>
              </button>
            ))}
          </div>
        </>
      )}
      {error && <p className="mineflayer-bot-chat-feedback is-error" role="alert">{error}</p>}
    </PluginSettingsGroup>
  );
}

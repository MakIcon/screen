import { useState } from "react";
import { useTranslation } from "../../../i18n/locale";
import type { MineflayerGatheringSettings } from "../../../types";
import { ElementToggle } from "../../inputs/ElementToggle";
import { CustomNumberInput } from "../../inputs/CustomNumberInput";
import { PluginSettingsGroup } from "../PluginSettingsGroup";
import { useBotInvoke } from "./BotSessionContext";
import { toErrorMessage } from "../../../utils/errors";

export function MineflayerWorkSettings({
  settings,
  onChange,
  connected,
}: {
  settings: MineflayerGatheringSettings;
  onChange: (value: MineflayerGatheringSettings) => void;
  connected: boolean;
}) {
  const tr = useTranslation(),
    invoke = useBotInvoke();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const disabled = busy || !connected;
  const updatePassages = (patch: Partial<MineflayerGatheringSettings>) =>
    onChange({ ...settings, ...patch });
  const passageCommand = `work tunnels ${settings.tunnelWidth} ${settings.tunnelHeight} ${settings.stairWidth} ${settings.stairHeight} ${settings.placeTorches ? "on" : "off"} ${settings.torchInterval}`;
  const defenseCommand = `work defense ${settings.defendMobs ? "on" : "off"} ${settings.defendPlayers ? "on" : "off"} ${settings.defendArrows ? "on" : "off"}`;
  async function send(command: string) {
    if (disabled) return;
    setBusy(true);
    setMessage("");
    try {
      await invoke("send_mineflayer_bot_chat", { message: command, command: true });
    } catch (error) {
      setMessage(toErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  const number = (
    label: string,
    value: number,
    change: (value: number) => void,
    min: number,
    max: number,
  ) => (
    <label className="mineflayer-bot-field">
      <span>{label}</span>
      <CustomNumberInput
        ariaLabel={label}
        background="transparent"
        min={min}
        max={max}
        value={value}
        onChange={change}
      />
    </label>
  );
  return (
    <details className="mf-workflow-work-settings">
      <summary>{tr("bot.warehouse.workSettings")}</summary>
      <PluginSettingsGroup
        title={tr("bot.gathering.defenseWhileGathering")}
        description={tr("bot.gathering.selfDefenseWhileMining")}
      >
        <ElementToggle
          title={tr("bot.gathering.defendAgainstMobs")}
          note={tr("bot.gathering.fightsOffDangerousMobs")}
          enabled={settings.defendMobs}
          onToggle={() => updatePassages({ defendMobs: !settings.defendMobs })}
        />
        <ElementToggle
          title={tr("bot.gathering.defendAgainstPlayers")}
          note={tr("bot.gathering.hitsBackReturnsTo")}
          enabled={settings.defendPlayers}
          onToggle={() => updatePassages({ defendPlayers: !settings.defendPlayers })}
        />
        <ElementToggle
          title={tr("bot.gathering.defendAgainstArrows")}
          note={tr("bot.gathering.usesAShieldIf")}
          enabled={settings.defendArrows}
          onToggle={() => updatePassages({ defendArrows: !settings.defendArrows })}
        />
        <p className="mineflayer-bot-combat-note">{tr("bot.gathering.usesTheCurrentMelee")}</p>
        <div className="mineflayer-bot-controls mineflayer-bot-gathering-actions">
          <button type="button" disabled={disabled} onClick={() => void send(defenseCommand)}>
            {tr("bot.gathering.applyToBot")}
          </button>
        </div>
      </PluginSettingsGroup>
      <PluginSettingsGroup
        title={tr("bot.gathering.tunnelsAndLighting")}
        description={tr("bot.gathering.passageSizeWhenMining")}
      >
        <div className="mineflayer-bot-grid">
          {number(
            tr("bot.gathering.tunnelWidthBlocks"),
            settings.tunnelWidth,
            (tunnelWidth) => updatePassages({ tunnelWidth }),
            1,
            3,
          )}
          {number(
            tr("bot.gathering.tunnelHeightBlocks"),
            settings.tunnelHeight,
            (tunnelHeight) => updatePassages({ tunnelHeight }),
            2,
            4,
          )}
          {number(
            tr("bot.gathering.stairWidthBlocks"),
            settings.stairWidth,
            (stairWidth) => updatePassages({ stairWidth }),
            1,
            3,
          )}
          {number(
            tr("bot.gathering.stairClearanceBlocks"),
            settings.stairHeight,
            (stairHeight) => updatePassages({ stairHeight }),
            3,
            4,
          )}
        </div>
        <p className="mineflayer-bot-combat-note">{tr("bot.gathering.flatTunnelsAre2")}</p>
        <ElementToggle
          title={tr("bot.gathering.placeTorchesInCaves")}
          note={tr("bot.gathering.usesRegularTorchesFrom")}
          enabled={settings.placeTorches}
          onToggle={() => updatePassages({ placeTorches: !settings.placeTorches })}
        />
        {settings.placeTorches && (
          <div className="mineflayer-bot-grid">
            {number(
              tr("bot.gathering.torchSpacingBlocks"),
              settings.torchInterval,
              (torchInterval) => updatePassages({ torchInterval }),
              4,
              16,
            )}
          </div>
        )}
        <p className="mineflayer-bot-combat-note">{tr("bot.gathering.theDefaultSpacingIs")}</p>
        <div className="mineflayer-bot-controls mineflayer-bot-gathering-actions">
          <button type="button" disabled={disabled} onClick={() => void send(passageCommand)}>
            {tr("bot.gathering.applyToBot")}
          </button>
        </div>
      </PluginSettingsGroup>
      {message && (
        <p className="mineflayer-bot-chat-feedback is-error" role="alert">
          {message}
        </p>
      )}
    </details>
  );
}

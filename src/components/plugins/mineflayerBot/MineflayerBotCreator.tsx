import { TextField } from "../../inputs/TextField";
import { CustomNumberInput } from "../../inputs/CustomNumberInput";
import { Button } from "../../inputs/Button";
import { useTranslation } from "../../../i18n/locale";
import type { MineflayerBotPluginSettings } from "../../../types";
import { BOT_LIMIT, nextBotNicknames } from "./botFleet";
import "./MineflayerBotCreator.css";

type Props = {
  settings: MineflayerBotPluginSettings;
  count: number;
  prefix: string;
  disabled: boolean;
  onCountChange: (count: number) => void;
  onPrefixChange: (prefix: string) => void;
  onCreate: () => void;
};

export function MineflayerBotCreator({
  settings,
  count,
  prefix,
  disabled,
  onCountChange,
  onPrefixChange,
  onCreate,
}: Props) {
  const tr = useTranslation();
  const available = Math.max(0, BOT_LIMIT - 1 - settings.bots.length);
  const locked = disabled || available === 0;
  const nicknames = nextBotNicknames(settings, count, prefix);

  return (
    <section className="mf-fleet-creator" aria-label={tr("bot.fleet.createTitle")}>
      <div className="mf-fleet-creator-heading">
        <strong>{tr("bot.fleet.createTitle")}</strong>
        <span>{tr("bot.fleet.available", { count: available })}</span>
      </div>
      <div className="mf-fleet-creator-fields">
        <TextField
          label={tr("bot.fleet.prefix")}
          aria-label={tr("bot.fleet.prefix")}
          containerClassName="mf-fleet-creator-prefix"
          settings={{ showLabel: true, height: 44, paddingX: 14, fontSize: 13 }}
          value={prefix}
          maxLength={11}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          onChange={(event) => onPrefixChange(event.target.value)}
          disabled={locked}
        />
        <div className="mf-fleet-creator-count">
          <span>{tr("bot.fleet.count")}</span>
          <CustomNumberInput
            ariaLabel={tr("bot.fleet.count")}
            value={count}
            onChange={onCountChange}
            min={1}
            max={Math.max(1, available)}
            disabled={locked}
          />
        </div>
        <Button
          variant="primary"
          className="mf-fleet-creator-submit"
          settings={{ height: 44 }}
          disabled={locked}
          onClick={onCreate}
          icon={
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          }
        >
          {tr("bot.fleet.add")}
        </Button>
      </div>
      <div className="mf-fleet-creator-preview" aria-live="polite" aria-atomic="true">
        {nicknames.length ? (
          <>
            <span>{tr("bot.fleet.nicknamePreview")}</span>
            <div className="mf-fleet-creator-names">
              {nicknames.slice(0, 3).map((nickname) => (
                <code key={nickname}>{nickname}</code>
              ))}
              {nicknames.length > 3 && (
                <span>{tr("bot.fleet.moreNames", { count: nicknames.length - 3 })}</span>
              )}
            </div>
          </>
        ) : (
          <span>{tr("bot.fleet.limitReached", { count: BOT_LIMIT })}</span>
        )}
      </div>
    </section>
  );
}

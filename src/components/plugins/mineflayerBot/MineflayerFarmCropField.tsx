import { FARM_CROPS } from "./farming";
import { useTranslation } from "../../../i18n/locale";

export function MineflayerFarmCropField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const tr = useTranslation();
  return (
    <label className="mineflayer-bot-field">
      <span>{tr("bot.farmCrop.crop")}</span>
      <select
        className="mineflayer-farm-select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {FARM_CROPS.map((name) => (
          <option key={name} value={name}>
            {tr(`bot.crop.${name}`)}
          </option>
        ))}
      </select>
    </label>
  );
}

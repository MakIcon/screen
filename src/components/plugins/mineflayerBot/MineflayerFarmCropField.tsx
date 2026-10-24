import { FARM_CROPS } from "./farming";
import { SearchableSelect } from "../../inputs/SearchableSelect";
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
      <SearchableSelect
        label={tr("bot.farmCrop.crop")}
        variant="field"
        allowEmpty={false}
        value={value}
        onChange={onChange}
        options={FARM_CROPS.map((name) => ({ value: name, label: tr(`bot.crop.${name}`) }))}
      />
    </label>
  );
}

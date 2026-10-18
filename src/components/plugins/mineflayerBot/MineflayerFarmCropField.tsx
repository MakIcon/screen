import { FARM_CROPS } from "./farming";

export function MineflayerFarmCropField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="mineflayer-bot-field">
      <span>КУЛЬТУРА</span>
      <select
        className="mineflayer-farm-select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {FARM_CROPS.map(([name, label]) => (
          <option key={name} value={name}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}

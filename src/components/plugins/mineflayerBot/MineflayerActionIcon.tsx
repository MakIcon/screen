import pickaxe from "../../../assets/plugins/mineflayer/pickaxe.svg";
import axe from "../../../assets/plugins/mineflayer/axe.svg";
import chest from "../../../assets/plugins/mineflayer/chest.svg";
import basket from "../../../assets/plugins/mineflayer/basket.svg";
import fire from "../../../assets/plugins/mineflayer/fire.svg";
import returnArrow from "../../../assets/plugins/mineflayer/return.svg";
import craftingTable from "../../../assets/plugins/mineflayer/crafting-table.svg";
import hoe from "../../../assets/plugins/mineflayer/hoe.svg";
import seedling from "../../../assets/plugins/mineflayer/seedling.svg";

const ICONS: Record<string, string> = {
  mine: pickaxe,
  forest: axe,
  till: hoe,
  plant: seedling,
  harvest: basket,
  farm: seedling,
  deposit: chest,
  collect: basket,
  smelt: fire,
  return: returnArrow,
  craft: craftingTable,
};

export function MineflayerActionIcon({ kind }: { kind: string }) {
  const source = ICONS[kind] || craftingTable;
  return (
    <span
      className="mf-action-icon"
      style={{ maskImage: `url("${source}")`, WebkitMaskImage: `url("${source}")` }}
      aria-hidden="true"
    />
  );
}

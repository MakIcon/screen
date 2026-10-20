import { translate } from "../../../i18n/locale";

export const FARMING_KINDS = ["till", "plant", "harvest", "farm"];
export const FARM_CROPS = [
  "auto",
  "wheat",
  "beetroot",
  "carrot",
  "potato",
  "pumpkin",
  "melon",
  "nether_wart",
] as const;
export type FarmCrop = (typeof FARM_CROPS)[number];
export const farmingNote = () => translate("bot.farming.theBotNeedsA");
export const farmCropLabel = (value?: string) => {
  const crop = FARM_CROPS.find((name) => name === value);
  if (crop) return translate(`bot.crop.${crop}`);
  return value || translate("bot.farming.anyCrops");
};

export const FARMING_KINDS = ["till", "plant", "harvest", "farm"];
export const FARM_CROPS = [
  ["auto", "Любые из инвентаря / все зрелые"],
  ["wheat", "Пшеница"],
  ["beetroot", "Свёкла"],
  ["carrot", "Морковь"],
  ["potato", "Картофель"],
  ["pumpkin", "Тыква"],
  ["melon", "Арбуз"],
  ["nether_wart", "Нарост Незера"],
] as const;
export const FARMING_NOTE =
  "Мотыга и семена должны быть у бота. Вспашка — рядом с водой; посадка — в пустые грядки, нарост Незера — на песок душ. Бот собирает только зрелый урожай. Растения растут по обычным правилам Minecraft; для следующего сбора запустите задачу ещё раз.";
export const farmCropLabel = (value?: string) =>
  FARM_CROPS.find(([name]) => name === value)?.[1] || value || "Любые культуры";

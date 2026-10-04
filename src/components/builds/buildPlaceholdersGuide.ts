import {
  AVAILABLE_PLACEHOLDERS,
  type PlaceholderDefinition,
  type PlaceholderGroup,
} from "../../utils/placeholders";

export type GuidePlaceholderGroup = PlaceholderGroup | "bot";
export type GuidePlaceholder = Omit<PlaceholderDefinition, "group"> & {
  group: GuidePlaceholderGroup;
};

export const PLACEHOLDER_GUIDE_GROUPS: { id: GuidePlaceholderGroup; label: string }[] = [
  { id: "build", label: "Сборка" },
  { id: "player", label: "Игрок" },
  { id: "launcher", label: "Лаунчер" },
  { id: "library", label: "Библиотека" },
  { id: "bot", label: "Mineflayer-бот" },
];

const BOT_PLACEHOLDERS: readonly GuidePlaceholder[] = [
  {
    key: "owner",
    token: "%owner%",
    label: "Владелец бота",
    description: "Ник владельца бота. Только в сообщении Mineflayer-бота при входе.",
    group: "bot",
  },
  {
    key: "bot",
    token: "%bot%",
    label: "Ник бота",
    description: "Ник подключённого бота. Только в сообщении Mineflayer-бота при входе.",
    group: "bot",
  },
  {
    key: "server",
    token: "%server%",
    label: "Сервер бота",
    description: "Адрес сервера. Только в сообщении Mineflayer-бота при входе.",
    group: "bot",
  },
];

const GUIDE_PLACEHOLDERS: readonly GuidePlaceholder[] = [
  ...AVAILABLE_PLACEHOLDERS,
  ...BOT_PLACEHOLDERS,
];

const DESCRIPTIONS: Record<string, string> = {
  launcher_name: "Название лаунчера.",
  system_ram: "Вся оперативная память компьютера, в GB.",
  system_ram_value: "Память компьютера — только число, без GB.",
  launcher_ram: "Память, выбранная в настройках лаунчера, в GB.",
  launcher_ram_value: "Память из настроек лаунчера — только число.",
  player_name: "Ник игрока: локальный или из аккаунта Microsoft.",
  account_type: "Тип аккаунта: Offline или Microsoft.",
  build_name: "Название этой сборки.",
  build_version: "Версия Minecraft в сборке.",
  build_loader: "Загрузчик сборки: Fabric, Forge, Vanilla и другие.",
  build_loader_version: "Версия загрузчика. Если её нет — знак «—».",
  build_full_loader: "Название загрузчика вместе с его версией.",
  build_ram: "Выделенная сборке оперативная память, в GB.",
  build_ram_value: "Память сборки — только число, без GB.",
  build_playtime: "Сколько времени сыграно в этой сборке.",
  build_last_played: "Когда сборку запускали в последний раз.",
  build_created: "Дата создания сборки.",
  build_status: "Статус установки: например, Ready или Updating.",
  build_state: "Текущее состояние: например, Running во время игры.",
  build_source: "Источник данных сборки: сейчас Official.",
  total_playtime: "Время игры во всех сборках вместе.",
  total_builds: "Сколько всего сборок в библиотеке.",
  total_modded_builds: "Сколько сборок используют загрузчик модов.",
  total_vanilla_builds: "Сколько сборок с обычным Minecraft, без загрузчика модов.",
  total_allocated_ram: "Сумма выделенной памяти всех сборок, в GB.",
};

export function getPlaceholderGuideDescription(placeholder: GuidePlaceholder): string {
  return DESCRIPTIONS[placeholder.key] ?? placeholder.description;
}

export function findGuidePlaceholders(query: string, group: GuidePlaceholderGroup | "all") {
  const terms = query.replace(/\^%/g, "%").trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return GUIDE_PLACEHOLDERS.filter((placeholder) => {
    if (group !== "all" && placeholder.group !== group) return false;
    const text = [
      placeholder.token,
      placeholder.label,
      getPlaceholderGuideDescription(placeholder),
      ...(placeholder.aliases ?? []).map((alias) => `%${alias}%`),
    ]
      .join(" ")
      .toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
}

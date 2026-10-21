import { TAB_ORDER } from "../../constants/tabs";
import type { Locale, PlainMessageKey, useTranslation } from "../../i18n/locale";
import type { InstanceItem, TabKey } from "../../types";
import { PLUGIN_DEFINITIONS } from "../plugins/pluginRegistry";
import { pluginCopy } from "../plugins/pluginLocalization";
import type { PaletteCommand } from "./commandSearch";
import { createSettingsCommands } from "./settingsCommands";

const ACTIONS: {
  id: string;
  label: PlainMessageKey;
  keywords: string;
  icon: PaletteCommand["icon"];
  build?: boolean;
}[] = [
  {
    id: "open-folder",
    label: "commandPalette.openFolder",
    keywords: "открыть папку каталог файлы folder directory files",
    icon: "folder",
    build: true,
  },
  {
    id: "launch",
    label: "commandPalette.launchBuild",
    keywords: "запустить играть play launch start",
    icon: "play",
    build: true,
  },
  {
    id: "stop",
    label: "commandPalette.stopBuild",
    keywords: "остановить завершить stop kill game",
    icon: "play",
    build: true,
  },
  {
    id: "install",
    label: "commandPalette.installFiles",
    keywords: "установить файлы скачать minecraft install download",
    icon: "plus",
    build: true,
  },
  {
    id: "create",
    label: "commandPalette.createBuild",
    keywords: "создать сборку новая сборка create new build instance",
    icon: "plus",
  },
  {
    id: "import",
    label: "instances.importBuildFromFile",
    keywords:
      "импорт распаковать распаковка архив открыть mrpack slbuild import unpack archive modpack",
    icon: "archive",
  },
  {
    id: "export",
    label: "instances.exportBuild",
    keywords: "экспорт упаковать поделиться архив export pack share archive",
    icon: "archive",
    build: true,
  },
  {
    id: "build-settings",
    label: "instances.buildSettings",
    keywords: "сборка параметры java jvm ram окно arguments resolution build settings",
    icon: "settings",
    build: true,
  },
  {
    id: "logs",
    label: "ui.buildLogs",
    keywords: "логи журнал ошибка краш crash logs debug",
    icon: "arrow",
    build: true,
  },
  {
    id: "screenshots",
    label: "instances.screenshots",
    keywords: "скриншоты снимки screenshots images photos",
    icon: "arrow",
    build: true,
  },
  {
    id: "stats",
    label: "instances.stats",
    keywords: "статистика время игры stats statistics playtime",
    icon: "arrow",
    build: true,
  },
  {
    id: "backups",
    label: "instances.worldBackups",
    keywords: "копии миров резервные восстановить backup restore worlds",
    icon: "archive",
    build: true,
  },
  {
    id: "trash",
    label: "commandPalette.deletedBuilds",
    keywords: "корзина удаленные восстановить сборку trash deleted restore",
    icon: "archive",
  },
  {
    id: "accounts",
    label: "commandPalette.accounts",
    keywords: "аккаунты учетная запись вход microsoft login accounts skin скин",
    icon: "settings",
  },
  {
    id: "appearance",
    label: "commandPalette.appearanceStudio",
    keywords: "редактор оформление дизайн appearance studio design customize",
    icon: "settings",
  },
  {
    id: "updates",
    label: "settings.checkNow",
    keywords: "проверить обновления update check version",
    icon: "arrow",
  },
  {
    id: "guide",
    label: "app.startTheLauncherGuide",
    keywords: "тур обучение помощь guide help tutorial",
    icon: "arrow",
  },
];

const TAB_KEYWORDS: Record<TabKey, string> = {
  overview: "обзор главная overview home",
  instances: "сборки библиотека builds instances library",
  mods: "моды найти мод mods modrinth",
  resourcepacks: "ресурспаки ресурс паки текстуры resource packs textures",
  shaders: "шейдеры shaders",
  settings: "настройки параметры settings preferences",
};

type LauncherCommandsOptions = {
  tr: ReturnType<typeof useTranslation>;
  locale: Locale;
  instances: InstanceItem[];
  selectedName?: string;
  actions: Partial<Record<string, () => void>>;
  selectBuild: (id: string) => void;
  navigate: (tab: TabKey) => void;
  revealSetting: (id: string) => void;
};

export function createLauncherCommands({
  tr,
  locale,
  instances,
  selectedName,
  actions,
  selectBuild,
  navigate,
  revealSetting,
}: LauncherCommandsOptions): PaletteCommand[] {
  return [
    ...ACTIONS.filter(({ id }) => actions[id]).map(
      ({ id, label, keywords, icon, build }): PaletteCommand => ({
        id: `action:${id}`,
        label: tr(label),
        keywords: [keywords],
        icon,
        description: build ? selectedName : undefined,
        category: tr("commandPalette.actions"),
        run: actions[id]!,
      }),
    ),
    ...instances.map(
      (instance): PaletteCommand => ({
        id: `build:${instance.id}`,
        label: instance.name,
        icon: "build",
        description: `${instance.version} · ${instance.loader}`,
        category: tr("tabs.instances"),
        keywords: ["сборка сборки build instance"],
        run: () => selectBuild(instance.id),
      }),
    ),
    ...TAB_ORDER.map(
      (tab): PaletteCommand => ({
        id: `tab:${tab}`,
        label: tr(`tabs.${tab}`),
        icon: "arrow",
        category: tr("commandPalette.sections"),
        keywords: [TAB_KEYWORDS[tab]],
        run: () => navigate(tab),
      }),
    ),
    ...createSettingsCommands(tr, revealSetting),
    ...PLUGIN_DEFINITIONS.map(
      (definition): PaletteCommand => ({
        id: `plugin:${definition.id}`,
        label: definition.title,
        icon: "settings",
        category: tr("settings.extensions"),
        description: pluginCopy(definition, locale).description,
        keywords: [definition.id, "plugin extension настройки settings расширения плагин"],
        run: () => revealSetting(`plugin:${definition.id}`),
      }),
    ),
  ];
}

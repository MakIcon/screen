import type { PlainMessageKey, useTranslation } from "../../i18n/locale";
import type { PaletteCommand } from "./commandSearch";

export type SettingsCommandTarget = { id: string; sequence: number };

const SETTINGS_COMMANDS: { target: string; label: PlainMessageKey; keywords: string }[] = [
  {
    target: "settings-ram",
    label: "ui.ram",
    keywords: "ram memory память озу оперативная выделить гигабайт",
  },
  {
    target: "settings-appearance",
    label: "settings.appearance",
    keywords: "theme appearance color dark light void тема оформление цвет темная светлая",
  },
  {
    target: "settings-source",
    label: "settings.downloadSource",
    keywords: "network mirror download source сеть зеркало источник загрузки",
  },
  {
    target: "settings-auto-java",
    label: "settings.autoDownloadJava",
    keywords: "java runtime jre jdk download загрузить скачать джава",
  },
  {
    target: "settings-language",
    label: "settings.language",
    keywords: "language locale english russian язык английский русский",
  },
  {
    target: "settings-updates",
    label: "settings.launcherUpdates",
    keywords: "update version check обновление версия проверить",
  },
  {
    target: "settings-optimized",
    label: "settings.optimizedJavaArguments",
    keywords: "java jvm g1gc arguments performance аргументы оптимизация производительность",
  },
  {
    target: "settings-wheel",
    label: "settings.wheelTabSwitching",
    keywords: "wheel tabs navigation колесо мышь вкладки",
  },
  {
    target: "settings-snapshots",
    label: "settings.showSnapshots",
    keywords: "snapshot snapshots versions снапшот снапшоты версии",
  },
  {
    target: "settings-prereleases",
    label: "settings.showPreReleases",
    keywords: "prerelease pre release rc versions предрелиз предварительные версии",
  },
  {
    target: "settings-advanced",
    label: "settings.advancedSettings",
    keywords: "advanced expert расширенные дополнительные настройки",
  },
  {
    target: "settings-extensions",
    label: "settings.extensions",
    keywords: "plugins extensions расширения плагины",
  },
  {
    target: "settings-mascot",
    label: "settings.launcherMascot",
    keywords: "mascot pet pixel bunny заяц питомец маскот",
  },
  {
    target: "settings-mascot-name",
    label: "settings.mascotName",
    keywords: "mascot name имя маскота",
  },
  {
    target: "settings-mascot-show-name",
    label: "settings.showMascotName",
    keywords: "mascot name label имя маскота подпись",
  },
  {
    target: "settings-mascot-rage",
    label: "settings.rageMode",
    keywords: "mascot rage anger маскот ярость",
  },
  {
    target: "settings-mascot-bowl",
    label: "settings.waterBowl",
    keywords: "mascot water bowl маскот вода миска",
  },
  {
    target: "settings-mascot-movement",
    label: "settings.autonomousMovement",
    keywords: "mascot movement walk маскот движение ходить",
  },
  {
    target: "settings-mascot-interactions",
    label: "settings.playWithControls",
    keywords: "mascot interactions buttons маскот играть элементы кнопки",
  },
  {
    target: "settings-mascot-carry",
    label: "settings.carryUiElements",
    keywords: "mascot carry drag маскот переносить элементы",
  },
  {
    target: "settings-mascot-scroll",
    label: "settings.scrollLists",
    keywords: "mascot scroll lists маскот прокрутка списки",
  },
];

export function createSettingsCommands(
  tr: ReturnType<typeof useTranslation>,
  reveal: (target: string) => void,
): PaletteCommand[] {
  return SETTINGS_COMMANDS.map(({ target, label, keywords }) => ({
    id: target,
    label: tr(label),
    keywords: [keywords, "настройки settings preferences"],
    category: tr("tabs.settings"),
    description: tr("commandPalette.revealSetting"),
    icon: "settings",
    run: () => reveal(target),
  }));
}

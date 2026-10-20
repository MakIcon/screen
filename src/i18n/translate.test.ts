import { describe, expect, it } from "vitest";
import { en } from "./messages/en";
import { ru } from "./messages/ru";
import { formatMessage, isPlainMessageKey, translateFor, type MessageKey } from "./translate";
import { LAUNCHER_GUIDE_STEPS, guideStepKey } from "../components/guide/launcherGuideSteps";

const placeholders = (message: unknown): string[] => {
  const texts = typeof message === "string" ? [message] : Object.values(message as object);
  return [
    ...new Set(texts.flatMap((text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]))),
  ].sort();
};

describe("message catalogs", () => {
  it("have the same keys in both languages", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ru).sort());
  });

  it("use the same placeholders in both languages and have no empty texts", () => {
    for (const key of Object.keys(ru) as MessageKey[]) {
      expect(placeholders(en[key]), key).toEqual(placeholders(ru[key]));
      const texts =
        typeof ru[key] === "string"
          ? [ru[key], en[key]]
          : [...Object.values(ru[key]), ...Object.values(en[key])];
      for (const text of texts) expect(String(text).trim(), key).not.toBe("");
    }
  });

  it("cover every launcher guide step", () => {
    for (const step of LAUNCHER_GUIDE_STEPS)
      for (const field of ["eyebrow", "title", "description"])
        expect(isPlainMessageKey(`${guideStepKey(step.id)}.${field}`), `${step.id}.${field}`).toBe(
          true,
        );
  });

  it("uses a consistent polite form of address in Russian UI copy", () => {
    const informal =
      /(?<![А-Яа-яЁё])(?:выбери|нажми|перетащи|открой|создай|добавь|сохрани|проверь|попробуй|закрой|запусти|отпусти|останови)(?![А-Яа-яЁё])/i;
    for (const [key, message] of Object.entries(ru)) {
      const texts = typeof message === "string" ? [message] : Object.values(message);
      for (const text of texts) expect(text, key).not.toMatch(informal);
    }
  });
});

describe("translate", () => {
  it("substitutes placeholders", () => {
    expect(translateFor("ru", "app.buildRestored", { name: "Aurora" })).toBe(
      "Сборка Aurora восстановлена",
    );
    expect(translateFor("en", "app.buildRestored", { name: "Aurora" })).toBe(
      "Build Aurora restored",
    );
  });

  it("picks Russian and English plural forms", () => {
    const ruWorlds = [1, 2, 5, 11, 21, 22, 25].map((count) =>
      translateFor("ru", "worldBackups.worlds", { count }),
    );
    expect(ruWorlds).toEqual([
      "1 мир",
      "2 мира",
      "5 миров",
      "11 миров",
      "21 мир",
      "22 мира",
      "25 миров",
    ]);
    expect(translateFor("en", "worldBackups.worlds", { count: 1 })).toBe("1 world");
    expect(translateFor("en", "worldBackups.worlds", { count: 3 })).toBe("3 worlds");
  });

  it("formats counts with the locale's digit grouping", () => {
    expect(translateFor("en", "bot.gathering.blocksInTheArea", { count: 32768 })).toBe(
      "32,768 blocks in the area",
    );
    expect(formatMessage("ru", "bot.gathering.blocksInTheArea", { count: 32768 })).toMatch(
      /^32\s768 блоков в области$/,
    );
  });

  it("only accepts runtime keys that exist without placeholders", () => {
    expect(isPlainMessageKey("tabs.overview")).toBe(true);
    expect(isPlainMessageKey("app.buildRestored")).toBe(false);
    expect(isPlainMessageKey("tabs.missing")).toBe(false);
  });

  it("declines catalog counters and formats numbers in the selected language", () => {
    const counts = [0, 1, 2, 5, 11, 21, 22, 25];
    expect(
      counts.map((count) => translateFor("ru", "catalogProjectCard.downloads", { count })),
    ).toEqual([
      "0 ЗАГРУЗОК",
      "1 ЗАГРУЗКА",
      "2 ЗАГРУЗКИ",
      "5 ЗАГРУЗОК",
      "11 ЗАГРУЗОК",
      "21 ЗАГРУЗКА",
      "22 ЗАГРУЗКИ",
      "25 ЗАГРУЗОК",
    ]);
    expect(translateFor("ru", "catalogProjectCard.followers", { count: 1 })).toBe("1 ПОДПИСЧИК");
    expect(translateFor("ru", "catalogProjectCard.followers", { count: 2 })).toBe("2 ПОДПИСЧИКА");
    expect(translateFor("en", "catalogProjectCard.downloads", { count: 1000 })).toBe(
      "1,000 DOWNLOADS",
    );
    expect(translateFor("ru", "catalogProjectCard.downloads", { count: 1000 })).toMatch(
      /^1\s000 ЗАГРУЗОК$/,
    );
  });
});

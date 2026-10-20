import { describe, expect, it } from "vitest";
import { installProgressCopy } from "./installProgress";

const progress = (phase: string, detail: string) => ({
  phase,
  detail,
  current: 1,
  total: 2,
  percent: 50,
});

describe("install progress localization", () => {
  it("translates phase IDs and English backend messages", () => {
    expect(installProgressCopy(progress("prepare", "Resolving version metadata"), "ru")).toEqual({
      phase: "ПОДГОТОВКА",
      detail: "Проверка сведений о версии",
    });
    expect(installProgressCopy(progress("prepare", "Resolving version metadata"), "en").phase).toBe(
      "PREPARING",
    );
    expect(
      installProgressCopy(progress("natives-extract", "native extraction internals"), "ru").detail,
    ).toBe("Подготовка системных библиотек");
    expect(installProgressCopy(progress("prepare", "Подготовка запуска…"), "en").detail).toBe(
      "Preparing launch…",
    );
  });

  it("preserves filenames without exposing English diagnostic prefixes or paths", () => {
    expect(
      installProgressCopy(progress("libraries", "Library C:/cache/mod.jar"), "ru").detail,
    ).toBe("Загрузка файла: mod.jar");
    expect(
      installProgressCopy(progress("new_phase", "unrecognized internal message"), "ru").detail,
    ).toBe("Выполнение…");
  });
});

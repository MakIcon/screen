import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

export const BUILD_PLACEHOLDERS_WINDOW_LABEL = "build-placeholders";
let openingWindow: Promise<void> | null = null;

export function isBuildPlaceholdersWindowRoute(search: string): boolean {
  return new URLSearchParams(search).get("window") === "placeholders";
}

export function getBuildPlaceholdersWindowUrl(): string {
  return "/?window=placeholders";
}

export async function openBuildPlaceholdersWindow(): Promise<void> {
  if (!isTauri()) {
    const popup = window.open(
      getBuildPlaceholdersWindowUrl(),
      BUILD_PLACEHOLDERS_WINDOW_LABEL,
      "popup,width=780,height=800",
    );
    if (!popup) throw new Error("Не удалось открыть окно плейсхолдеров.");
    popup.focus();
    return;
  }

  if (openingWindow) return openingWindow;
  const pending = (async () => {
    let guide = await WebviewWindow.getByLabel(BUILD_PLACEHOLDERS_WINDOW_LABEL);
    if (!guide) {
      guide = new WebviewWindow(BUILD_PLACEHOLDERS_WINDOW_LABEL, {
        url: getBuildPlaceholdersWindowUrl(),
        title: "ScreenLauncher — Плейсхолдеры",
        width: 780,
        height: 800,
        minWidth: 600,
        minHeight: 480,
        center: true,
        visible: false,
        focus: false,
        resizable: true,
        decorations: false,
        transparent: true,
        backgroundColor: [0, 0, 0, 0],
        shadow: false,
        parent: getCurrentWindow(),
      });
      const createdGuide = guide;
      const disposers: (() => void)[] = [];
      let settled = false;
      try {
        await new Promise<void>((resolve, reject) => {
          const register = (subscription: Promise<() => void>) =>
            subscription.then((dispose) => {
              if (settled) dispose();
              else disposers.push(dispose);
            });
          void Promise.all([
            register(createdGuide.once("tauri://created", () => resolve())),
            register(
              createdGuide.once("tauri://error", (event) =>
                reject(new Error(String(event.payload))),
              ),
            ),
          ]).catch(reject);
        });
      } finally {
        settled = true;
        disposers.forEach((dispose) => dispose());
      }
    }
    await guide.show();
    await guide.setFocus();
  })();
  openingWindow = pending;
  try {
    await pending;
  } finally {
    openingWindow = null;
  }
}

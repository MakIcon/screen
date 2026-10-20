import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { translate } from "../../../i18n/locale";

export const MINEFLAYER_BOT_WINDOW_LABEL = "mineflayer-bot";
let openingWindow: Promise<void> | null = null;

export function isMineflayerBotWindowRoute(search: string): boolean {
  return new URLSearchParams(search).get("window") === "mineflayer-bot";
}

export function getMineflayerBotWindowUrl(): string {
  return "/?window=mineflayer-bot";
}

export async function openMineflayerBotWindow(): Promise<void> {
  if (!isTauri()) {
    const popup = window.open(
      getMineflayerBotWindowUrl(),
      MINEFLAYER_BOT_WINDOW_LABEL,
      "popup,width=1120,height=840",
    );
    if (!popup) throw new Error(translate("bot.main.couldNotOpenThe"));
    popup.focus();
    return;
  }

  if (openingWindow) return openingWindow;
  const pending = (async () => {
    let botWindow = await WebviewWindow.getByLabel(MINEFLAYER_BOT_WINDOW_LABEL);
    if (!botWindow) {
      botWindow = new WebviewWindow(MINEFLAYER_BOT_WINDOW_LABEL, {
        url: getMineflayerBotWindowUrl(),
        title: translate("bot.main.screenlauncherBotControl"),
        width: 1120,
        height: 840,
        minWidth: 720,
        minHeight: 520,
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
      const createdWindow = botWindow;
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
            register(createdWindow.once("tauri://created", () => resolve())),
            register(
              createdWindow.once("tauri://error", (event) =>
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
    await botWindow.show();
    await botWindow.setFocus();
  })();
  openingWindow = pending;
  try {
    await pending;
  } finally {
    openingWindow = null;
  }
}

import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

export const APPEARANCE_STUDIO_WINDOW_LABEL = "appearance-studio";

export function isAppearanceStudioRoute() {
  return new URLSearchParams(window.location.search).get("window") === "appearance";
}

export function getAppearanceStudioWindowUrl() {
  return "/?window=appearance";
}

export async function openAppearanceStudioWindow() {
  const existing = await WebviewWindow.getByLabel(APPEARANCE_STUDIO_WINDOW_LABEL);
  if (existing) {
    await existing.show();
    await existing.setFocus();
    return existing;
  }

  const studioWindow = new WebviewWindow(APPEARANCE_STUDIO_WINDOW_LABEL, {
    url: getAppearanceStudioWindowUrl(),
    title: "ScreenLauncher — Appearance Studio",
    width: 640,
    height: 760,
    minWidth: 560,
    minHeight: 600,
    center: true,
    focus: true,
    resizable: true,
    decorations: false,
  });

  void studioWindow.once("tauri://created", () => {
    void studioWindow.setFocus();
  });

  return studioWindow;
}

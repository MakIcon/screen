import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { currentMonitor, getCurrentWindow, monitorFromPoint } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

export const APPEARANCE_STUDIO_WINDOW_LABEL = "appearance-studio";
const APPEARANCE_STUDIO_WIDTH = 640;
const APPEARANCE_STUDIO_HEIGHT = 760;
const APPEARANCE_STUDIO_GAP = 16;

type PixelRect = { x: number; y: number; width: number; height: number };
type PixelSize = { width: number; height: number };

export function calculateAppearanceStudioPosition(
  launcher: PixelRect,
  studio: PixelSize,
  workArea: PixelRect,
  gap: number,
) {
  const minX = workArea.x;
  const minY = workArea.y;
  const maxX = Math.max(minX, workArea.x + workArea.width - studio.width);
  const maxY = Math.max(minY, workArea.y + workArea.height - studio.height);
  const desiredX = launcher.x - studio.width - gap;
  const desiredY = launcher.y + (launcher.height - studio.height) / 2;

  return {
    x: Math.round(Math.min(maxX, Math.max(minX, desiredX))),
    y: Math.round(Math.min(maxY, Math.max(minY, desiredY))),
  };
}

async function positionAppearanceStudioWindow(studioWindow: WebviewWindow) {
  const launcherWindow = getCurrentWindow();
  const [launcherPosition, launcherSize, studioSize, launcherScale] = await Promise.all([
    launcherWindow.outerPosition(),
    launcherWindow.outerSize(),
    studioWindow.outerSize(),
    launcherWindow.scaleFactor(),
  ]);
  const gap = Math.max(1, Math.round(APPEARANCE_STUDIO_GAP * launcherScale));
  const desiredX = launcherPosition.x - studioSize.width - gap;
  const desiredY = launcherPosition.y + (launcherSize.height - studioSize.height) / 2;
  const targetMonitor =
    (await monitorFromPoint(desiredX + studioSize.width / 2, desiredY + studioSize.height / 2)) ??
    (await currentMonitor());

  const position = targetMonitor
    ? calculateAppearanceStudioPosition(
        {
          x: launcherPosition.x,
          y: launcherPosition.y,
          width: launcherSize.width,
          height: launcherSize.height,
        },
        studioSize,
        {
          x: targetMonitor.workArea.position.x,
          y: targetMonitor.workArea.position.y,
          width: targetMonitor.workArea.size.width,
          height: targetMonitor.workArea.size.height,
        },
        gap,
      )
    : { x: Math.round(desiredX), y: Math.round(desiredY) };

  await studioWindow.setPosition(new PhysicalPosition(position.x, position.y));
}

async function showAppearanceStudioWindow(studioWindow: WebviewWindow) {
  await positionAppearanceStudioWindow(studioWindow).catch(() => {});
  await studioWindow.show();
  await studioWindow.setFocus();
}

export function isAppearanceStudioRoute() {
  return new URLSearchParams(window.location.search).get("window") === "appearance";
}

export function getAppearanceStudioWindowUrl() {
  return "/?window=appearance";
}

export async function openAppearanceStudioWindow() {
  const existing = await WebviewWindow.getByLabel(APPEARANCE_STUDIO_WINDOW_LABEL);
  if (existing) {
    await showAppearanceStudioWindow(existing);
    return existing;
  }

  const studioWindow = new WebviewWindow(APPEARANCE_STUDIO_WINDOW_LABEL, {
    url: getAppearanceStudioWindowUrl(),
    title: "ScreenLauncher — Appearance Studio",
    width: APPEARANCE_STUDIO_WIDTH,
    height: APPEARANCE_STUDIO_HEIGHT,
    minWidth: 560,
    minHeight: 600,
    center: true,
    visible: false,
    focus: false,
    resizable: true,
    decorations: false,
  });

  void studioWindow.once("tauri://created", () => {
    void showAppearanceStudioWindow(studioWindow);
  });

  return studioWindow;
}

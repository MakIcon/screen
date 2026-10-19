import { useCallback, useEffect, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { createSpeedMeter, describeUpdateError } from "./updateProgress";

/** How long the "update now" button counts down before starting by itself. */
export const AUTO_UPDATE_DELAY_MS = 7000;

const CHECK_TIMEOUT_MS = 15_000;
const PERIODIC_CHECK_MS = 3 * 60 * 60 * 1000;
const PROGRESS_FLUSH_MS = 60;
// Short pauses so the bar visibly reaches 100% and the install step is
// readable before Windows closes the launcher to run the installer.
const FILL_SETTLE_MS = 650;
const INSTALL_SETTLE_MS = 900;

export type LauncherUpdateInfo = {
  currentVersion: string;
  version: string;
  date: string | null;
  notes: string | null;
};

export type LauncherUpdateState =
  | { stage: "idle" }
  | { stage: "checking"; manual: boolean }
  | { stage: "available"; info: LauncherUpdateInfo; autoStart: boolean }
  | {
      stage: "downloading";
      info: LauncherUpdateInfo;
      downloaded: number;
      total: number | null;
      bytesPerSecond: number | null;
    }
  | { stage: "installing"; info: LauncherUpdateInfo }
  | { stage: "error"; info: LauncherUpdateInfo; message: string };

/** The states that put the white update sheet over the launcher. */
export type VisibleUpdateState = Exclude<
  LauncherUpdateState,
  { stage: "idle" } | { stage: "checking" }
>;

export type UpdateCheckResult =
  | { status: "available" | "up-to-date" | "busy" }
  | { status: "error"; message: string };

type Options = {
  /** Start checking once the launcher has finished opening. */
  ready: boolean;
  /** Hold back an automatic prompt while something important runs (a game). */
  deferAutomatic: boolean;
  proxy: string | null;
};

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/** Swaps the held update, releasing the Rust-side resource of the old one. */
const swapUpdate = (ref: { current: Update | null }, next: Update | null) => {
  const previous = ref.current;
  ref.current = next;
  if (previous && previous !== next) void previous.close().catch(() => {});
};

const toInfo = (update: Update): LauncherUpdateInfo => ({
  currentVersion: update.currentVersion,
  version: update.version,
  date: update.date ?? null,
  notes: update.body?.trim() || null,
});

export function useLauncherUpdater({ ready, deferAutomatic, proxy }: Options) {
  const [state, setState] = useState<LauncherUpdateState>({ stage: "idle" });
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const updateRef = useRef<Update | null>(null);
  const busyRef = useRef(false);
  const dismissedVersionRef = useRef<string | null>(null);
  const startedAutoCheckRef = useRef(false);
  const proxyRef = useRef(proxy);

  useEffect(() => {
    proxyRef.current = proxy;
  }, [proxy]);

  useEffect(() => {
    getVersion()
      .then(setCurrentVersion)
      .catch(() => {});
  }, []);

  const checkForUpdates = useCallback(
    async ({ manual }: { manual: boolean }): Promise<UpdateCheckResult> => {
      if (busyRef.current) return { status: "busy" };
      busyRef.current = true;
      setState({ stage: "checking", manual });

      try {
        const update = await check({
          timeout: CHECK_TIMEOUT_MS,
          ...(proxyRef.current ? { proxy: proxyRef.current } : {}),
        });
        if (!update || (!manual && update.version === dismissedVersionRef.current)) {
          if (update) void update.close().catch(() => {});
          setState({ stage: "idle" });
          return { status: "up-to-date" };
        }
        swapUpdate(updateRef, update);
        setState({ stage: "available", info: toInfo(update), autoStart: !manual });
        return { status: "available" };
      } catch (error) {
        setState({ stage: "idle" });
        return { status: "error", message: describeUpdateError(error) };
      } finally {
        busyRef.current = false;
      }
    },
    [],
  );

  const startUpdate = useCallback(async () => {
    const update = updateRef.current;
    if (!update || busyRef.current) return;
    busyRef.current = true;

    const info = toInfo(update);
    const meter = createSpeedMeter();
    let downloaded = 0;
    let total: number | null = null;
    let flushTimer: number | null = null;

    const flush = () => {
      flushTimer = null;
      setState({ stage: "downloading", info, downloaded, total, bytesPerSecond: meter.read() });
    };

    setState({ stage: "downloading", info, downloaded: 0, total: null, bytesPerSecond: null });

    try {
      await update.download((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? null;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          meter.push(performance.now(), downloaded);
        }
        // Chunks arrive hundreds of times per second; repaint at a steady pace.
        flushTimer ??= window.setTimeout(flush, PROGRESS_FLUSH_MS);
      });
      if (flushTimer !== null) window.clearTimeout(flushTimer);

      setState({
        stage: "downloading",
        info,
        downloaded,
        total: total ?? downloaded,
        bytesPerSecond: null,
      });
      await wait(FILL_SETTLE_MS);
      setState({ stage: "installing", info });
      await wait(INSTALL_SETTLE_MS);

      // On Windows this runs the installer silently and exits; the installer
      // starts the new launcher by itself. Other platforms return here.
      await update.install();
      await relaunch();
    } catch (error) {
      if (flushTimer !== null) window.clearTimeout(flushTimer);
      setState({ stage: "error", info, message: describeUpdateError(error) });
    } finally {
      busyRef.current = false;
    }
  }, []);

  const dismiss = useCallback(() => {
    if (busyRef.current) return;
    const update = updateRef.current;
    if (update) dismissedVersionRef.current = update.version;
    swapUpdate(updateRef, null);
    setState({ stage: "idle" });
  }, []);

  // One check right after the launcher opens, then a quiet re-check every few
  // hours for launchers left open in the tray all day.
  useEffect(() => {
    if (!ready) return;
    if (!startedAutoCheckRef.current) {
      startedAutoCheckRef.current = true;
      void checkForUpdates({ manual: false });
    }
    const interval = window.setInterval(() => {
      if (!updateRef.current) void checkForUpdates({ manual: false });
    }, PERIODIC_CHECK_MS);
    return () => window.clearInterval(interval);
  }, [checkForUpdates, ready]);

  const held = state.stage === "available" && state.autoStart && deferAutomatic;
  const overlayState: VisibleUpdateState | null =
    state.stage === "idle" || state.stage === "checking" || held ? null : state;
  const visible = overlayState !== null;

  useEffect(() => {
    if (!visible || state.stage !== "available" || !state.autoStart) return;
    const timer = window.setTimeout(() => void startUpdate(), AUTO_UPDATE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [startUpdate, state, visible]);

  return {
    state,
    overlayState,
    currentVersion,
    checking: state.stage === "checking",
    checkForUpdates,
    startUpdate,
    dismiss,
  };
}

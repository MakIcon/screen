import { translateFor, type Locale, type PlainMessageKey } from "../i18n/locale";
import type { InstallProgressPayload } from "../types";

const PHASE_MESSAGES: Record<string, PlainMessageKey> = {
  prepare: "progress.phase.prepare",
  client: "progress.phase.client",
  libraries: "progress.phase.libraries",
  assets: "progress.phase.assets",
  "assets-copy": "progress.phase.assets",
  java: "progress.phase.java",
  natives: "progress.phase.natives",
  "natives-download": "progress.phase.natives",
  "natives-extract": "progress.phase.natives",
  logging: "progress.phase.logging",
  done: "progress.phase.done",
  waiting: "progress.phase.waiting",
  download: "progress.phase.download",
  install: "progress.phase.install",
  launch: "progress.phase.launch",
};

const FRONTEND_DETAILS = [
  "progress.preparingInstall",
  "progress.installComplete",
  "progress.preparingLaunch",
  "progress.launchComplete",
  "progress.checkingAndLaunching",
  "progress.stoppingGame",
] as const;

/** Backend phase IDs stay stable; only the displayed captions depend on locale. */
export function installProgressCopy(progress: InstallProgressPayload | null, locale: Locale) {
  const phaseId = progress?.phase.trim().toLowerCase() || "waiting";
  const phase = translateFor(locale, PHASE_MESSAGES[phaseId] ?? "progress.working");
  const raw = progress?.detail.trim() ?? "";
  const frontendKey = FRONTEND_DETAILS.find(
    (key) => raw === translateFor("ru", key) || raw === translateFor("en", key),
  );
  let detail: string;
  if (!raw) detail = translateFor(locale, "progress.working");
  else if (frontendKey) detail = translateFor(locale, frontendKey);
  else if (/[а-яё]/i.test(raw)) detail = raw;
  else if (/^(?:resolving version metadata|preparing install)$/i.test(raw))
    detail = translateFor(locale, "progress.resolvingVersion");
  else if (/^preparing launch/i.test(raw))
    detail = translateFor(locale, "progress.preparingLaunch");
  else if (/^(?:install|installation) complete/i.test(raw))
    detail = translateFor(locale, "progress.installComplete");
  else if (/^launch complete/i.test(raw)) detail = translateFor(locale, "progress.launchComplete");
  else if (phaseId === "java") detail = translateFor(locale, "progress.preparingJava");
  else if (phaseId === "natives-extract")
    detail = translateFor(locale, "progress.extractingNatives");
  else if (phaseId === "assets-copy") detail = translateFor(locale, "progress.preparingAssets");
  else {
    // Filenames are content, while surrounding diagnostics and paths stay out of captions.
    const filename = raw.match(/(?:^|[\\/\s])([^\\/\s]+\.(?:jar|json|zip|gz|png|ogg))$/i)?.[1];
    detail = filename ? translateFor(locale, "progress.downloadingFile", { filename }) : phase;
  }
  return { phase, detail };
}

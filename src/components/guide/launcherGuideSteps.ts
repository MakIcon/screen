import { isPlainMessageKey, type useTranslation } from "../../i18n/locale";
import type { LauncherGuideStep } from "./LauncherGuide";

/** A tour step without its text; the text comes from `guide.<stepId>.*` messages. */
export type LauncherGuideStepDefinition = Omit<
  LauncherGuideStep,
  "eyebrow" | "title" | "description"
>;

const target = (id: string) => `[data-guide-target='${id}']`;

/**
 * The launcher tour is intentionally data-driven: a new step only needs a
 * selector here and a matching data-guide-target on any rendered element.
 */
export const LAUNCHER_GUIDE_STEPS: LauncherGuideStepDefinition[] = [
  {
    id: "navigation",
    tab: "overview",
    targets: [target("navigation")],
    placement: "right",
  },
  {
    id: "overview-home",
    tab: "overview",
    targets: [target("overview-hero")],
    showPreview: true,
    scene: { kind: "play", idleLabel: "overview.playLast2" },
    placement: "right",
  },
  {
    id: "nickname",
    tab: "overview",
    targets: [target("nickname"), target("player-summary")],
    showPreview: true,
    previewValue: "SCREEN",
    previewValueSelector: "[data-guide-value]",
    demoAction: "type",
    showPointer: true,
    placement: "left",
    animation: "typewriter",
    zoom: 1.3,
  },
  {
    id: "account",
    tab: "overview",
    targets: [target("account-type"), target("overview-profile"), target("player-summary")],
    showPreview: true,
    scene: {
      kind: "dropdown",
      label: "overview.account",
      initialValue: "OFFLINE",
      options: ["OFFLINE", "MICROSOFT"],
      selectedValue: "MICROSOFT",
      variant: "account",
    },
    placement: "left",
  },
  {
    id: "build-library",
    tab: "instances",
    targets: [target("build-library")],
    placement: "right",
  },
  {
    id: "build-create-import",
    tab: "instances",
    targets: [target("build-library-actions")],
    showPreview: true,
    demoAction: "click",
    demoTargetSelector: "button:last-child",
    demoResultSelector: "button:last-child",
    demoResultText: "OPENING...",
    placement: "below",
  },
  {
    id: "build-editor",
    tab: "instances",
    targets: [target("build-create-fields"), target("build-details")],
    showPreview: true,
    scene: { kind: "build-config" },
    placement: "left",
  },
  {
    id: "build-actions",
    tab: "instances",
    targets: [target("build-actions"), target("build-create-actions"), target("build-details")],
    showPreview: true,
    scene: { kind: "play" },
    placement: "above",
  },
  {
    id: "mods-search",
    tab: "mods",
    targets: [target("mods-search")],
    showPreview: true,
    scene: {
      kind: "search",
      label: "modrinthContent.mods.searchLabel",
      placeholder: "modrinthContent.mods.searchPlaceholder",
      value: "sodium",
    },
    placement: "below",
  },
  {
    id: "mods-catalog",
    tab: "mods",
    targets: [target("mods-catalog")],
    showPreview: true,
    scene: { kind: "catalog", contentKind: "mods" },
    placement: "right",
  },
  {
    id: "mods-target",
    tab: "mods",
    targets: [target("mods-target")],
    showPreview: true,
    scene: {
      kind: "dropdown",
      label: "modrinthContent.mods.targetDropdownLabel",
      initialValue: "AURORA FORGE",
      options: ["AURORA FORGE", "NIGHTFALL", "SILK ROAD"],
      selectedValue: "NIGHTFALL",
    },
    placement: "left",
  },
  {
    id: "mods-installed",
    tab: "mods",
    targets: [target("mods-installed")],
    placement: "left",
  },
  {
    id: "packs-search",
    tab: "resourcepacks",
    targets: [target("resourcepacks-search")],
    showPreview: true,
    scene: {
      kind: "search",
      label: "modrinthContent.resourcepacks.searchLabel",
      placeholder: "modrinthContent.resourcepacks.searchPlaceholder",
      value: "faithful",
    },
    placement: "below",
  },
  {
    id: "packs-catalog",
    tab: "resourcepacks",
    targets: [target("resourcepacks-catalog")],
    showPreview: true,
    scene: { kind: "catalog", contentKind: "resourcepacks" },
    placement: "right",
  },
  {
    id: "packs-target",
    tab: "resourcepacks",
    targets: [target("resourcepacks-target")],
    showPreview: true,
    scene: {
      kind: "dropdown",
      label: "modrinthContent.resourcepacks.targetDropdownLabel",
      initialValue: "SILK ROAD",
      options: ["SILK ROAD", "AURORA FORGE", "NIGHTFALL"],
      selectedValue: "AURORA FORGE",
    },
    placement: "left",
  },
  {
    id: "packs-installed",
    tab: "resourcepacks",
    targets: [target("resourcepacks-installed")],
    placement: "left",
  },
  {
    id: "shaders-search",
    tab: "shaders",
    targets: [target("shaders-search")],
    showPreview: true,
    scene: {
      kind: "search",
      label: "modrinthContent.shaders.searchLabel",
      placeholder: "modrinthContent.shaders.searchPlaceholder",
      value: "complementary",
    },
    placement: "below",
  },
  {
    id: "shaders-catalog",
    tab: "shaders",
    targets: [target("shaders-catalog")],
    showPreview: true,
    scene: { kind: "catalog", contentKind: "shaders" },
    placement: "right",
  },
  {
    id: "shaders-target",
    tab: "shaders",
    targets: [target("shaders-target")],
    showPreview: true,
    scene: {
      kind: "dropdown",
      label: "modrinthContent.shaders.targetDropdownLabel",
      initialValue: "AURORA FORGE",
      options: ["AURORA FORGE", "NIGHTFALL", "SILK ROAD"],
      selectedValue: "NIGHTFALL",
    },
    placement: "left",
  },
  {
    id: "shaders-installed",
    tab: "shaders",
    targets: [target("shaders-installed")],
    placement: "left",
  },
  {
    id: "settings-ram",
    tab: "settings",
    targets: [target("settings-ram")],
    showPreview: true,
    scene: { kind: "slider", startPercent: 28, endPercent: 66 },
    placement: "right",
  },
  {
    id: "settings-appearance",
    tab: "settings",
    targets: [target("settings-appearance")],
    showPreview: true,
    scene: { kind: "choice", group: "appearance" },
    placement: "right",
  },
  {
    id: "settings-source",
    tab: "settings",
    targets: [target("settings-source")],
    showPreview: true,
    scene: { kind: "choice", group: "source" },
    placement: "right",
  },
  {
    id: "settings-auto-java",
    tab: "settings",
    targets: [target("settings-auto-java")],
    showPreview: true,
    scene: { kind: "choice", group: "java" },
    placement: "right",
  },
  {
    id: "settings-language",
    tab: "settings",
    targets: [target("settings-language")],
    showPreview: true,
    scene: { kind: "choice", group: "language" },
    placement: "right",
  },
  {
    id: "settings-preferences",
    tab: "settings",
    targets: [target("settings-preferences")],
    placement: "left",
    spotlightPadding: 5,
  },
  {
    id: "settings-optimized",
    tab: "settings",
    targets: [target("settings-optimized")],
    showPreview: true,
    scene: {
      kind: "preference",
      title: "settings.optimizedJavaArguments",
      note: "settings.launchWithG1gcSettings",
      initialEnabled: false,
    },
    placement: "left",
  },
  {
    id: "settings-wheel",
    tab: "settings",
    targets: [target("settings-wheel")],
    showPreview: true,
    scene: {
      kind: "preference",
      title: "settings.wheelTabSwitching",
      note: "settings.switchTabsWithThe",
      initialEnabled: false,
    },
    placement: "left",
  },
  {
    id: "settings-mascot",
    tab: "settings",
    targets: [target("settings-mascot")],
    showPreview: true,
    scene: {
      kind: "preference",
      title: "settings.launcherMascot",
      note: "settings.theMascotWalksAround",
      action: "expand",
    },
    placement: "left",
  },
  {
    id: "settings-snapshots",
    tab: "settings",
    targets: [target("settings-snapshots")],
    showPreview: true,
    scene: {
      kind: "preference",
      title: "settings.showSnapshots",
      note: "settings.showSnapshotVersionsIn",
      initialEnabled: false,
    },
    placement: "left",
  },
  {
    id: "settings-prereleases",
    tab: "settings",
    targets: [target("settings-prereleases")],
    showPreview: true,
    scene: {
      kind: "preference",
      title: "settings.showPreReleases",
      note: "settings.showPreReleaseAnd",
      initialEnabled: false,
    },
    placement: "left",
  },
  {
    id: "settings-advanced",
    tab: "settings",
    targets: [target("settings-advanced")],
    showPreview: true,
    scene: {
      kind: "preference",
      title: "settings.advancedSettings",
      note: "settings.enablesBuildSettingsAnd",
      initialEnabled: false,
    },
    placement: "left",
  },
  {
    id: "guide-replay",
    tab: "settings",
    targets: [target("guide-replay")],
    showPreview: true,
    demoAction: "click",
    demoTargetSelector: "button",
    placement: "below",
  },
];

/** Message key prefix of a step: "overview-home" → "guide.overviewHome". */
export function guideStepKey(id: string): string {
  return `guide.${id.replace(/-(\w)/g, (_, letter: string) => letter.toUpperCase())}`;
}

export function localizeGuideSteps(
  steps: LauncherGuideStepDefinition[],
  tr: ReturnType<typeof useTranslation>,
): LauncherGuideStep[] {
  return steps.map((step) => {
    const text = (field: "eyebrow" | "title" | "description") => {
      const key = `${guideStepKey(step.id)}.${field}`;
      return isPlainMessageKey(key) ? tr(key) : "";
    };
    return {
      ...step,
      eyebrow: text("eyebrow"),
      title: text("title"),
      description: text("description"),
    };
  });
}

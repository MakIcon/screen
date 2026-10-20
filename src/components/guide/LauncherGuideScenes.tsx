import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { BuildConfigurationGrid } from "../builds/BuildConfigurationGrid";
import { CatalogSearchToolbar } from "../modrinth/CatalogSearchToolbar";
import { BuildPlayButton, type BuildPlayState } from "../builds/BuildPlayButton";
import { CatalogProjectCard, getCatalogPreviewProject } from "../modrinth/CatalogProjectCard";
import { InlineDropdown } from "../inputs/InlineDropdown";
import { ElementSlider } from "../inputs/ElementSlider";
import { ElementToggle } from "../inputs/ElementToggle";
import { ExpandableSettingsGroup } from "../settings/ExpandableSettingsGroup";
import { SettingsChoiceSwitch } from "../settings/SettingsChoiceSwitch";
import {
  APPEARANCE_CHOICES,
  JAVA_CHOICES,
  LANGUAGE_CHOICES,
  MIRROR_OPTIONS,
  localizeChoices,
} from "../settings/settingsChoices";
import type { ModrinthContentKind } from "../../hooks/useModrinthContent";
import type { ModrinthProject } from "../../types";
import { GuidePointer } from "./GuidePointer";
import { useTranslation, type PlainMessageKey } from "../../i18n/locale";
import { guideMaximumSceneHeight } from "./guidePreviewLayout";
import {
  guideSearchCameraTransform,
  guideTargetPoint,
  playGuideDemo,
  type GuideAction,
} from "./guidePlayback";

export type LauncherGuideScene =
  | {
      kind: "dropdown";
      label: PlainMessageKey;
      initialValue: string;
      options: string[];
      selectedValue: string;
      variant?: "default" | "account";
    }
  | { kind: "build-config" }
  | { kind: "play"; idleLabel?: PlainMessageKey }
  | { kind: "search"; label: PlainMessageKey; placeholder: PlainMessageKey; value: string }
  | { kind: "slider"; startPercent?: number; endPercent?: number }
  | { kind: "choice"; group: "appearance" | "source" | "java" | "language" }
  | { kind: "catalog"; contentKind: ModrinthContentKind }
  | {
      kind: "preference";
      title: PlainMessageKey;
      note: PlainMessageKey;
      initialEnabled?: boolean;
      action?: "toggle" | "expand";
    };

type CatalogSceneStatus = "idle" | "installing" | "installed";
const SceneMeasurementContext = createContext<{ catalogStatus?: CatalogSceneStatus } | null>(null);
const MEASUREMENT_STATES = [{}];
const CATALOG_MEASUREMENT_STATES: { catalogStatus: CatalogSceneStatus }[] = [
  { catalogStatus: "idle" },
  { catalogStatus: "installing" },
  { catalogStatus: "installed" },
];

function useScenePlayback(actions: GuideAction[]) {
  const measuring = useContext(SceneMeasurementContext);
  const rootRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (measuring || !rootRef.current || !pointerRef.current) return;
    return playGuideDemo(rootRef.current, pointerRef.current, actions);
  }, [actions, measuring]);
  return { rootRef, pointerRef };
}

const pause = (duration = 350): GuideAction => ({ kind: "wait", duration });
const move = (target: string, duration = 550): GuideAction => ({ kind: "move", target, duration });
const press = (target: string): GuideAction => ({ kind: "press", target });
const finish = (): GuideAction => pause(1_300);

function PlayScene({ idleLabel }: Extract<LauncherGuideScene, { kind: "play" }>) {
  const [state, setState] = useState<BuildPlayState>("idle");
  const actions = useMemo<GuideAction[]>(
    () => [
      pause(),
      move(".build-play-action"),
      press(".build-play-action"),
      pause(700),
      { kind: "animate", duration: 0, onFrame: () => setState("running") },
      finish(),
    ],
    [],
  );
  const { rootRef, pointerRef } = useScenePlayback(actions);
  return (
    <div ref={rootRef} className="launcher-guide-scene launcher-guide-play-scene">
      <BuildPlayButton
        state={state}
        idleLabel={idleLabel}
        disabled={state === "starting"}
        onClick={() => setState("starting")}
      />
      <GuidePointer pointerRef={pointerRef} />
    </div>
  );
}

function DropdownScene({
  label,
  initialValue,
  options,
  selectedValue,
  variant = "default",
}: Extract<LauncherGuideScene, { kind: "dropdown" }>) {
  const tr = useTranslation();
  const measuring = useContext(SceneMeasurementContext);
  const [isOpen, setIsOpen] = useState(Boolean(measuring));
  const [value, setValue] = useState(initialValue);
  const selectedIndex = Math.max(0, options.indexOf(selectedValue));
  const selector = `.inline-dropdown-item:nth-child(${selectedIndex + 1})`;
  const actions = useMemo(
    () => [
      pause(),
      move(".inline-dropdown-trigger"),
      press(".inline-dropdown-trigger"),
      pause(250),
      move(selector),
      press(selector),
      finish(),
    ],
    [selector],
  );
  const { rootRef, pointerRef } = useScenePlayback(actions);
  return (
    <div ref={rootRef} className="launcher-guide-scene launcher-guide-dropdown-scene">
      <div
        className={`launcher-guide-real-dropdown${variant === "account" ? " mockup-block mockup-account-dropdown" : ""}`}
      >
        <InlineDropdown
          label={tr(label)}
          value={value}
          options={options}
          isOpen={isOpen}
          inlineMenu
          onToggle={() => setIsOpen((open) => !open)}
          onSelect={(next) => {
            setValue(next);
            setIsOpen(false);
          }}
        />
      </div>
      <GuidePointer pointerRef={pointerRef} />
    </div>
  );
}

const GUIDE_BUILD_PROFILES = {
  DIVA: {
    version: "1.20.1",
    loader: "Fabric 0.19.3",
    source: "Official",
    playtime: "12 hrs on record",
  },
  NIGHTFALL: {
    version: "1.21.4",
    loader: "NeoForge 21.4.1",
    source: "Modrinth",
    playtime: "3.4 hrs on record",
  },
  "SILK ROAD": {
    version: "1.19.2",
    loader: "Fabric 0.16.9",
    source: "Official",
    playtime: "28 hrs on record",
  },
};
type GuideBuildName = keyof typeof GUIDE_BUILD_PROFILES;
const GUIDE_BUILD_OPTIONS = Object.keys(GUIDE_BUILD_PROFILES) as GuideBuildName[];

function BuildConfigScene() {
  const measuring = useContext(SceneMeasurementContext);
  const [isOpen, setIsOpen] = useState(Boolean(measuring));
  const [buildName, setBuildName] = useState<GuideBuildName>("NIGHTFALL");
  const actions = useMemo(
    () => [
      pause(),
      move(".inline-dropdown-trigger"),
      press(".inline-dropdown-trigger"),
      pause(250),
      move(".inline-dropdown-item:first-child"),
      press(".inline-dropdown-item:first-child"),
      finish(),
    ],
    [],
  );
  const { rootRef, pointerRef } = useScenePlayback(actions);
  const profile = GUIDE_BUILD_PROFILES[buildName];
  return (
    <div ref={rootRef} className="launcher-guide-scene launcher-guide-build-scene">
      <BuildConfigurationGrid
        className="launcher-guide-build-real-grid"
        buildName={buildName}
        buildOptions={GUIDE_BUILD_OPTIONS}
        isOpen={isOpen}
        inlineDropdownMenu
        onToggle={() => setIsOpen((open) => !open)}
        onSelect={(next) => {
          if (next in GUIDE_BUILD_PROFILES) setBuildName(next as GuideBuildName);
          setIsOpen(false);
        }}
        {...profile}
        bottomSpace={8}
      />
      <GuidePointer pointerRef={pointerRef} />
    </div>
  );
}

function SearchScene({
  label,
  placeholder,
  value,
  sourceElement,
}: Extract<LauncherGuideScene, { kind: "search" }> & { sourceElement: HTMLElement }) {
  const tr = useTranslation();
  const toolbarWidth = Math.max(440, sourceElement.offsetWidth);
  const [typedValue, setTypedValue] = useState("");
  const [focused, setFocused] = useState(false);
  const actions = useMemo<GuideAction[]>(
    () => [
      pause(),
      { kind: "move", target: "input", anchor: "text", duration: 550 },
      {
        kind: "animate",
        duration: 500,
        target: "input",
        anchor: "text",
        onFrame: (root, progress) => {
          const camera = root.querySelector<HTMLElement>(".launcher-guide-search-camera");
          const input = root.querySelector<HTMLInputElement>("input");
          if (!camera || !input) return;
          const initialScale = Number(camera.dataset.initialScale);
          const initialY = Number(camera.dataset.initialY);
          const focus = { x: Number(camera.dataset.focusX), y: Number(camera.dataset.focusY) };
          const outerScale = root.getBoundingClientRect().width / root.offsetWidth;
          const zoom = initialScale + progress * (1.15 / outerScale - initialScale);
          camera.style.transform = guideSearchCameraTransform(focus, zoom, {
            x: focus.x * initialScale * (1 - progress) + 40 * progress,
            y:
              (focus.y * initialScale + initialY) * (1 - progress) +
              (root.offsetHeight / 2) * progress,
          });
        },
      },
      { kind: "press", target: "input", anchor: "text" },
      { kind: "type", target: "input", value, onChange: setTypedValue },
      finish(),
    ],
    [value],
  );
  const { rootRef, pointerRef } = useScenePlayback(actions);
  useLayoutEffect(() => {
    const root = rootRef.current;
    const camera = root?.querySelector<HTMLElement>(".launcher-guide-search-camera");
    const input = root?.querySelector<HTMLInputElement>("input");
    if (!root || !camera || !input) return;
    const scale = root.offsetWidth / toolbarWidth;
    const y = (root.offsetHeight - camera.offsetHeight * scale) / 2;
    camera.style.transform = `translate(0px, ${y}px) scale(${scale})`;
    const focus = guideTargetPoint(root, input, "text");
    camera.dataset.focusX = String(focus.x / scale);
    camera.dataset.focusY = String((focus.y - y) / scale);
    camera.dataset.initialScale = String(scale);
    camera.dataset.initialY = String(y);
  }, [rootRef, toolbarWidth]);
  return (
    <div ref={rootRef} className="launcher-guide-scene launcher-guide-search-scene">
      <div className="launcher-guide-search-camera" style={{ width: toolbarWidth }}>
        <CatalogSearchToolbar
          label={tr(label)}
          placeholder={tr(placeholder)}
          value={typedValue}
          className={
            focused
              ? "launcher-guide-search-real-field is-demo-focused"
              : "launcher-guide-search-real-field"
          }
          onChange={(event) => setTypedValue(event.target.value)}
          onClick={() => setFocused(true)}
        />
      </div>
      <GuidePointer pointerRef={pointerRef} />
    </div>
  );
}

function SliderScene({
  startPercent = 28,
  endPercent = 66,
  sourceElement,
}: Extract<LauncherGuideScene, { kind: "slider" }> & { sourceElement: HTMLElement }) {
  const tr = useTranslation();
  const sourceThumb = sourceElement.querySelector("[role='slider']");
  const min = Number(sourceThumb?.getAttribute("aria-valuemin") ?? 1);
  const max = Number(sourceThumb?.getAttribute("aria-valuemax") ?? 64);
  const valueAt = (percent: number) => Math.round(min + ((max - min) * percent) / 100);
  const [currentValue, setCurrentValue] = useState(() => valueAt(startPercent));
  const actions = useMemo<GuideAction[]>(
    () => [
      pause(),
      move(".es-thumb"),
      {
        kind: "drag",
        duration: 1_050,
        target: ".es-thumb",
        onFrame: (root, progress) => {
          const thumb = root.querySelector<HTMLElement>(".es-thumb");
          const effectiveMin = Number(thumb?.getAttribute("aria-valuemin") ?? min);
          const effectiveMax = Number(thumb?.getAttribute("aria-valuemax") ?? max);
          const percent = startPercent + (endPercent - startPercent) * progress;
          // Flush the controlled slider before measuring it in the same frame.
          flushSync(() =>
            setCurrentValue(
              Math.round(effectiveMin + ((effectiveMax - effectiveMin) * percent) / 100),
            ),
          );
        },
      },
      finish(),
    ],
    [endPercent, max, min, startPercent],
  );
  const { rootRef, pointerRef } = useScenePlayback(actions);
  const sourceTicks = Array.from(sourceElement.querySelectorAll(".es-tick-label"), (tick) =>
    Number(tick.textContent),
  );
  return (
    <div ref={rootRef} className="launcher-guide-scene launcher-guide-slider-scene">
      <div className="settings-element-slider launcher-guide-real-slider">
        <ElementSlider
          label={tr("ui.ram")}
          min={min}
          max={max}
          defaultValue={4}
          step={1}
          value={currentValue}
          showHeader={false}
          showValue={false}
          tickMode="custom"
          customTicks={
            sourceTicks.length
              ? sourceTicks
              : [min, Math.round(max / 3), Math.round((max * 2) / 3), max]
          }
          onChange={setCurrentValue}
        />
      </div>
      <GuidePointer pointerRef={pointerRef} />
    </div>
  );
}

function ChoiceScene({
  group,
  sourceElement,
}: Extract<LauncherGuideScene, { kind: "choice" }> & { sourceElement: HTMLElement }) {
  const available =
    group === "appearance"
      ? APPEARANCE_CHOICES
      : group === "source"
        ? MIRROR_OPTIONS
        : group === "java"
          ? JAVA_CHOICES
          : LANGUAGE_CHOICES;
  const studioVisible = Boolean(sourceElement.querySelector(".theme-switch-btn--studio"));
  const tr = useTranslation();
  const options = localizeChoices(
    available.filter((option) => option.value !== "studio" || studioVisible),
    tr,
  );
  const [value, setValue] = useState(
    group === "appearance"
      ? "light"
      : group === "source"
        ? "official"
        : group === "java"
          ? "on"
          : "ru",
  );
  const selected =
    group === "appearance"
      ? "dark"
      : group === "source"
        ? "mirror"
        : group === "java"
          ? "off"
          : "en";
  const selector = `[data-choice-value='${selected}']`;
  const actions = useMemo(() => [pause(), move(selector), press(selector), finish()], [selector]);
  const { rootRef, pointerRef } = useScenePlayback(actions);
  return (
    <div ref={rootRef} className="launcher-guide-scene launcher-guide-choice-scene">
      <SettingsChoiceSwitch
        options={options}
        value={value}
        onChange={setValue}
        className={group === "appearance" ? "theme-switch--appearance" : ""}
      />
      <GuidePointer pointerRef={pointerRef} />
    </div>
  );
}

const CATALOG_SAMPLES: Record<ModrinthContentKind, ModrinthProject> = {
  mods: {
    projectId: "guide-fabric-api",
    slug: "fabric-api",
    title: "Fabric API",
    author: "modmuss50",
    description: "Core library for Fabric mods. Provides the APIs used by mods in your build.",
    categories: ["library"],
    displayCategories: ["library"],
    versions: [],
    downloads: 0,
    follows: 0,
  },
  resourcepacks: {
    projectId: "guide-faithful",
    slug: "faithful",
    title: "Faithful",
    author: "Faithful",
    description: "A resource pack for your Minecraft build.",
    categories: ["resource pack"],
    displayCategories: ["resource pack"],
    versions: [],
    downloads: 0,
    follows: 0,
  },
  shaders: {
    projectId: "guide-complementary",
    slug: "complementary",
    title: "Complementary",
    author: "EminGTR",
    description: "A shader pack for your Minecraft build. Enable it in Minecraft with Iris.",
    categories: ["shader"],
    displayCategories: ["shader"],
    versions: [],
    downloads: 0,
    follows: 0,
  },
};

function sourceProject(source: HTMLElement, kind: ModrinthContentKind) {
  return getCatalogPreviewProject(source) ?? CATALOG_SAMPLES[kind];
}

function CatalogScene({
  contentKind: kind,
  sourceElement,
}: Extract<LauncherGuideScene, { kind: "catalog" }> & { sourceElement: HTMLElement }) {
  const measuring = useContext(SceneMeasurementContext);
  const [project, setProject] = useState(() => sourceProject(sourceElement, kind));
  const installationStarted = useRef(false);
  useEffect(() => {
    const sync = () => {
      if (!installationStarted.current) setProject(sourceProject(sourceElement, kind));
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(sourceElement, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [kind, sourceElement]);
  const [status, setStatus] = useState<CatalogSceneStatus>(measuring?.catalogStatus ?? "idle");
  const [percent, setPercent] = useState(0);
  const actions = useMemo<GuideAction[]>(
    () => [
      pause(),
      move(".catalog-action.install"),
      press(".catalog-action.install"),
      {
        kind: "animate",
        duration: 1_200,
        onFrame: (_, progress) => setPercent(Math.round(progress * 100)),
      },
      { kind: "animate", duration: 0, onFrame: () => setStatus("installed") },
      finish(),
    ],
    [],
  );
  const { rootRef, pointerRef } = useScenePlayback(actions);
  return (
    <div ref={rootRef} className="launcher-guide-scene launcher-guide-catalog-scene">
      <CatalogProjectCard
        item={{ ...project, installed: status === "installed" }}
        kind={kind}
        category={project.displayCategories?.[0] || project.categories?.[0] || kind}
        busy={status === "installing"}
        contentBusy={status === "installing"}
        installedCatalogMode={kind === "shaders" ? "downloaded" : "update"}
        downloadProgress={
          status === "installing"
            ? {
                instanceId: "guide",
                projectId: project.projectId,
                filename: `${project.slug}.jar`,
                receivedBytes: percent,
                totalBytes: 100,
                percent,
                state: "downloading",
              }
            : null
        }
        onOpen={() => {}}
        onInstall={() => {
          installationStarted.current = true;
          setStatus("installing");
        }}
        onUninstall={() => setStatus("idle")}
        setDownloadPaused={async () => {}}
        cancelDownload={async () => {}}
      />
      <GuidePointer pointerRef={pointerRef} />
    </div>
  );
}

function PreferenceScene({
  title,
  note,
  initialEnabled = false,
  action = "toggle",
}: Extract<LauncherGuideScene, { kind: "preference" }>) {
  const tr = useTranslation();
  const measuring = useContext(SceneMeasurementContext);
  const [active, setActive] = useState(measuring && action === "expand" ? true : initialEnabled);
  const selector = action === "expand" ? ".settings-toggle-expand" : ".toggle-switch";
  const actions = useMemo(() => [pause(), move(selector), press(selector), finish()], [selector]);
  const { rootRef, pointerRef } = useScenePlayback(actions);
  return (
    <div ref={rootRef} className="launcher-guide-scene launcher-guide-preference-scene">
      {action === "expand" ? (
        <ExpandableSettingsGroup
          title={tr(title)}
          note={tr(note)}
          enabled
          expanded={active}
          onToggle={() => {}}
          onToggleExpanded={() => setActive((value) => !value)}
        >
          <div className="launcher-guide-real-preference-details">
            <span>{tr("launcherGuideScenes.name")}</span>
            <strong>PIXEL</strong>
            <span>{tr("launcherGuideScenes.movement")}</span>
            <strong>{tr("common.onCaps")}</strong>
          </div>
        </ExpandableSettingsGroup>
      ) : (
        <ElementToggle
          title={tr(title)}
          note={tr(note)}
          enabled={active}
          onToggle={() => setActive((value) => !value)}
        />
      )}
      <GuidePointer pointerRef={pointerRef} />
    </div>
  );
}

export function LauncherGuideDemoScene({
  scene,
  sourceElement,
  onHeightChange,
}: {
  scene: LauncherGuideScene;
  sourceElement: HTMLElement;
  onHeightChange: (height: number) => void;
}) {
  const measurementRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const measurement = measurementRef.current;
    if (!measurement) return;
    const roots = Array.from(
      measurement.children,
      (state) => state.firstElementChild as HTMLElement,
    );
    const measure = () => {
      const heights = roots.map((root) => {
        const style = window.getComputedStyle(root);
        const rootRect = root.getBoundingClientRect();
        const scale = rootRect.width / Math.max(1, parseFloat(style.width) || root.offsetWidth);
        let height = rootRect.height / scale;
        root.querySelectorAll<HTMLElement>(".inline-dropdown-menu-inline").forEach((menu) => {
          height = Math.max(
            height,
            (menu.getBoundingClientRect().bottom - rootRect.top) / scale +
              (parseFloat(style.paddingBottom) || 0),
          );
        });
        return height;
      });
      onHeightChange(guideMaximumSceneHeight(heights));
    };
    const resize = new ResizeObserver(measure);
    roots.forEach((root) => {
      resize.observe(root);
      root.querySelectorAll(".inline-dropdown-menu-inline").forEach((menu) => resize.observe(menu));
    });
    const mutations = new MutationObserver(measure);
    mutations.observe(measurement, { childList: true, subtree: true });
    measure();
    return () => {
      resize.disconnect();
      mutations.disconnect();
    };
  }, [onHeightChange]);
  const states = scene.kind === "catalog" ? CATALOG_MEASUREMENT_STATES : MEASUREMENT_STATES;
  return (
    <div>
      {renderScene(scene, sourceElement)}
      <div
        ref={measurementRef}
        className="launcher-guide-scene-measurements"
        aria-hidden="true"
        inert
      >
        {states.map((state, index) => (
          <div className="launcher-guide-scene-measurement-state" key={index}>
            <SceneMeasurementContext.Provider value={state}>
              {renderScene(scene, sourceElement)}
            </SceneMeasurementContext.Provider>
          </div>
        ))}
      </div>
    </div>
  );
}

function renderScene(scene: LauncherGuideScene, sourceElement: HTMLElement) {
  switch (scene.kind) {
    case "play":
      return <PlayScene {...scene} />;
    case "dropdown":
      return <DropdownScene {...scene} />;
    case "build-config":
      return <BuildConfigScene />;
    case "search":
      return <SearchScene {...scene} sourceElement={sourceElement} />;
    case "slider":
      return <SliderScene {...scene} sourceElement={sourceElement} />;
    case "choice":
      return <ChoiceScene {...scene} sourceElement={sourceElement} />;
    case "catalog":
      return <CatalogScene {...scene} sourceElement={sourceElement} />;
    case "preference":
      return <PreferenceScene {...scene} />;
  }
}

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import windowsArrowCursorUrl from "../../assets/cursors/windows-arrow.svg";
import { BuildConfigurationGrid } from "../builds/BuildConfigurationGrid";
import { CatalogSearchField } from "../modrinth/CatalogSearchField";
import { InlineDropdown } from "../inputs/InlineDropdown";
import { ElementSlider } from "../inputs/ElementSlider";
import { ElementToggle } from "../inputs/ElementToggle";
import { ExpandableSettingsGroup } from "../settings/ExpandableSettingsGroup";

export type LauncherGuideScene =
  | {
      kind: "dropdown";
      label: string;
      initialValue: string;
      options: string[];
      selectedValue: string;
      variant?: "default" | "account";
    }
  | {
      kind: "build-config";
    }
  | {
      kind: "search";
      label: string;
      placeholder: string;
      value: string;
    }
  | {
      kind: "slider";
      startPercent?: number;
      endPercent?: number;
    }
  | {
      kind: "preference";
      title: string;
      note: string;
      initialEnabled?: boolean;
      action?: "toggle" | "expand";
    };

interface LauncherGuideDemoSceneProps {
  scene: LauncherGuideScene;
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
} as const;

type GuideBuildName = keyof typeof GUIDE_BUILD_PROFILES;
const GUIDE_BUILD_OPTIONS = Object.keys(GUIDE_BUILD_PROFILES) as GuideBuildName[];

function ArrowPointer({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <span className={`launcher-guide-scene-pointer ${className}`} style={style}>
      <img src={windowsArrowCursorUrl} alt="" />
    </span>
  );
}

function DropdownScene({
  label,
  initialValue,
  options,
  selectedValue,
  variant = "default",
}: Extract<LauncherGuideScene, { kind: "dropdown" }>) {
  const [isOpen, setIsOpen] = useState(false);
  const [value, setValue] = useState(initialValue);
  const selectedIndex = Math.max(0, options.indexOf(selectedValue));

  useEffect(() => {
    const timers = [
      window.setTimeout(() => setIsOpen(true), 900),
      window.setTimeout(() => {
        setValue(selectedValue);
        setIsOpen(false);
      }, 1_900),
    ];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [selectedValue]);

  const style = {
    "--launcher-guide-scene-select-y": `${
      (variant === "account" ? 104 : 78) + selectedIndex * 49
    }px`,
  } as CSSProperties;

  return (
    <div className="launcher-guide-scene launcher-guide-dropdown-scene" style={style}>
      <div
        className={`launcher-guide-real-dropdown${
          variant === "account" ? " mockup-block mockup-account-dropdown" : ""
        }`}
      >
        <InlineDropdown
          label={label}
          value={value}
          options={options}
          isOpen={isOpen}
          inlineMenu
          onToggle={() => setIsOpen((open) => !open)}
          onSelect={(nextValue) => {
            setValue(nextValue);
            setIsOpen(false);
          }}
        />
      </div>
      <ArrowPointer className="launcher-guide-scene-pointer--dropdown" />
    </div>
  );
}

function BuildConfigScene() {
  const [isOpen, setIsOpen] = useState(false);
  const [buildName, setBuildName] = useState<GuideBuildName>("NIGHTFALL");
  const selectedIndex = 0;

  useEffect(() => {
    const timers = [
      window.setTimeout(() => setIsOpen(true), 900),
      window.setTimeout(() => {
        setBuildName(GUIDE_BUILD_OPTIONS[selectedIndex]);
        setIsOpen(false);
      }, 1_900),
    ];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const style = {
    "--launcher-guide-scene-select-y": `${63 + selectedIndex * 49}px`,
  } as CSSProperties;
  const profile = GUIDE_BUILD_PROFILES[buildName];

  return (
    <div className="launcher-guide-scene launcher-guide-build-scene" style={style}>
      <BuildConfigurationGrid
        className="launcher-guide-build-real-grid"
        buildName={buildName}
        buildOptions={GUIDE_BUILD_OPTIONS}
        isOpen={isOpen}
        inlineDropdownMenu
        onToggle={() => setIsOpen((open) => !open)}
        onSelect={(nextValue) => {
          if (nextValue in GUIDE_BUILD_PROFILES) setBuildName(nextValue as GuideBuildName);
          setIsOpen(false);
        }}
        version={profile.version}
        loader={profile.loader}
        source={profile.source}
        playtime={profile.playtime}
        bottomSpace={8}
      />
      <ArrowPointer className="launcher-guide-scene-pointer--build" />
    </div>
  );
}

function SearchScene({
  label,
  placeholder,
  value,
}: Extract<LauncherGuideScene, { kind: "search" }>) {
  const [typedValue, setTypedValue] = useState("");

  useEffect(() => {
    const timers = Array.from(value).map((_, index) =>
      window.setTimeout(() => setTypedValue(value.slice(0, index + 1)), 2_050 + index * 105),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [value]);

  return (
    <div className="launcher-guide-scene launcher-guide-search-scene">
      <div className="launcher-guide-search-content">
        <div className="launcher-guide-search-camera">
          <div className="launcher-guide-search-real-control">
            <CatalogSearchField
              label={label}
              placeholder={placeholder}
              value={typedValue}
              className="launcher-guide-search-real-field"
              onChange={(event) => setTypedValue(event.target.value)}
            />
          </div>
        </div>
      </div>
      <ArrowPointer className="launcher-guide-search-pointer" />
    </div>
  );
}

function SliderScene({
  startPercent = 28,
  endPercent = 66,
}: Extract<LauncherGuideScene, { kind: "slider" }>) {
  const min = 1;
  const max = 64;
  const valueAt = (percent: number) => Math.round(min + ((max - min) * percent) / 100);
  const [currentValue, setCurrentValue] = useState(valueAt(startPercent));

  useEffect(() => {
    const timer = window.setTimeout(() => setCurrentValue(valueAt(endPercent)), 900);
    return () => window.clearTimeout(timer);
  }, [endPercent]);

  const style = {
    "--launcher-guide-slider-start": `${startPercent}%`,
    "--launcher-guide-slider-end": `${endPercent}%`,
    "--launcher-guide-slider-drag": `${((endPercent - startPercent) / 100) * 288}px`,
  } as CSSProperties;

  return (
    <div className="launcher-guide-scene launcher-guide-slider-scene" style={style}>
      <div className="settings-element-slider launcher-guide-real-slider">
        <ElementSlider
          label="RAM"
          min={min}
          max={max}
          defaultValue={4}
          step={1}
          value={currentValue}
          showHeader={false}
          showValue={false}
          tickMode="custom"
          customTicks={[1, 21, 42, 64]}
          onChange={setCurrentValue}
        />
        <ArrowPointer className="launcher-guide-scene-pointer--slider" />
      </div>
    </div>
  );
}

function PreferenceScene({
  title,
  note,
  initialEnabled = false,
  action = "toggle",
}: Extract<LauncherGuideScene, { kind: "preference" }>) {
  const [active, setActive] = useState(initialEnabled);
  const sceneRef = useRef<HTMLDivElement>(null);
  const [pointerPosition, setPointerPosition] = useState<CSSProperties>();

  useEffect(() => {
    const timer = window.setTimeout(() => setActive((value) => !value), 1_080);
    return () => window.clearTimeout(timer);
  }, []);

  useLayoutEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const targetSelector = action === "expand" ? ".settings-toggle-expand" : ".toggle-switch";

    const update = () => {
      const target = scene.querySelector<HTMLElement>(targetSelector);
      if (!target) return;
      const sceneRect = scene.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const scaleX = sceneRect.width / Math.max(1, scene.offsetWidth);
      const scaleY = sceneRect.height / Math.max(1, scene.offsetHeight);
      setPointerPosition({
        left: (targetRect.left - sceneRect.left + targetRect.width / 2) / scaleX,
        top: (targetRect.top - sceneRect.top + targetRect.height / 2) / scaleY,
      });
    };

    const frame = window.requestAnimationFrame(update);
    const observer = new ResizeObserver(update);
    observer.observe(scene);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [action, active]);

  return (
    <div
      ref={sceneRef}
      className={`launcher-guide-scene launcher-guide-preference-scene${active ? " active" : ""}`}
    >
      {action === "expand" ? (
        <ExpandableSettingsGroup
          title={title}
          note={note}
          enabled
          expanded={active}
          onToggle={() => {}}
          onToggleExpanded={() => setActive((value) => !value)}
        >
          <div className="launcher-guide-real-preference-details">
            <span>NAME</span>
            <strong>PIXEL</strong>
            <span>MOVEMENT</span>
            <strong>ON</strong>
          </div>
        </ExpandableSettingsGroup>
      ) : (
        <ElementToggle
          title={title}
          note={note}
          enabled={active}
          onToggle={() => setActive((value) => !value)}
        />
      )}
      <ArrowPointer
        className={`launcher-guide-scene-pointer--preference launcher-guide-scene-pointer--preference-${action}`}
        style={pointerPosition}
      />
    </div>
  );
}

export function LauncherGuideDemoScene({ scene }: LauncherGuideDemoSceneProps) {
  switch (scene.kind) {
    case "dropdown":
      return <DropdownScene {...scene} />;
    case "build-config":
      return <BuildConfigScene />;
    case "search":
      return <SearchScene {...scene} />;
    case "slider":
      return <SliderScene {...scene} />;
    case "preference":
      return <PreferenceScene {...scene} />;
  }
}

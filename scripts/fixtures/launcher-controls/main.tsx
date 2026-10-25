import { useState } from "react";
import { createRoot } from "react-dom/client";
import { TextField, TextArea } from "../../../src/components/inputs/TextField";
import { SearchableSelect } from "../../../src/components/inputs/SearchableSelect";
import { InlineDropdown } from "../../../src/components/inputs/InlineDropdown";
import { ProgressBar } from "../../../src/components/display/ProgressBar";
import { Button } from "../../../src/components/inputs/Button";
import { IconButton } from "../../../src/components/inputs/IconButton";
import { Badge } from "../../../src/components/display/Badge";
import { StatusChip } from "../../../src/components/display/StatusChip";
import { ComponentPropsInspector } from "../../../src/appearance/ComponentPropsInspector";
import {
  createElementTarget,
  applyElementAppearanceOverrides,
  beginElementPicker,
  resolveElementTarget,
  resolveElementTextTarget,
} from "../../../src/appearance/elementOverrides";
import { normalizeAppearanceProfile } from "../../../src/appearance/profile";
import type {
  AppearanceElementComponentTarget,
  AppearanceElementComponentOverride,
} from "../../../src/appearance/types";
import "../../../src/styles/base.css";
import "../../../src/styles/theme.css";
import "../../../src/styles/forms.css";
import "../../../src/styles/modals/common.css";
import "../../../src/styles/modals/export-import.css";
import "../../../src/components/plugins/proxy/ProxyPlugin.css";
import "../../../src/components/plugins/mineflayerBot/MineflayerBotPlugin.css";
import "../../../src/appearance/AppearanceStudio.css";

Object.assign(window, {
  controlsQA: {
    createElementTarget,
    applyElementAppearanceOverrides,
    normalizeAppearanceProfile,
    beginElementPicker,
    resolveElementTarget,
    resolveElementTextTarget,
  },
});

function Fixture() {
  const [text, setText] = useState("Survival");
  const [choice, setChoice] = useState("fabric");
  const [open, setOpen] = useState(false);
  const [component, setComponent] = useState<AppearanceElementComponentTarget | null>(null);
  const [override, setOverride] = useState<AppearanceElementComponentOverride>();
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [buttonLoading, setButtonLoading] = useState(false);
  const [buttonClicks, setButtonClicks] = useState(0);
  const [iconClicks, setIconClicks] = useState(0);
  const [formSubmits, setFormSubmits] = useState(0);
  const [running, setRunning] = useState(true);
  const playIcon = (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <path d="m5 3 8 5-8 5Z" />
    </svg>
  );
  const inspect = (id: string) => {
    const node = document.querySelector<HTMLElement>(`#${id} [data-appearance-component]`)!;
    setTarget(node);
    setOverride(undefined);
    setComponent({
      kind: node.dataset.appearanceComponent!,
      props: JSON.parse(node.dataset.appearanceComponentProps!),
    } as AppearanceElementComponentTarget);
  };
  return (
    <div
      id="fixture"
      style={{
        padding: 32,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 32,
        maxWidth: 1160,
        margin: "0 auto",
      }}
    >
      <main style={{ display: "grid", gap: 20, alignContent: "start" }}>
        <h1 style={{ fontSize: 24 }}>Launcher controls</h1>
        <section id="text-example">
          <label className="field">
            <span>Build name</span>
            <TextField
              aria-label="Build name"
              value={text}
              onChange={(event) => setText(event.target.value)}
              settings={{
                showClear: true,
                showReset: true,
                defaultValue: "New build",
                showCounter: true,
              }}
            />
          </label>
        </section>
        <output id="text-value">{text}</output>
        <button onClick={() => inspect("text-example")}>Inspect text</button>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <label className="proxy-field" id="legacy-input">
            <span>Original field</span>
            <input value="127.0.0.1" readOnly />
          </label>
          <label className="proxy-field" id="new-input">
            <span>Shared field</span>
            <TextField value="127.0.0.1" readOnly />
          </label>
          <label className="mineflayer-bot-field" id="legacy-bot-input">
            <span>Original bot field</span>
            <input value="localhost" readOnly />
          </label>
          <label className="mineflayer-bot-field" id="new-bot-input">
            <span>Shared bot field</span>
            <TextField value="localhost" readOnly />
          </label>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <label className="proxy-field" id="proxy-select">
            <span>Protocol</span>
            <SearchableSelect
              label="Protocol"
              variant="field"
              value="socks5"
              options={["socks5", "http"]}
              onChange={() => {}}
            />
          </label>
          <label className="mineflayer-bot-field" id="bot-select">
            <span>Workstation</span>
            <SearchableSelect
              label="Workstation"
              variant="field"
              value="furnace"
              options={["furnace", "smoker"]}
              onChange={() => {}}
            />
          </label>
        </div>
        <label className="proxy-field">
          <span>Notes</span>
          <TextArea
            aria-label="Notes"
            defaultValue="Server notes"
            settings={{ showCounter: true }}
          />
        </label>
        <section id="select-example">
          <SearchableSelect
            label="Loader"
            settings={{ searchEnabled: true }}
            value={choice}
            onChange={setChoice}
            options={[
              { value: "fabric", label: "Fabric", description: "Lightweight loader" },
              { value: "forge", label: "Forge", disabled: true },
              { value: "quilt", label: "Quilt" },
              { value: "vanilla", label: "Vanilla" },
            ]}
          />
        </section>
        <output id="selected-value">{choice}</output>
        <button onClick={() => inspect("select-example")}>Inspect select</button>
        <InlineDropdown
          label="Minecraft version"
          value="1.21.4"
          options={Array.from({ length: 40 }, (_, index) => `1.21.${index}`)}
          isOpen={open}
          onToggle={() => setOpen(!open)}
          onSelect={() => setOpen(false)}
        />
        <section id="progress-example">
          <ProgressBar label="Build download" value={38} detail="38 / 100 files" />
        </section>
        <button onClick={() => inspect("progress-example")}>Inspect progress</button>
        <div className="eximp-progress">
          <ProgressBar
            label="Import"
            value={63}
            trackClassName="eximp-progress-track"
            settings={{ height: 8 }}
          />
        </div>
        <ProgressBar
          label="Unknown total"
          value={null}
          settings={{ variant: "rounded", height: 10 }}
        />
        <ProgressBar
          label="Workflow"
          value={7}
          max={12}
          settings={{ variant: "segmented", valueFormat: "fraction", height: 12 }}
        />
        <button id="after-select">Next control</button>
        <h2>Buttons & badges</h2>
        <section id="button-example">
          <Button
            variant="primary"
            icon={playIcon}
            loading={buttonLoading}
            loadingLabel="Installing build"
            onClick={() => {
              setButtonClicks((count) => count + 1);
              setButtonLoading(true);
            }}
          >
            Install build
          </Button>
        </section>
        <output id="button-clicks">{buttonClicks}</output>
        <button onClick={() => setButtonLoading(false)}>Finish loading</button>
        <button onClick={() => inspect("button-example")}>Inspect button</button>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Button>Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Delete build</Button>
          <Button disabled>Disabled</Button>
          <Button loading>Loading</Button>
        </div>
        <section id="icon-button-example">
          <IconButton aria-label="Open folder" onClick={() => setIconClicks((count) => count + 1)}>
            {playIcon}
          </IconButton>
        </section>
        <output id="icon-clicks">{iconClicks}</output>
        <button onClick={() => inspect("icon-button-example")}>Inspect icon button</button>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setFormSubmits((count) => count + 1);
          }}
        >
          <Button>Default action</Button>
          <Button type="submit">Submit action</Button>
          <output id="form-submits">{formSubmits}</output>
        </form>
        <section id="badge-example">
          <StatusChip tone={running ? "success" : "neutral"} pulse={running}>
            {running ? "Running" : "Stopped"}
          </StatusChip>
        </section>
        <button onClick={() => setRunning((value) => !value)}>Switch status</button>
        <button onClick={() => inspect("badge-example")}>Inspect badge</button>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Badge variant="outline">Fabric</Badge>
          <Badge tone="accent" variant="solid">
            Installed
          </Badge>
          <StatusChip tone="warning">Paused</StatusChip>
          <StatusChip tone="danger">Error</StatusChip>
          <StatusChip announce>Announced status</StatusChip>
          <button id="nested-badge">
            <StatusChip tone="success">Card status</StatusChip>
          </button>
        </div>
      </main>
      <aside style={{ minWidth: 0 }}>
        {component && (
          <ComponentPropsInspector
            component={component}
            override={override}
            onChange={(next) => {
              setOverride(next);
              target?.setAttribute(
                "data-appearance-component-settings",
                JSON.stringify(next.settings),
              );
            }}
          />
        )}
      </aside>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);

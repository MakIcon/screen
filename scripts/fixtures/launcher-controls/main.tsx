import { useState } from "react";
import { createRoot } from "react-dom/client";
import { TextField, TextArea } from "../../../src/components/inputs/TextField";
import { SearchableSelect } from "../../../src/components/inputs/SearchableSelect";
import { InlineDropdown } from "../../../src/components/inputs/InlineDropdown";
import { ProgressBar } from "../../../src/components/display/ProgressBar";
import { ComponentPropsInspector } from "../../../src/appearance/ComponentPropsInspector";
import {
  createElementTarget,
  applyElementAppearanceOverrides,
  beginElementPicker,
  resolveElementTarget,
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
  },
});

function Fixture() {
  const [text, setText] = useState("Survival");
  const [choice, setChoice] = useState("fabric");
  const [open, setOpen] = useState(false);
  const [component, setComponent] = useState<AppearanceElementComponentTarget | null>(null);
  const [override, setOverride] = useState<AppearanceElementComponentOverride>();
  const [target, setTarget] = useState<HTMLElement | null>(null);
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

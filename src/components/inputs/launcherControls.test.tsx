import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { filterSelectOptions, nextSelectIndex, type SelectOption } from "./SearchableSelect";
import { TextField } from "./TextField";
import { ProgressBar, progressMetrics, progressTicks } from "../display/ProgressBar";
import { normalizeAppearanceProfile } from "../../appearance/profile";
import {
  normalizeExtendedComponentValues,
  DROPDOWN_DEFAULTS,
} from "../../appearance/componentDefaults";
import { COMPONENT_INSPECTOR_FIELDS } from "../../appearance/ComponentPropsInspector";
import { translateFor, type PlainMessageKey } from "../../i18n/locale";

describe("searchable select", () => {
  const options: SelectOption[] = [
    { value: "fabric", label: "Fabric 1.21", keywords: "lightweight" },
    { value: "forge", label: "Forge 1.20", disabled: true },
    { value: "vanilla", label: "Vanilla 1.21", description: "No mods" },
  ];
  it("matches labels, values and metadata without changing the selected identity", () => {
    expect(filterSelectOptions(options, "FAB 1.21", DROPDOWN_DEFAULTS).map((o) => o.value)).toEqual(
      ["fabric"],
    );
    expect(filterSelectOptions(options, "lightweight", DROPDOWN_DEFAULTS)).toEqual([options[0]]);
    expect(filterSelectOptions(options, "no mods", DROPDOWN_DEFAULTS)).toEqual([options[2]]);
    expect(
      filterSelectOptions(options, "FAB", { ...DROPDOWN_DEFAULTS, caseSensitive: true }),
    ).toEqual([]);
    expect(
      filterSelectOptions(options, "abric", { ...DROPDOWN_DEFAULTS, searchMatch: "starts-with" }),
    ).toEqual([]);
  });
  it("skips disabled options and respects navigation boundaries", () => {
    expect(nextSelectIndex(options, 0, 1, true)).toBe(2);
    expect(nextSelectIndex(options, 2, 1, true)).toBe(0);
    expect(nextSelectIndex(options, 0, -1, false)).toBe(0);
    expect(
      nextSelectIndex(
        options.map((option) => ({ ...option, disabled: true })),
        0,
        1,
        true,
      ),
    ).toBe(-1);
    expect(nextSelectIndex([], -1, 1, true)).toBe(-1);
  });
  it("defaults to a plain dropdown and preserves explicit search preferences", () => {
    expect(normalizeExtendedComponentValues("dropdown", {}, false)).toMatchObject({
      searchEnabled: false,
    });
    expect(normalizeExtendedComponentValues("dropdown", { searchEnabled: true }, true)).toEqual({
      searchEnabled: true,
    });
  });
});

describe("text field contracts", () => {
  it("does not serialize entered values or password defaults into appearance metadata", () => {
    const html = renderToStaticMarkup(
      <TextField type="password" value="private-value" defaultValue="private-default" readOnly />,
    );
    const metadata = html.match(/data-appearance-component-props="([^"]*)"/)?.[1];
    expect(metadata).toBeDefined();
    expect(metadata).not.toContain("private-value");
    expect(metadata).not.toContain("private-default");
  });
  it("keeps a screen's character limit when a profile requests a larger limit", () => {
    const html = renderToStaticMarkup(<TextField maxLength={5} settings={{ maxLength: 100 }} />);
    expect(html).toContain('maxLength="5"');
  });
});

describe("progress display", () => {
  it("clamps actual task values, handles unknown totals, and never invents invalid ARIA ranges", () => {
    expect(progressMetrics(150, 0, 100)).toMatchObject({ value: 100, percent: 100 });
    expect(progressMetrics(20, 10, 30).percent).toBe(50);
    expect(progressMetrics(null, 0, 0)).toMatchObject({ determinate: false, min: 0, max: 1 });
    expect(progressMetrics(NaN, 0, 100).determinate).toBe(false);
    const html = renderToStaticMarkup(<ProgressBar value={null} label="Task" />);
    expect(html).not.toContain("aria-valuenow");
  });
  it("filters marker ticks without changing live progress", () => {
    expect(progressTicks({ tickMode: "custom", customTicks: [50, -1, 25, 50, NaN, 200] })).toEqual([
      25, 50,
    ]);
    const html = renderToStaticMarkup(
      <ProgressBar value={30} settings={{ defaultValue: 80, showDefaultMarker: true }} />,
    );
    expect(html).toContain('aria-valuenow="30"');
    expect(html).toContain("left:80%");
  });
});

describe("persisted component settings", () => {
  it.each(["textfield", "dropdown", "progressbar"] as const)(
    "round-trips %s settings through an appearance profile",
    (kind) => {
      const props = normalizeExtendedComponentValues(kind, {}, false);
      const profile = normalizeAppearanceProfile({
        customized: true,
        elementOverrides: [
          {
            id: `element-${kind}`,
            label: kind,
            kind,
            path: [{ tag: "div", index: 0 }],
            component: { kind, props },
            componentSettings: { kind, settings: { showLabel: false } },
          },
        ],
      });
      expect(profile.elementOverrides[0]).toMatchObject({
        component: { kind },
        componentSettings: { kind, settings: { showLabel: false } },
      });
      expect(
        normalizeAppearanceProfile(JSON.parse(JSON.stringify(profile))).elementOverrides,
      ).toEqual(profile.elementOverrides);
    },
  );
  it("sanitizes imported numbers, modes, ticks and partial overrides", () => {
    expect(
      normalizeExtendedComponentValues(
        "progressbar",
        { precision: 99, variant: "unknown", customTicks: [-5, 25, 25, 120, "bad"] },
        true,
      ),
    ).toEqual({ precision: 3, variant: "line", customTicks: [0, 25, 100] });
    expect(normalizeExtendedComponentValues("textfield", { height: Infinity }, true)).toEqual({
      height: 0,
    });
  });
  it("has localized labels and options for every inspector setting", () => {
    for (const fields of Object.values(COMPONENT_INSPECTOR_FIELDS))
      for (const field of fields) {
        for (const locale of ["ru", "en"] as const) {
          const key = `components.settings.${field.key}` as PlainMessageKey;
          expect(translateFor(locale, key)).not.toBe(key);
          for (const option of field.choices ?? []) {
            const optionKey = `components.option.${option}` as PlainMessageKey;
            expect(translateFor(locale, optionKey)).not.toBe(optionKey);
          }
        }
      }
  });
});

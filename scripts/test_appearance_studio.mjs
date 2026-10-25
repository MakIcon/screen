/* global window, document */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

export async function testAppearanceStudio(browser, origin) {
  const page = await browser.newPage({ viewport: { width: 640, height: 760 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("screenlauncher-language", "en");
    const callbacks = new Map();
    const listeners = new Map();
    let nextId = 1;
    window.studioQA = {
      events: [],
      emit(event, payload) {
        for (const [id, listener] of listeners) {
          if (listener.event === event) callbacks.get(listener.handler)?.({ event, payload, id });
        }
      },
    };
    window.__TAURI_INTERNALS__ = {
      metadata: {
        currentWindow: { label: "appearance-studio" },
        currentWebview: { label: "appearance-studio" },
      },
      transformCallback(callback) {
        const id = nextId++;
        callbacks.set(id, callback);
        return id;
      },
      unregisterCallback: (id) => callbacks.delete(id),
      async invoke(command, args) {
        if (command === "plugin:event|listen") {
          const id = nextId++;
          listeners.set(id, args);
          return id;
        }
        if (command === "plugin:event|unlisten") listeners.delete(args.eventId);
        if (command === "plugin:event|emit") window.studioQA.events.push(args);
        return null;
      },
    };
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: (_, id) => listeners.delete(id),
    };
  });
  const pick = async (kind) => {
    await page.evaluate(async (componentKind) => {
      const defaults = await import("/src/appearance/componentDefaults.ts");
      const props =
        componentKind === "slider"
          ? {
              label: "RAM",
              min: 1,
              max: 16,
              systemMax: 16,
              maxMode: "system",
              constraint: "system-ram",
              step: 1,
              defaultValue: 8,
              showHeader: true,
              showValue: true,
              valueEditable: true,
              keyboardEnabled: true,
              showDefaultMarker: true,
              defaultMarkerMagnetic: true,
              tickMode: "every",
              customTicks: [],
            }
          : defaults[
              {
                dropdown: "DROPDOWN_DEFAULTS",
                textfield: "TEXT_FIELD_DEFAULTS",
                progressbar: "PROGRESS_BAR_DEFAULTS",
                button: "BUTTON_DEFAULTS",
                badge: "BADGE_DEFAULTS",
              }[componentKind]
            ];
      if (!props) throw new Error(`Missing defaults for ${componentKind}`);
      window.studioQA.emit("appearance-element-picked", {
        id: `qa-${componentKind}`,
        label: `BUILD SETTINGS / ${componentKind.toUpperCase()} / A LONG COMPONENT LABEL`,
        kind: componentKind,
        tab: "shaders",
        path: [{ tag: "div", index: 0 }],
        component: { kind: componentKind, props },
      });
    }, kind);
  };
  try {
    await page.goto(`${origin}/?window=appearance`);
    const nav = page.locator(".appearance-studio-categories");
    const controls = page.locator(".appearance-studio-controls");
    await nav.getByRole("button", { name: /SELECT SETTINGS/ }).click();
    await controls.getByRole("button", { name: "START ELEMENT PICKER →" }).click();
    await pick("dropdown");
    assert.equal(
      await nav.getByRole("button", { name: /SELECT SETTINGS/ }).getAttribute("aria-current"),
      "step",
    );
    assert.equal(await page.locator(".appearance-interaction-state").count(), 0);
    assert.equal(await controls.locator(".canvas-ui-actions").count(), 0);
    await controls.getByRole("button", { name: "SEARCH IN OPTIONS", exact: true }).click();
    assert.equal(await page.getByRole("combobox").count(), 0);
    await page.getByRole("option", { name: "ON", exact: true }).click();
    assert.equal(
      await controls
        .getByRole("button", { name: "SEARCH IN OPTIONS", exact: true })
        .getAttribute("aria-expanded"),
      "false",
      "a component setting closes its dropdown after selection",
    );
    assert.equal(await page.getByRole("listbox").count(), 0);
    await page.waitForFunction(() =>
      window.studioQA.events.some(
        ({ event, payload }) =>
          event === "appearance-element-preview" &&
          payload.elementOverrides.some(
            (item) => item.id === "qa-dropdown" && item.componentSettings.settings.searchEnabled,
          ),
      ),
    );
    await nav.getByRole("button", { name: /PICK ELEMENT/ }).click();
    assert.equal(
      await controls.getByRole("button", { name: "SEARCH IN OPTIONS", exact: true }).count(),
      0,
    );
    assert.equal(await controls.getByRole("button", { name: /CANVAS UI/ }).count(), 0);
    assert.equal(await nav.getByRole("button", { name: /CANVAS UI/ }).count(), 1);
    await page
      .locator(".appearance-interaction-state")
      .getByRole("button", { name: "HOVER", exact: true })
      .click();
    await nav.getByRole("button", { name: /SELECT SETTINGS/ }).click();
    await page.waitForFunction(() => {
      const selections = window.studioQA.events.filter(
        ({ event }) => event === "appearance-element-selection",
      );
      return selections.at(-1)?.payload.previewState === "normal";
    });
    await controls.getByRole("button", { name: "SEARCH IN OPTIONS", exact: true }).click();
    assert.equal(
      await page.getByRole("option", { name: "ON", exact: true }).getAttribute("aria-selected"),
      "true",
    );
    await page.keyboard.press("Escape");

    for (const kind of ["dropdown", "textfield", "progressbar", "button", "badge", "slider"]) {
      await pick(kind);
      await controls
        .locator(".appearance-element-summary strong")
        .filter({ hasText: kind.toUpperCase() })
        .waitFor();
      for (const width of [560, 640, 900]) {
        await page.setViewportSize({ width, height: 760 });
        const layout = await page.evaluate(() => {
          const content = document.querySelector(".appearance-studio-controls-scroll .csa-content");
          const summary = document
            .querySelector(".appearance-element-summary")
            .getBoundingClientRect();
          const section = document
            .querySelector(".appearance-component-settings .studio-section")
            .getBoundingClientRect();
          return {
            overflow: content.scrollWidth - content.clientWidth,
            gap: section.top - summary.bottom,
            aligned: Math.abs(section.left - summary.left),
            rangeHeaders: [...document.querySelectorAll(".studio-range-field-heading")].every(
              (heading) => {
                const label = heading.firstElementChild.getBoundingClientRect();
                const value = heading.lastElementChild.getBoundingClientRect();
                return label.right <= value.left;
              },
            ),
          };
        });
        assert.ok(layout.overflow <= 1, `${kind}, ${width}px: no horizontal overflow`);
        assert.equal(layout.aligned, 0);
        assert.equal(layout.gap, 12);
        assert.equal(layout.rangeHeaders, true);
      }
    }
    const maximum = controls.getByRole("textbox", {
      name: "MAX · SYSTEM RAM value",
      exact: true,
    });
    assert.equal(
      await maximum.isDisabled(),
      true,
      "RAM limits remain protected after moving settings",
    );
    const showValue = controls.getByRole("button", { name: "SHOW VALUE", exact: true });
    for (const value of ["OFF", "ON", "ON"]) {
      await showValue.click();
      await page.getByRole("option", { name: value, exact: true }).click();
      assert.equal(await showValue.getAttribute("aria-expanded"), "false");
      assert.equal(await page.getByRole("listbox").count(), 0);
      assert.equal(await showValue.locator(".inline-dropdown-value").textContent(), value);
    }
    await showValue.click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    assert.equal(await showValue.getAttribute("aria-expanded"), "false");
    assert.equal(await showValue.locator(".inline-dropdown-value").textContent(), "OFF");
    await page.setViewportSize({ width: 640, height: 760 });
    await pick("dropdown");
    if (process.env.STUDIO_SCREENSHOT_PATH) {
      await fs.mkdir(path.dirname(path.resolve(process.env.STUDIO_SCREENSHOT_PATH)), {
        recursive: true,
      });
      await page.screenshot({ path: process.env.STUDIO_SCREENSHOT_PATH });
    }
    assert.deepEqual(errors, []);
    console.log(
      "PASS: Studio settings navigation, picker, live search preference, separate visual controls and alignment at 560/640/900px.",
    );
  } finally {
    await page.close();
  }
}

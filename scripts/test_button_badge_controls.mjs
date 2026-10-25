/* global document, window, PointerEvent, getComputedStyle */
import assert from "node:assert/strict";

export async function testButtonsAndBadges(page) {
  const action = page.locator("#button-example .element-button");
  assert.equal(await action.evaluate((node) => getComputedStyle(node).fontSize), "11px");
  assert.equal(
    await action.evaluate(
      (node) =>
        window.controlsQA.resolveElementTextTarget(node, {
          textTarget: { path: [0], original: "Install build" },
        })?.data,
    ),
    "Install build",
    "old text profiles survive the new button wrappers",
  );
  const width = await action.evaluate((node) => node.getBoundingClientRect().width);
  await action.click();
  assert.equal(await action.isDisabled(), true);
  assert.equal(await action.getAttribute("aria-busy"), "true");
  assert.equal(await action.getAttribute("aria-label"), "Installing build");
  assert.equal(await action.evaluate((node) => node.getBoundingClientRect().width), width);
  await action.evaluate((node) => node.click());
  assert.equal(
    await page.locator("#button-clicks").textContent(),
    "1",
    "loading blocks repeated actions",
  );
  await page.getByRole("button", { name: "Finish loading", exact: true }).click();
  assert.equal(await action.isDisabled(), false);
  assert.equal(await action.getAttribute("aria-busy"), null);
  assert.equal(await action.evaluate((node) => node.getBoundingClientRect().width), width);

  const icon = page.getByRole("button", { name: "Open folder", exact: true });
  await icon.focus();
  await page.keyboard.press("Space");
  assert.equal(await page.locator("#icon-clicks").textContent(), "1");
  assert.equal(await icon.locator('[aria-hidden="true"] svg').count(), 1);
  await page.getByRole("button", { name: "Default action", exact: true }).click();
  assert.equal(
    await page.locator("#form-submits").textContent(),
    "0",
    "buttons do not submit forms by default",
  );
  await page.getByRole("button", { name: "Submit action", exact: true }).click();
  assert.equal(await page.locator("#form-submits").textContent(), "1");

  const status = page.locator("#badge-example .element-badge");
  const runningColor = await status.evaluate((node) => getComputedStyle(node).color);
  await page.getByRole("button", { name: "Switch status", exact: true }).click();
  assert.equal(await status.textContent(), "Stopped");
  assert.equal(await status.getAttribute("data-tone"), "neutral");
  assert.notEqual(await status.evaluate((node) => getComputedStyle(node).color), runningColor);
  await page.getByRole("button", { name: "Switch status", exact: true }).click();
  assert.equal(await status.textContent(), "Running");
  assert.equal(
    await status.getAttribute("role"),
    null,
    "ordinary chips do not create noisy live regions",
  );
  assert.equal(await page.getByRole("status").filter({ hasText: "Announced status" }).count(), 1);
  assert.equal(await page.locator("#nested-badge button, #nested-badge [tabindex]").count(), 0);

  for (const [selector, expected] of [
    ["#button-example .element-button-icon svg", "button"],
    ["#icon-button-example .element-button-icon svg", "button"],
    ["#badge-example .element-badge-dot", "badge"],
  ]) {
    assert.equal(
      await page.evaluate(
        async ({ selector }) => {
          return await new Promise((resolve) => {
            window.controlsQA.beginElementPicker(document.querySelector("#fixture"), (target) =>
              resolve(target.component?.kind),
            );
            document
              .querySelector(selector)
              .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
          });
        },
        { selector },
      ),
      expected,
      "picking nested icons/dots selects the component",
    );
    await page.waitForTimeout(550);
  }

  await page.getByRole("button", { name: "Inspect button", exact: true }).click();
  await page.getByLabel("ПОДПИСЬ", { exact: true }).fill("Custom action");
  await page.getByRole("button", { name: "СТИЛЬ КНОПКИ", exact: true }).click();
  await page.getByRole("option", { name: "ОПАСНОЕ ДЕЙСТВИЕ", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector("#button-example button").dataset.variant === "danger",
  );
  assert.equal(await action.textContent(), "Custom action");
  assert.equal(await action.evaluate((node) => getComputedStyle(node).color), "rgb(194, 65, 12)");
  await page.getByRole("button", { name: "РАЗМЕР", exact: true }).click();
  await page.getByRole("option", { name: "БОЛЬШОЙ", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector("#button-example button").getBoundingClientRect().height === 52,
  );

  await page.getByRole("button", { name: "Inspect icon button", exact: true }).click();
  await page.getByLabel("ПОДПИСЬ", { exact: true }).fill("Custom folder action");
  assert.equal(
    await page.getByRole("button", { name: "ПОКАЗЫВАТЬ ИКОНКУ", exact: true }).count(),
    0,
  );
  const renamedIcon = page.getByRole("button", { name: "Custom folder action", exact: true });
  assert.equal(
    await renamedIcon.locator("svg").isVisible(),
    true,
    "an icon-only control never becomes blank",
  );

  await page.getByRole("button", { name: "Inspect badge", exact: true }).click();
  await page.getByRole("button", { name: "ЦВЕТОВОЙ ТОН", exact: true }).click();
  await page.getByRole("option", { name: "ПРЕДУПРЕЖДЕНИЕ", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector("#badge-example .element-badge").dataset.tone === "warning",
  );

  const saved = await page.evaluate(() => {
    const root = document.querySelector("#fixture");
    const elements = ["#button-example", "#icon-button-example", "#badge-example"].map(
      (selector) => {
        const node = document.querySelector(`${selector} [data-appearance-component]`);
        const target = window.controlsQA.createElementTarget(root, node);
        return {
          ...target,
          style: {},
          componentSettings: {
            kind: target.component.kind,
            settings: JSON.parse(node.dataset.appearanceComponentSettings),
          },
        };
      },
    );
    return JSON.stringify(
      window.controlsQA.normalizeAppearanceProfile({
        customized: true,
        elementOverrides: elements,
      }),
    );
  });
  await page.reload();
  await page.getByRole("heading", { name: "Launcher controls" }).waitFor();
  await page.evaluate((serialized) => {
    const profile = window.controlsQA.normalizeAppearanceProfile(JSON.parse(serialized));
    window.controlsQA.applyElementAppearanceOverrides(
      document.querySelector("#fixture"),
      profile.elementOverrides,
    );
  }, saved);
  await page.waitForFunction(
    () => document.querySelector("#button-example button").dataset.variant === "danger",
  );
  assert.equal(await action.textContent(), "Custom action");
  assert.equal(await action.isEnabled(), true);
  assert.equal(await action.evaluate((node) => node.getBoundingClientRect().height), 52);
  assert.equal(
    await page.getByRole("button", { name: "Custom folder action", exact: true }).count(),
    1,
  );
  assert.equal(await status.getAttribute("data-tone"), "warning");
  await page.getByRole("button", { name: "Switch status", exact: true }).click();
  assert.equal(
    await status.textContent(),
    "Stopped",
    "a saved style does not freeze the live status label",
  );

  await page.evaluate(() =>
    window.controlsQA.applyElementAppearanceOverrides(document.querySelector("#fixture"), []),
  );
  await page.waitForFunction(
    () => document.querySelector("#button-example button").dataset.variant === "primary",
  );
  assert.equal(await action.textContent(), "Install build");
  assert.equal(await page.getByRole("button", { name: "Open folder", exact: true }).count(), 1);
  assert.equal(await status.getAttribute("data-tone"), "neutral");
  await page.getByRole("button", { name: "Switch status", exact: true }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page
      .locator(".element-button-spinner")
      .first()
      .evaluate((node) => getComputedStyle(node).animationName),
    "none",
  );
  assert.equal(
    await status
      .locator(".element-badge-dot")
      .evaluate((node) => getComputedStyle(node).animationName),
    "none",
  );
  for (const theme of ["light", "dark", "void"]) {
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, theme);
    assert.notEqual(
      await action.evaluate((node) => getComputedStyle(node).color),
      await action.evaluate((node) => getComputedStyle(node).backgroundColor),
    );
  }
  await page.evaluate(() => {
    delete document.documentElement.dataset.theme;
  });
  await page.addStyleTag({ url: "/src/styles/appearance.css?direct" });
  await page.evaluate(() => {
    document.documentElement.dataset.appearanceCustom = "true";
    document.documentElement.style.setProperty("--ui-radius", "4px");
    document.querySelector("#fixture").classList.add("gallery-root");
    document.querySelector("#button-example button").dataset.appearanceComponentSettings =
      JSON.stringify({ borderRadius: 14 });
  });
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector("#button-example button")).borderRadius === "14px",
  );
  await page.evaluate(() => {
    delete document.querySelector("#button-example button").dataset.appearanceComponentSettings;
  });
  await page.waitForFunction(
    () => getComputedStyle(document.querySelector("#button-example button")).borderRadius === "4px",
  );
}

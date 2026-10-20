import assert from "node:assert/strict";
import test from "node:test";
import { findUnlocalizedMetadata, findUnlocalizedUi } from "./check_localization.mjs";

test("detects literal labels, tooltips, and conditional captions", () => {
  const source =
    '<><button title="Delete build">INSTALL</button><span>{busy ? "Starting game" : tr("play")}</span><p>{`Downloaded ${count} files`}</p></>';
  assert.equal(findUnlocalizedUi(source).length, 4);
});

test("allows translations, metadata lookup, user content, technical terms, and IDs", () => {
  const source =
    '<><button aria-label={tr("remove")}>{copy("BACKGROUND")}</button><p>{userText}</p><span>Java</span><div className="panel title"/><span>{kind === "linear" ? tr("linear") : label}</span></>';
  assert.deepEqual(findUnlocalizedUi(source), []);
});

test("checks Russian literals as well as English and ignores code examples", () => {
  assert.equal(findUnlocalizedUi("<button>Сохранить</button>").length, 1);
  assert.deepEqual(findUnlocalizedUi("<code>%build_name%</code>"), []);
});

test("requires dictionary coverage for editor options and GPU control labels", () => {
  const labels = new Set(["BACKGROUND"]);
  assert.equal(
    findUnlocalizedMetadata('const a = [{ id: "new", label: "NEW EFFECT" }]', labels).length,
    1,
  );
  assert.equal(
    findUnlocalizedMetadata('const a = [{ id: "background", label: "BACKGROUND" }]', labels).length,
    0,
  );
  assert.equal(
    findUnlocalizedMetadata(
      'r("newParam", "NEW PARAMETER", 1, 0, 2, 1)',
      labels,
      "canvasUiCatalog.ts",
    ).length,
    1,
  );
});

import React, { useRef, useState, useCallback, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { CanvasUiElementEffects } from "/src/appearance/CanvasUiElementEffects";
import { CanvasUiLauncher } from "/src/appearance/CanvasUiLauncher";
import { useMainAppearanceRuntime } from "/src/appearance/useMainAppearanceRuntime";
import { createDefaultAppearance, applyAppearanceToElement } from "/src/appearance/profile";
import { createDefaultCanvasUi } from "/src/appearance/canvasUi";
import { createElementTarget } from "/src/appearance/elementOverrides";
import { CustomScrollArea } from "/src/components/layout/CustomScrollArea";
import "/src/App.css";
mockIPC(() => null, { shouldMockEvents: true });
window.qa = { styles: 0, clones: 0, longTasks: [], frames: [], paint: 0 };
const computed = window.getComputedStyle;
window.getComputedStyle = (...args) => {
  window.qa.styles++;
  return computed(...args);
};
const clone = Node.prototype.cloneNode;
Node.prototype.cloneNode = function (...args) {
  window.qa.clones++;
  return clone.apply(this, args);
};
new PerformanceObserver((list) =>
  window.qa.longTasks.push(...list.getEntries().map((e) => e.duration)),
).observe({ type: "longtask", buffered: true });
let last = 0;
function tick(t) {
  if (last) window.qa.frames.push(t - last);
  last = t;
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
const defaults = createDefaultAppearance("light", true);
applyAppearanceToElement(document.documentElement, defaults);
const items = Array.from({ length: 24 }, (_, i) => i);
function Card({ i }) {
  return (
    <article className="mod-card" id={i === 0 ? "modcard" : undefined}>
      <div className="mod-card-head">
        <div className="mod-title-row">
          <div style={{ width: 40, height: 40, background: i % 2 ? "#5eac55" : "#d9c8a8" }} />
          <h3>
            {i % 2 ? "Sodium" : "Fabric API"} {i}
          </h3>
          <span className="mod-category">FABRIC</span>
        </div>
        <button>REMOVE</button>
        <button>UPDATE</button>
      </div>
      <p>Lightweight library and performance improvements for Minecraft mods and tools.</p>
      <small>BY MOD AUTHOR · 287,178,381 DOWNLOADS · 37,187 FOLLOWS</small>
    </article>
  );
}
function App() {
  const rootRef = useRef(null);
  const [target, setTarget] = useState("current"),
    [effect, setEffect] = useState("glass"),
    [global, setGlobal] = useState(false),
    [appearance, setAppearance] = useState(defaults);
  const noop = useCallback(() => {}, []);
  useLayoutEffect(() => {
    const element = document.getElementById(target);
    if (!element) return;
    const picked = createElementTarget(rootRef.current, element, "mods");
    setAppearance({
      ...defaults,
      canvasUi: { ...createDefaultCanvasUi(), enabled: global, effect: "liquid" },
      elementOverrides: [
        { ...picked, style: {}, canvasUi: { ...createDefaultCanvasUi(), enabled: true, effect } },
      ],
    });
  }, [target, effect, global]);
  const overrides = useMainAppearanceRuntime({
    rootRef,
    appearance,
    activeTab: "mods",
    onAnimationPreview: noop,
    onRevealTarget: noop,
    onDrawingCursor: noop,
  });
  return (
    <>
      <div style={{ position: "fixed", zIndex: 1000, right: 10, top: 8, display: "flex", gap: 12 }}>
        <select aria-label="Target" value={target} onChange={(e) => setTarget(e.target.value)}>
          {["current", "main", "sidebar", "profile", "modcard"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <select aria-label="Effect" value={effect} onChange={(e) => setEffect(e.target.value)}>
          {["glass", "bubble", "clouds", "liquid", "ripple"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <label>
          Global
          <input type="checkbox" checked={global} onChange={(e) => setGlobal(e.target.checked)} />
        </label>
      </div>
      <CanvasUiLauncher appearance={appearance}>
        <div ref={rootRef} className="gallery-root ready" style={{ width: "100%", height: "100%" }}>
          <div className="ui-container">
            <header className="gallery-header">ARCHIVE // MINECRAFT LAUNCHER</header>
            <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
              <aside
                id="sidebar"
                className="sidebar"
                style={{
                  width: 180,
                  padding: 24,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <strong>
                  PLAYER
                  <br />
                  NEWBUILDS
                </strong>
                <nav style={{ display: "grid", gap: 28 }}>
                  {["OVERVIEW", "BUILDS", "MODRINTH", "PACKS", "SHADERS", "SETTINGS"].map((x) => (
                    <button key={x}>{x}</button>
                  ))}
                </nav>
              </aside>
              <main id="main" className="main-stage no-right-panel">
                <div className="content-wrap" style={{ minHeight: 0, gap: 18 }}>
                  <div className="panel-card">
                    <span className="panel-label">MODRINTH SEARCH</span>
                    <input placeholder="Search compatible mods…" />
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.1fr 1fr",
                      minHeight: 0,
                      flex: 1,
                      gap: 18,
                    }}
                  >
                    <section
                      className="panel-card"
                      style={{ display: "flex", flexDirection: "column", minHeight: 0 }}
                    >
                      <span className="panel-label">DISCOVER / INSTALL</span>
                      <CustomScrollArea style={{ flex: 1 }}>
                        {items.map((i) => (
                          <Card key={i} i={i} />
                        ))}
                      </CustomScrollArea>
                    </section>
                    <section
                      id="current"
                      className="panel-card"
                      style={{ display: "flex", flexDirection: "column", minHeight: 0 }}
                    >
                      <span className="panel-label">CURRENT TARGET</span>
                      <p>MODDED BUILD</p>
                      <h3>NEWBUILDS</h3>
                      <hr />
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <p>
                          TARGET VERSION
                          <br />
                          26.1.2
                        </p>
                        <p>
                          LOADER
                          <br />
                          Fabric
                        </p>
                      </div>
                      <span className="panel-label">INSTALLED MODS · 21</span>
                      <CustomScrollArea style={{ flex: 1 }}>
                        {items.slice(0, 21).map((i) => (
                          <article className="mod-card" key={i}>
                            <div className="mod-title-row">
                              <div style={{ width: 32, height: 32, background: "#96ad6b" }} />
                              <strong>Entity Texture Features {i}</strong>
                              <span className="mod-category">MODRINTH</span>
                            </div>
                            <small>7.2.6-fabric-1.21.11</small>
                          </article>
                        ))}
                      </CustomScrollArea>
                    </section>
                  </div>
                </div>
              </main>
            </div>
            <footer style={{ height: 60, padding: 20, borderTop: "1px solid var(--line)" }}>
              SCREENLAUNCHER / MODRINTH
            </footer>
          </div>
          <section
            id="profile"
            className="panel-card"
            style={{
              position: "absolute",
              left: 770,
              top: 245,
              bottom: 90,
              width: 430,
              display: target === "profile" ? "block" : "none",
            }}
          >
            <span className="panel-label">ACTIVE PROFILE</span>
            <h3>NEWBUILDS</h3>
            <p>26.1.2 · RESOURCEPACKS</p>
            <p>EMPTY</p>
          </section>
        </div>
        <CanvasUiElementEffects rootRef={rootRef} overrides={overrides} activeTab="mods" />
      </CanvasUiLauncher>
    </>
  );
}
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

# Canvas UI registry sources

React WebGL engines from [Canvas UI](https://canvasui.dev/docs/mcp), installed with the shadcn MCP add command. See [LICENSE.md](LICENSE.md).

The Studio uses the exported `create<Component>()` engines to keep one live launcher tree while changing effects. Engines load on demand through `src/appearance/canvasUiLoaders.ts`. The 662 serializable visual options come from their typed options and defaults; callbacks and the Draco decoder deployment path are integration concerns.

After a registry update, regenerate the catalog with `node scripts/generate_canvas_ui_catalog.mjs <upstream-checkout>`. The optional checkout supplies the documented demo slider limits. Preserve these local fixes when updating:

- `Frost.tsx`: separate generated GLSL preprocessor definitions with newlines.
- `HexFloat.tsx`: preserve native clicks on controls when a tile maps into empty content.

Element capture regression: start Vite, then run `pnpm test:canvas-ui` with Playwright available.
If Playwright is installed separately, set `PLAYWRIGHT_MODULE` to its absolute JavaScript entry point.
The fixture covers large transparent panels, the sidebar, nested custom scroll areas, retained DOM
while moving an effect, live text/input changes, and global/local composition. It uses synthetic
launcher data and does not change the saved launcher profile.

The regression also checks that idle global/local composition performs no repeated scene capture,
standalone effects use disposable GPU buffers, and offscreen mirrors defer their updates until visible.
It checks late-loading remote icons and URL changes in local and global Displacement GPU output.
Remote images must load with `crossOrigin="anonymous"` (and a CORS-enabled server); HTML-in-canvas
silently omits ordinary cross-origin images, even when the DOM image loaded successfully. Set
`crossOrigin` before `src` for images also drawn into 2D canvases to keep those canvases readable.
Set `CANVAS_UI_BROWSER_PATH` to an installed Chromium executable if Playwright cannot find Edge.

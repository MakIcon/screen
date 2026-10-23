# Canvas UI registry sources

React WebGL engines from [Canvas UI](https://canvasui.dev/docs/mcp), installed with the shadcn MCP add command. See [LICENSE.md](LICENSE.md).

The Studio uses the exported `create<Component>()` engines to keep one live launcher tree while changing effects. Engines load on demand through `src/appearance/canvasUiLoaders.ts`. The 662 serializable visual options come from their typed options and defaults; callbacks and the Draco decoder deployment path are integration concerns.

After a registry update, regenerate the catalog with `node scripts/generate_canvas_ui_catalog.mjs <upstream-checkout>`. The optional checkout supplies the documented demo slider limits. Preserve these local fixes when updating:

- `Frost.tsx`: separate generated GLSL preprocessor definitions with newlines.
- `HexFloat.tsx`: preserve native clicks on controls when a tile maps into empty content.

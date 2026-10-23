import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/*.local/**",
      "**/dist/**",
      "dist-extensions/**",
      "dist-release/**",
      "src-tauri/**",
      "**/node_modules/**",
      // Historical reproductions and captured sources, not maintained runtime code.
      "reports/**",
      "extensions/mineflayer-bot/pathfinding",
      "extensions/mineflayer-bot/pathfinder.cjs",
      "extensions/mineflayer-bot/mineflayer-fabric.cjs",
      "extensions/mineflayer-bot/vendor/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Registry sources keep upstream's optional-capture and asset-loader code.
    files: ["src/components/canvasui/*.tsx"],
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-useless-assignment": "off",
    },
  },
  {
    files: ["extensions/**/*.{js,mjs,cjs}", "scripts/**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      // The rules that actually catch bugs — the React hooks contract.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // tsconfig already enforces unused locals; keep eslint's version aligned
      // and let intentionally-unused names be prefixed with `_`.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // This codebase deliberately uses `any` for a few Tauri event payloads.
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);

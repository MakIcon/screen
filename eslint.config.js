import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "dist-extensions",
      "src-tauri",
      "node_modules",
      // Source-copied third-party registry components are checked by TypeScript
      // and kept byte-for-byte close to upstream for easier future refreshes.
      "src/components/canvasui",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["extensions/**/*.{js,mjs,cjs}"],
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

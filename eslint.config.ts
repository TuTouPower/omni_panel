import { defineConfig } from "eslint/config";
import importX from "eslint-plugin-import-x";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

import type { ESLint } from "eslint";

export default defineConfig(
    ...tseslint.configs.strictTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                projectService: {
                    allowDefaultProject: ["scripts/*.mjs", "tests/e2e/fixtures/*.mjs"],
                },
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
    {
        plugins: {
            "react-hooks": reactHooks as ESLint.Plugin,
        },
        rules: {
            "react-hooks/rules-of-hooks": "error",
            "react-hooks/exhaustive-deps": "error",
        },
    },
    {
        plugins: {
            "import-x": importX,
        },
        rules: {
            "import-x/no-cycle": "error",
        },
    },
    {
        rules: {
            "@typescript-eslint/no-explicit-any": "error",
            "@typescript-eslint/no-unsafe-assignment": "error",
            "@typescript-eslint/no-unsafe-member-access": "error",
            "@typescript-eslint/no-unsafe-call": "error",
            "@typescript-eslint/no-floating-promises": "error",
            "@typescript-eslint/await-thenable": "error",
            "@typescript-eslint/switch-exhaustiveness-check": "error",
            "@typescript-eslint/consistent-type-imports": "error",
        },
    },
    {
        ignores: [
            "dist/",
            "out/",
            ".vite/",
            "node_modules/",
            ".dependency-cruiser.cjs",
            "tests/e2e/fixtures/*.mjs",
            "scripts/e2e/*.mjs",
        ],
    },
);

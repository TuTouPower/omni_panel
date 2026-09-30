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
        // t536 AC-001：应用退出唯一入口是 quit_source 漏斗（记录来源 + trace），
        // 禁止绕过；新增 app.quit()/app.exit() 出口必须先登记 QUIT_SOURCES。
        files: ["src/**/*.ts"],
        ignores: ["src/main/core/quit_source.ts"],
        rules: {
            "no-restricted-properties": [
                "error",
                {
                    object: "app",
                    property: "quit",
                    message:
                        "app.quit() 必须经 src/main/core/quit_source.ts 的 request_app_quit 记录退出来源（t536 AC-001）。",
                },
                {
                    object: "app",
                    property: "exit",
                    message:
                        "app.exit() 必须经 src/main/core/quit_source.ts 的 request_app_exit 记录退出来源（t536 AC-001）。",
                },
            ],
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
            "scripts/render_icon.mjs",
            "scripts/render-test-icons.mjs",
            "scripts/start-test.mjs",
            "docs/spikes/",
            "public/",
            // t299: repo_template 静态 CommonJS 工具（board.js 为 HTML 看板脚本、
            // chain_plan.js 为看板核心规划模块、test_chain_plan_cases.js 为链式
            // 规划测试数据），不在 tsconfig include，免 type-checked lint 报 not found。
            ".repo_template/scripts/repo_task/view_static/board.js",
            ".repo_template/scripts/repo_task/view_static/chain_plan.js",
            ".repo_template/tests/test_chain_plan_cases.js",
        ],
    },
);

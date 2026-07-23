# Task spec

## 背景

review_20260723_opus 构建配置：I24（`package.json:86-105,116`）11 个 ESLint 插件装了不用（仅 typescript-eslint/import-x/react-hooks 实际用），且被 knip `ignoreDependencies` 静默；I25（`package.json:124`、`electron.vite.config.ts:9`）esbuild 列入 dependencies 且 external 外部化，但无任何 import；I26（`scripts/package-and-run.ts:13`）`taskkill /f /t /im electron.exe` 通杀系统所有 electron.exe；I27（`index.html:10`）根 index.html 引用不存在的 `/src/renderer.ts`（实际入口 src/renderer/index.html）；I28 `@types/node` 未显式声明（靠 vite/vitest 传递解析）。

## 范围

- I24：lint 扩全代码（当前 `lint` 脚本 `eslint src tests scripts tests/fixtures *.ts` 缺 `connectors/` 且 `*.ts` 不含 `*.mts`）；启用未用插件的 recommended 集（security / sonarjs / unicorn / jsx-a11y / react / n / promise）；移除重复包（`@typescript-eslint/eslint-plugin` + `@typescript-eslint/parser` 已被 `typescript-eslint` 元包覆盖、`eslint-plugin-import` 已被 `eslint-plugin-import-x` 替代）；perfectionist 风格类评估是否启用；启用策略用 recommended 分批修（避免一次爆千错阻塞），knip 同步。
- I25：esbuild 移 devDependencies 或删 external 条目。
- I26：package-and-run 按路径过滤仅杀 `artifacts/win-unpacked/OmniUsage.exe`。
- I27：删除根 index.html 遗留文件。
- I28：devDependencies 显式加 `@types/node`。

## 非范围

- 不升级 ESLint / tsconfig 主版本。
- 不动 vitest 覆盖率门槛（另议）。

## 验收标准

- [ ] lint 脚本覆盖全代码（含 `connectors/`、`*.mts`），无遗漏目录。
- [ ] 7 个高价值插件（security/sonarjs/unicorn/jsx-a11y/react/n/promise）启用 recommended 集。
- [ ] 重复包移除（`@typescript-eslint/eslint-plugin`、`@typescript-eslint/parser`、`eslint-plugin-import`）。
- [ ] perfectionist 评估结论记录（启用或说明不启用理由）。
- [ ] esbuild 不在 dependencies（或 external 删除）。
- [ ] package-and-run 仅杀 OmniUsage.exe（不通杀）。
- [ ] 根 index.html 删除。
- [ ] `@types/node` 显式声明。
- [ ] `pnpm lint` 通过（或分级 warning，说明收紧计划）+ `pnpm typecheck` + `pnpm test` + `pnpm package` 全绿。

## 依赖与约束

- 移除依赖前确认无间接使用（knip 复核）。

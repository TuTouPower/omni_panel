# Task review t065（reviewer_focus: 代码）

- task：`t065_build_config_cleanup`
- spec：`docs\tasks\t065_build_config_cleanup\spec.md`
- diff_anchor：`1d85c46dab2e6f9820717de6ce69dc4f359a2161`
- target：`git diff 1d85c46dab2e6f9820717de6ce69dc4f359a2161`（相对工作区，全部改动未提交）
- round：1
- reviewed_at：2026-07-23 22:05 UTC+8

## 改动概览（核实）

- `scripts/package-and-run.ts:13`：`procs` 由 `["OmniUsage.exe","electron.exe"]` / `["OmniUsage","electron"]` 收为 `["OmniUsage.exe"]` / `["OmniUsage"]`。
- `package.json:25`：lint 脚本加 `connectors` 与 `*.mts`，与 `tsconfig.json` include 一致。
- `index.html`：整文件删除（12 行）。grep 全仓无活跃引用，仅 docs/archive 与 review 报告提及。
- `electron.vite.config.ts`、`knip.json`、eslint.config.ts：未改。

## Findings

### t065_code_f001 - I26 仍按镜像名而非路径过滤，AC 满足但偏离 spec 实现指引

- 严重度：minor
- 位置：`scripts/package-and-run.ts:13`、`scripts/package-and-run.ts:18`
- 问题：spec「范围」明确写「package-and-run **按路径过滤**仅杀 `artifacts/win-unpacked/OmniUsage.exe`」。实现把 `procs` 收为 `["OmniUsage.exe"]` 后仍走 `taskkill /f /t /im OmniUsage.exe`，即 image-name 匹配。AC「仅杀 OmniUsage.exe（不通杀）」字面满足（electron.exe 通杀已消除），但若本机同时存在另一个 `OmniUsage.exe`（例如 `make:win` 安装版与 `artifacts/win-unpacked/` 并存、另一份 clone），仍会被误杀。`wait_for_exit` 与末尾兜底 `taskkill` 同样仅按 image-name 判定（`package-and-run.ts:35`、`:58`），一致性 OK 但同样未实现「按路径」。
- 建议：若严格按 spec，改用 PowerShell `Get-Process | Where-Object { $_.Path -like '*artifacts\win-unpacked\OmniUsage.exe' } | Stop-Process -Force`；或在 spec/AC 中把「按路径过滤」放宽为「按镜像名」，记录放宽理由。

### t065_code_f002 - I24 启用 7 个插件 recommended 集：完全未实现（AC 缺失）

- 严重度：important
- 位置：`eslint.config.ts:1-72`（全文无 `eslint-plugin-security` / `sonarjs` / `unicorn` / `jsx-a11y` / `react` / `n` / `promise` 的 recommended 引入）
- 问题：spec AC「7 个高价值插件（security/sonarjs/unicorn/jsx-a11y/react/n/promise）启用 recommended 集」未实现。当前 `eslint.config.ts` 仅引入 `typescript-eslint`、`eslint-plugin-import-x`、`eslint-plugin-react-hooks`；7 插件虽装在 `package.json:97-105` 但既未 `plugins: {...}` 注册也未启用 recommended。implementer 自述「分批修」属合理策略，但本 task diff 内既无首批引入（如 unicorn/security 低噪音集），也无 spike 衔接证据（`docs/spikes/` 下无对应 spike 目录）。
- 建议：本 task 至少引入首批 recommended（建议 unicorn + security，噪音低、价值高），其余以 spike 形式拆解；或 spec 明确把 AC 改为「分批启用计划成文」。

### t065_code_f003 - I24 三个重复 eslint 包未移除（AC 缺失）

- 严重度：important
- 位置：`package.json:86-87`、`package.json:95`、`knip.json:11-13`
- 问题：spec AC「重复包移除（`@typescript-eslint/eslint-plugin`、`@typescript-eslint/parser`、`eslint-plugin-import`）」未实现。三包仍在 `devDependencies`（`package.json:86-87,95`），`knip.json:11-13` 仍在 `ignoreDependencies` 静默。`eslint.config.ts:4` 引入的是元包 `typescript-eslint`，`@typescript-eslint/eslint-plugin` 与 `@typescript-eslint/parser` 确为冗余；`eslint-plugin-import-x` 已替代 `eslint-plugin-import`。
- 建议：网络可用环境跑 `pnpm remove @typescript-eslint/eslint-plugin @typescript-eslint/parser eslint-plugin-import`，同步删 `knip.json:11-13` 三行，`pnpm lint`/`typecheck` 复测。

### t065_code_f004 - I25 esbuild 仍在 dependencies，external/knip 三处未动（AC 缺失）

- 严重度：important
- 位置：`package.json:124`、`electron.vite.config.ts:9`、`knip.json:25`
- 问题：spec AC「esbuild 不在 dependencies（或 external 删除）」未实现。`package.json:124` 仍列 `esbuild: ^0.28.0` 为 `dependencies`；`electron.vite.config.ts:9` 仍 `external: ["esbuild"]`；`knip.json:25` 仍在 `ignoreDependencies`。grep 全仓（排除 node_modules/out/dist/docs）无任何 `import "esbuild"` / `require("esbuild")`，确为死依赖。
- 建议：`pnpm remove esbuild` 同时删 `electron.vite.config.ts:9` 的 `external` 条目与 `knip.json:25` 条目；或至少把 esbuild 移到 `devDependencies` 并保留 external。

### t065_code_f005 - I28 @types/node 未显式声明（AC 缺失）

- 严重度：important
- 位置：`package.json:76-119`（`devDependencies` 无 `@types/node`）
- 问题：spec AC「`@types/node` 显式声明」未实现。当前 `@types/node@25.9.1` 仅靠 `vite` / `vitest` / `electron` 传递解析（已核实 `node_modules/@types/node`）。tsconfig 严格模式 + `noUncheckedIndexedAccess` + `useUnknownInCatchVariables` 重度依赖 `@types/node`，上游任意一依赖移除 peer 即 typecheck 崩。
- 建议：`pnpm add -D @types/node`，固定到与当前 electron/vite 兼容的版本（如 `^22` 或 `^20`，按 electron 42 对应 Node 22）。

### t065_code_f006 - perfectionist 评估结论未记录（AC 缺失）

- 严重度：minor
- 位置：无对应产物（`eslint.config.ts` 未引入；`docs/tasks/t065_build_config_cleanup/` 也无评估记录；`task.md` 未写结论）
- 问题：spec AC「perfectionist 评估结论记录（启用或说明不启用理由）」未实现。`eslint.config.ts` 未引入 perfectionist recommended；本 task 也无任何评估结论文件或在 `task.md` 追加「不启用理由」。`knip.json:16` 仍把 `eslint-plugin-perfectionist` 列为 ignoreDependencies。
- 建议：在 `task.md` 收尾报告或 spec 里写一句结论（如「perfectionist 与 pretier 冲突，暂不启用 recommended」），并据此决定是否从 `knip.json` 移除该条；或在 spike 内引入。

## 遗留裁决合理性评估（用户特别要求）

implementer 自述 4 项遗留的「需 pnpm install 网络 + 分批修」理由：

- **I25 esbuild（移 devDeps / 删 external）**：**不合理**。`pnpm remove esbuild` 与 `electron.vite.config.ts:9` 删 external 条目 + `knip.json:25` 删条目，三处都是纯文本改动，不需网络。即便要 `pnpm install` 同步 lockfile，本机 node_modules 已有 esbuild，删依赖后 lockfile 更新本地可完成（`pnpm install --offline`）。
- **I28 @types/node（显式加）**：**理由成立但本 task 可记计划**。`pnpm add -D @types/node` 确需 registry；但 task 内可写一句「在 spike/网络可用环境执行」，目前 `task.md` 收尾报告只有「遗留 spike」一行，缺衔接。
- **I24 启用 7 插件 recommended（分批修）**：**理由成立**。一次性启用确会爆大量错误，分批拆 spike 是合理工程判断。但本 task 应至少引入首批（见 f002），不能整体遗留。
- **I24 移除 3 重复 eslint 包**：**理由不成立**。`pnpm remove` 是写 package.json + lockfile 更新；本机 node_modules 已装，`pnpm install --offline` 可校验，不需在线 registry。

综上，4 项遗留中 I25 与 I24 移除重复包两项的「网络」理由不成立，本 task 可直接修。

## 已修 3 项是否到位

- **I26 taskkill 收窄**：**部分到位**。electron.exe 通杀已消（主目标达成），但未按 spec「按路径过滤」实现，见 f001。
- **I24 lint 范围扩 connectors/\*.mts**：**到位**。`package.json:25` 与 `tsconfig.json` include 对齐；`connectors/` 与根级 `*.mts` 均已纳入。
- **I27 删根 index.html**：**到位**。文件已删，全仓 grep 无活跃引用（仅 archive 文档与 review 报告提及）。

## 结论

- 本轮新发现：6 条（f001-f006，含 4 条 important）
- 总体判断：spec 9 条 AC 中 4 条完全未实现（启用 recommended、移除 3 重复包、esbuild、@types/node），1 条部分实现（taskkill 路径过滤），1 条评估结论缺失（perfectionist），仅 3 条完全到位（lint 范围、index.html、package-and-run 不通杀 electron）。implementer 将 4 项 AC 整体遗留 spike 的处置在用户裁决层或可接受，但作为 code reviewer 轴，spec AC 缺失实现 = finding，遗留裁决中「I25 与 I24 重复包」两项的「需网络」理由不成立、本 task 可直接修。

verdict: FAIL

# Spike report

## 问题

候选 A：帮助源放 `scripts/cli_help.mjs`，主进程（electron-vite 打包 `src/main`）能否 import 该外部 .mjs，使帮助文本被 bundle 进 `out/main/**`（打包 `files` 仅 `out/**` + package.json，运行时无 `scripts/`）？

## 成功判据

- 与 `src/main/index.ts` 同相对深度的 entry 能 import `scripts/*.mjs`。
- esbuild / vite（electron-vite 主进程链路同类）打包后产物**内联**标记字符串，无 runtime 再 resolve `scripts/` 路径。
- 与现有 `cli_arg_translate.mjs` / `cli_json_parse.mjs` 测试 import 路径一致可测。

## 尝试

- 临时 `scripts/_spike_cli_help_probe.mjs` 导出标记 `OMNI_SPIKE_HELP_MARKER_FROM_SCRIPTS_s029`。
- `.scratch/s029/main_like_entry.ts`：`import { CLI_HELP_TEXT } from "../../scripts/_spike_cli_help_probe.mjs"`（深度等同 `src/main/index.ts`）。
- `esbuild` bundle（platform=node, format=esm）与 `vite` SSR/lib build（rollup）各打一次。
- 探针文件与 scratch 产物实验后清理（不进生产路径）。

## 证据

- esbuild 产物（`.scratch/s029/out/esbuild_bundle.mjs`）内容为：
    `var CLI_HELP_TEXT = "OMNI_SPIKE_HELP_MARKER_FROM_SCRIPTS_s029\n";`（字符串已内联）。
- vite 产物（`.scratch/s029/out/main_like_entry.mjs`）同样内联同一标记字符串。
- 两路均无 `import ... from "..._spike_cli_help_probe.mjs"` 的 runtime 依赖。

## 结论

候选 A **可行**：主进程 import `scripts/cli_help.mjs` 时，electron-vite/rollup 会在构建期把帮助文本打进 `out/main`，打包运行时不依赖 `scripts/`。Type 面用并列 `.d.mts`（与 `cli_arg_translate.d.mts` 同模式）。launcher 运行时直接 `import` 同文件，单一真相源。

可信度：高（实测 esbuild + vite/rollup 两路内联；electron-vite main 即 vite+rollup）。

## 是否采纳

- 决定：是
- 理由：满足「单一真相源 + 打包仅 out/\*\*」；无需构建期复制/软链。
- 后续 task：t400

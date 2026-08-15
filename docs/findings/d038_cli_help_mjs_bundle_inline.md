# d038 主进程 import scripts/*.mjs 可被 electron-vite 构建期内联进 out/main

- 来源：s029 spike / t400
- 结论：`src/main` 以相对路径 `import` `scripts/*.mjs` 时，esbuild 与 vite/rollup（electron-vite main 链路）均将导出字符串**内联**进 bundle；打包 `files` 仅 `out/**` 时运行时不依赖 `scripts/` 目录存在。
- 证据：s029 探针 `scripts/_spike_cli_help_probe.mjs` + 同深度 entry `import from "../../scripts/..."`；esbuild/vite 产物均含标记字符串且无 runtime import 该路径。报告：`docs/spikes/s029_cli_help_share_source/report.md`。
- 影响：CLI 帮助单一真相源可放 `scripts/cli_help.mjs`；launcher 运行时 import，主进程构建期 bundle。Type 面并列 `.d.mts`。
- 现状：有效

# CLI 帮助单一真相源

## 摘要

launcher 与主进程共用 `scripts/cli_help.mjs` 导出的 `CLI_HELP_TEXT`。无参 / `--help` / `-h` / `help` 由 launcher 直接打印；`--cli help` 仍进主进程但打印同一常量（构建期内联进 `out/main`）。

## 行为

|入口|路径|输出|
|---|---|---|
|`omni_panel`（无参）|launcher `mode: help`|`CLI_HELP_TEXT` → stdout|
|`omni_panel --help` / `-h`|同上|同上|
|`omni_panel help`|同上（**不**注入 `--cli`）|同上|
|`omni_panel --cli help`|主进程 `command.type === "help"`|同一 `CLI_HELP_TEXT` → stdout 后 `app.exit(0)`|
|无法识别的子命令|launcher `mode: invalid`|错误行 + `CLI_HELP_TEXT` → stderr，exit 1|

统一文本须含：`--gui` 用法；子命令 serve / open / refresh-all / pause / resume / restart / quit / autostart / export；兼容说明与数据目录说明。

## 实现约束

- 真相源：`scripts/cli_help.mjs`（类型 `scripts/cli_help.d.mts`）。
- launcher：`scripts/omni_panel.mjs` 运行时 import。
- 主进程：`src/main/index.ts` import；electron-vite 构建期内联（见 d038 / s029），打包 `files` 仅 `out/**` 时运行时不依赖 `scripts/`。
- `translate_launcher_args`：`help` 子命令返回 `mode: "help"`，不转发主进程；`--cli help` 仍 `mode: "cli"`。

## 验证

- 单测：`tests/unit/scripts/cli_help.test.ts`、`launcher_arg_translate.test.ts`。
- 黑盒：launcher 四入口 stdout 字节一致；`electron . --cli help` 与 launcher 一致；`pnpm build` 后 `out/main/index.js` 含帮助正文。
- release 包四入口一致性：`[deploy]`（`pnpm make:linux` 后人工/脚本验证）。

## 来源

- t400（2026-08-16）；依赖 t399 launcher 参数翻译。

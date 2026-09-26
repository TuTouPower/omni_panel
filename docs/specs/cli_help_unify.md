# CLI 帮助单一真相源

## 摘要

`src/main/cli/help-text.ts` 导出的 `CLI_HELP_TEXT` 是帮助文本唯一真相源。用户面对的唯一入口是二进制本身：`resolve_entry` 决议 argv，终端无参 / `--help` / `-h` / `help` 在进程入口打印该常量后退出；未知子命令打印错误行 + 同一常量后 exit 1。

## 行为

|入口|决议（`src/main/cli/args.ts` `resolve_entry`）|输出|
|---|---|---|
|`omni_panel`（无参，TTY）|`kind: "help"`|`CLI_HELP_TEXT` → stdout，exit 0|
|`omni_panel --help` / `-h`|`kind: "help"`|同上|
|`omni_panel help`|`kind: "help"`|同上|
|`omni_panel`（无参，非 TTY，桌面双击）|`kind: "gui"`|启动 GUI，不打印|
|`omni_panel --gui`|`kind: "gui"`|同上|
|无法识别的子命令|`kind: "invalid"`|错误行 → stderr + `CLI_HELP_TEXT` → stdout，exit 1|
|`serve` / 控制子命令 / `export`|`kind: "cli"`|不打印帮助，走各自命令|

统一文本须含：`--gui` 用法；子命令 serve / open / refresh-all / pause / resume / restart / quit / autostart / export / help；数据目录说明。

## 实现约束

- 真相源：`src/main/cli/help-text.ts` 的 `CLI_HELP_TEXT`，经 electron-vite 打包进 `out/main`，运行时不依赖仓库内脚本文件。
- 决议与打印：`src/main/bootstrap/cli_init.ts` `bootstrap_cli_and_locks` 在进程入口执行 `resolve_entry`——help / invalid 在单实例锁与窗口创建之前打印并 `process.exit`；`parse_cli_args` 把 help 转成 `command.type: "help"` 供 `src/main/index.ts` 兜底。
- 入口重构历史：`scripts/cli_help.mjs` / `scripts/omni_panel.mjs` / `--cli` 开关已于 8198ab13 移除，全部入口统一到二进制本身（见 `docs/guides/cli-mode.md`「启动语法」）。

## 验证

- 单测：`tests/unit/main/cli/args.test.ts`（help / invalid 决议、`CLI_HELP_TEXT` 文案断言）。
- 黑盒：四个终端入口（TTY 无参 / `--help` / `-h` / `help`）stdout 字节一致；`pnpm build` 后 `out/main` 含帮助正文。
- release 包入口一致性：`[deploy]`（`pnpm make:linux` 后人工/脚本验证）。

## 来源

- t400（2026-08-16）；后续入口收敛由 8198ab13（launcher 控制逻辑迁入 `src/main/cli`）完成。

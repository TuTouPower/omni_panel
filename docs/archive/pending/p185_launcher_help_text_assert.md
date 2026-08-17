# p185 launcher 帮助文案自动断言

- 来源：t399 遗留（t399_test_f001，review Round 2 判 minor 非阻断）
- 内容：`omni_panel --help`/无参帮助文案（含 `--gui` 与全部 CLI 子命令）仍无自动断言，仅黑盒人工验证（AC-001/006 实测通过）。2026-08-16 现状核实：原方案「把 HELP_TEXT 抽成可导入常量」已实现——src/main/cli/help-text.ts:4 导出 CLI_HELP_TEXT（src/main/index.ts:17,131,136,208 引用）；translate_launcher_args 已更名 resolve_entry（src/main/cli/args.ts:187），单测层对 resolve_entry 仍只断言出口 `mode="help"` 不校验内容；全仓 tests/ 无任何 import CLI_HELP_TEXT 的内容断言，e2e cli_flow.spec.ts/cli_serve.spec.ts 亦无帮助输出断言。方案收敛：直接对 CLI_HELP_TEXT 加内容断言即可闭环。
- 处理：3178f7a7

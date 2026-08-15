# p185 launcher 帮助文案自动断言

- 来源：t399 遗留（t399_test_f001，review Round 2 判 minor 非阻断）
- 内容：`omni_panel --help`/无参帮助文案（含 `--gui` 与全部 CLI 子命令）当前无自动断言，仅黑盒人工验证（AC-001/006 实测通过）。单测层对 `translate_launcher_args` 只断言出口 `mode="help"`，不校验 HELP_TEXT 内容。若需自动化：把 HELP_TEXT 抽成可导入常量并对内容做断言，或加 e2e 校验输出文本。
- 处理：未开

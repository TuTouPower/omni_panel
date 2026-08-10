# p094 CLI 模式 import-config 回滚边界与 WSL apt 依赖清单（2026-08-09）

- 来源：t275 review Round 2 code 非阻断备注
- 内容：两处小项。(1) `import_config_file` 重复导入同一 plugin/param 且 config save 失败时，回滚会连旧 vault 值一并删除（概率极低，两态皆半初始化）；(2) `docs/guides/cli-mode.md` 未逐包枚举 Electron GUI 依赖（libgtk/libnss3 等），建议后续补 apt 包清单。
- 处理：t285

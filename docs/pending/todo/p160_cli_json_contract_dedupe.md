# p160 CliInstanceInfo 契约三处重复（.d.mts / JSDoc / omni_panel.mjs）

- 来源：t344 遗留（2026-08-13，t344_code_f002 minor）
- 内容：CliInstanceInfo 契约在 `scripts/cli_json_parse.d.mts`、`cli_json_parse.mjs` JSDoc、`omni_panel.mjs:88` 三处手写重复，字段增减时漂移风险。改进方向：单一来源（如 .d.mts 唯一，mjs JSDoc 引用或删），omni_panel.mjs 从模块导入类型。
- 处理：未开

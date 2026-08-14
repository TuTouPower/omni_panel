# p178 token_stats 配置 build_token_stats_config 读取无直接单测

- 来源：t379 遗留（test reviewer f002）
- 内容：t379 修复 tokenStats schema strip 后，AC-002 值链「build_token_stats_config 读取持久化值」半由 store 冷缓存用例间接覆盖，但 index.ts:434-442 的 build_token_stats_config 是未导出闭包、无直接断言。无独立失败模式判 minor 遗留。后续可抽导出该函数并补单测（wsl/poll 默认值 + 持久化值分支）。
- 处理：t396

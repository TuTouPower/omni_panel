# p042 auto_seed BUNDLED_PLUGIN_NAMES 与 connectors/ 实际连接器脱节（t203 审阅提示）

- 来源：t203_code review 未进表提示 3
- 内容：`auto_seed.spec.ts` 的 `BUNDLED_PLUGIN_NAMES` 仍是 7 条历史插件名，与 `connectors/` 下实际 16 个连接器脱节。断言用 `>=` 故仍通过，语义只剩「种子未清空既有配置」，靠 `.acc-row` "My Claude" 可见性断言兜底。属测试维护债，可考虑改为与 `discover_connector_definitions` 结果对齐或删去常量。
- 处理：t220

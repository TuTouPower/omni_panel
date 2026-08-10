# p034 AC4 竞态子句（更新事件 vs 进行中查询）无专门测试（2026-08-03）

- 来源：t192_test_f003（t192 Round 1，minor）
- 内容：事件触发 `loadData` 后旧查询晚到被 request_id guard 丢弃的竞态只在 filter 变更路径验证，未在事件触发路径验证。建议补「查询 in-flight 时触发更新版本事件 → 旧响应晚到不覆盖新数据」。
- 处理：t202

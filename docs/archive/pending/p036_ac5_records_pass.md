# p036 AC5 读取规模无直接测量，聚合路径误读全量 records 也能 PASS（2026-08-03）

- 来源：t192_test_f005（t192 Round 1，minor）
- 内容：AC5 用例断言 DTO 形状与 rollup 行数平坦，但若 `window_union` 因 bug 改为整窗读 records，输出仍一致照常 PASS。窗口恰为整点时可加 `EXPLAIN QUERY PLAN` 断言命中 `token_stats_hour_rollup` 且不 SCAN `token_stats_records`。
- 处理：t202

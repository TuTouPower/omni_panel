# p017 store dedupe 用例未锁行累积防护，删 `delete_stale_dup` 后测试仍绿（2026-08-01）

- 来源：t174_test_f002（review_test.md Round 2，未进处置表）
- 内容：`observation-store.test.ts` 新增用例「dedupes stale copies sharing the same observed_at」只断言查询层去重（`stale DESC` tie-breaker + ROW_NUMBER 独立保证返回 1 行），未直连断言 `delete_stale_dup_stmt` 的行数防护。推演验证：删除该删除逻辑后用例仍全绿，但连续失败会对同键同 ts 无限累积 stale 行（insert 前清理失效）。数据不丢、latest 仍唯一，属防护性覆盖缺口，非行为错误。
- 处理：t186（与 p016 合并）

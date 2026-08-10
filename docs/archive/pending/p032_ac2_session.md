# p032 AC2「未受影响聚合保持不变」无多 session 增量直测（2026-08-03）

- 来源：t192_test_f001（t192 Round 1，minor）
- 内容：增量测试全部单 session，dashboard fallback 对比在 upsert 后立即 backfill 掩盖增量期状态；若 `delete_hour_rollup_session_stmt` 丢失 session_id 谓词导致清空其它 session 行，现有测试仍绿。建议补「两 session 入库 → 增量 upsert 仅触碰其一 → 不 backfill 直接 read_rollup == oracle_rollup」。
- 处理：t202

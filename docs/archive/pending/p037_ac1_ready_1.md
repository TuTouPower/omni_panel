# p037 AC1 重启场景（ready=1 持久化 + 重启后续写）无专门测试（2026-08-03）

- 来源：t192_test_f006（t192 Round 1，minor）
- 内容：幂等测试只覆盖同进程两次 backfill；ready 标志跨 reopen 持久化、重启后 ready=1 时增量续写与 oracle 一致无用例。建议补「backfill 置 ready → close → reopen → 断言 ready 仍 true、再增量 upsert 后 read_rollup == oracle_rollup」。
- 处理：t202

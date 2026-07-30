---
tid: t167
slug: collector_records_message_id_diff
diff_anchor: "aca801d9da264cbc9d754aa0eb921b9c293b53e0"
branch: t167_collector_records_message_id_diff
---

# Task t167_collector_records_message_id_diff

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- diff_anchor: aca801d（main，含 t162-t166）。
- 方案选定：collector 内存 Set `emitted_record_keys`（key=source|env|message_id），不持久化（重启全量，之后增量）。避免 scan-state 格式变更风险。
- collector.ts：模块级 Set + record_key helper；collect() records 循环先 has 跳过，add 后 push；reset_config 清空。
- 黑盒：pnpm test 1908 全过（+3 边界测试）。
- round 1：code FAIL（1 critical），test FAIL（4 finding）。

## Review 处置

### Round 1 (2026-07-31 05:10 UTC+8)

code FAIL（1 critical）、test FAIL（4 finding）。

| finding_id     | severity  | status | rationale                                                                                | fix_ref                                                       |
| -------------- | --------- | ------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| t167_code_f001 | critical  | 已修   | 容量上限 break 前已 add key，超限 record 永久丢失；移容量判断到 add 之前，break 时不标记 | src/main/core/token-stats/collector.ts collect() records 循环 |
| t167_test_f001 | important | 已修   | 缺"完全无变化 emit 0"测试；新增 emits_nothing_when_unchanged                             | collector.test.ts                                             |
| t167_test_f002 | important | 已修   | 缺跨 source/env 同 message_id 不误去重测试；新增 does_not_dedup_across_source_env        | collector.test.ts                                             |
| t167_test_f003 | important | 已修   | 缺文件截断重建场景；新增 re_emits_after_reset（reset_config 后重发）                     | collector.test.ts                                             |
| t167_test_f004 | minor     | 已修   | record() source/env 类型用 string 宽化；改为精确联合字面量                               | collector.test.ts record() helper                             |

### Round 2 (2026-07-31 05:15 UTC+8)

code PASS / test PASS，零 finding。

## 收尾报告

### 验收标准勾选

- [x] 活跃 session jsonl 变化时 emit records ≈ 新增 message 数（已 emit 的跳过）。
- [x] scan-state 未改（Set 内存，重启全量，向后兼容）。
- [x] 单次 `collect()` records emit 量稳态降至新增量（非整 session 重发）。
- [x] WAL 增长显著下降（INSERT OR REPLACE 幂等写减少）。
- [x] 单测覆盖 diff 正确性（新增/无变化/跨 source/env/截断重建/容量上限）。

### Reviewer verdict

- Round 1 code：FAIL（f001 critical 已修）
- Round 1 test：FAIL（f001-f004 已修）
- Round 2 code：PASS
- Round 2 test：PASS

### 遗留

- 无

### 结果摘要

collector records emit 增量化：内存 Set 按 (source, env, message_id) 去重，dirty session 重 merge 后只 postMessage 新增 message_id。消除单 session 全量重发（1.2 万级 -> 新增量）。Set 不持久化，重启首次全量（与 scan-state records=[] 语义一致）。容量上限判断移到 add 前避免超限 record 永久丢失。

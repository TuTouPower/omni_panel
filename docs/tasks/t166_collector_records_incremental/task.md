---
tid: t166
slug: collector_records_incremental
diff_anchor: "<SHA>"
branch: t166_collector_records_incremental
---

# Task t166_collector_records_incremental

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 无事项时写：无

## Review 处置

**本文件本小节 = 处置表唯一落点。**

### Round 1 零 finding

两轴均 0 finding 时写：「Round 1 零 finding，未进处置表。」

### Round N (YYYY-MM-DD HH:MM UTC+8)

| finding_id | severity | status | rationale | fix_ref |
| ---------- | -------- | ------ | --------- | ------- |

## 收尾报告

### 验收标准勾选

- [ ] 活跃 session 变化时 emit records ≈ 新增 message 数。
- [ ] config 保存（tokenStats 未变）不触发 `collect()`。
- [ ] 单次 `collect()` records emit 量从 20 万降至千级。
- [ ] WAL 增长显著下降。
- [ ] 单测覆盖增量 emit 与 config 去抖。

### Reviewer verdict

- Round 1 code：PASS / FAIL
- Round 1 test：PASS / FAIL
- Round 2 code：N/A
- Round 2 test：N/A

### 遗留

- 无

### 结果摘要

（收尾时填：单次 emit 量前后对比、config 去抖命中率。）

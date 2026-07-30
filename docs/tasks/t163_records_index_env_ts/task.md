---
tid: t163
slug: records_index_env_ts
diff_anchor: "<SHA>"
branch: t163_records_index_env_ts
---

# Task t163_records_index_env_ts

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

- [ ] `token_stats_records` 存在 `(env, timestamp DESC)` 索引。
- [ ] `EXPLAIN QUERY PLAN` 典型查询走 `idx_records_env_ts`。
- [ ] migration v4 幂等，不丢数据。
- [ ] 单测覆盖 migration v4。

### Reviewer verdict

- Round 1 code：PASS / FAIL
- Round 1 test：PASS / FAIL
- Round 2 code：N/A
- Round 2 test：N/A

### 遗留

- 无

### 结果摘要

（收尾时填：EXPLAIN 前后 plan 对比。）

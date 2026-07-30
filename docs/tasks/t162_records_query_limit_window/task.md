---
tid: t162
slug: records_query_limit_window
diff_anchor: "<SHA>"
branch: t162_records_query_limit_window
---

# Task t162_records_query_limit_window

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

只记有追溯价值的进展、踩坑、中途决策、偏离 plan、关键验证；不写命令流水账。

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

- [ ] `query_records` SQL 含 `LIMIT`，且 `filters.limit` 缺省时有默认兜底（默认 5000）。
- [ ] `TokenStatsView.loadData` 向 `getRecords` 传入当前时间窗 start/end。
- [ ] 打开代理面板后渲染进程持有的 records 数 ≤ limit（默认 5000）。
- [ ] 窗口内 records ≤ limit 时数据与改动前一致；超限时仅保留最新 N 条（视觉一致由 t164 兜底）。
- [ ] 新增/更新单测覆盖 `query_records` 的 limit 下推。

### Reviewer verdict

- Round 1 code：PASS / FAIL
- Round 1 test：PASS / FAIL
- Round 2 code：N/A
- Round 2 test：N/A

### 遗留

- 无

### 结果摘要

（收尾时填：内存峰值前后对比、records 加载体量变化。）

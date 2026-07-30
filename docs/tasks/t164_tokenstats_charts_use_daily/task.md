---
tid: t164
slug: tokenstats_charts_use_daily
diff_anchor: "<SHA>"
branch: t164_tokenstats_charts_use_daily
---

# Task t164_tokenstats_charts_use_daily

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

- [ ] `TokenStatsView` 不再 `getRecords()` 全量作为主数据源。
- [ ] KPI/donut/bar 基于 daily/sessions，数值与改动前一致。
- [ ] Heatmap 仍可渲染。
- [ ] SessionTable 服务端分页。
- [ ] 渲染进程不再持有 38 万行 records。

### Reviewer verdict

- Round 1 code：PASS / FAIL
- Round 1 test：PASS / FAIL
- Round 2 code：N/A
- Round 2 test：N/A

### 遗留

- 无

### 结果摘要

（收尾时填：各图表数据源迁移情况、内存对比。）

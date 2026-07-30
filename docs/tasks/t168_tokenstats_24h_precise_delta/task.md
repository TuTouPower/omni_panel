---
tid: t168
slug: tokenstats_24h_precise_delta
diff_anchor: "<SHA>"
branch: t168_tokenstats_24h_precise_delta
---

# Task t168_tokenstats_24h_precise_delta

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

- [ ] 24h preset KPI delta 基于精确 24h 窗口，不再偏大。
- [ ] 7d/30d preset KPI delta 与改动前一致。
- [ ] 24h KPI 数值合理（current/prev 窗口对称）。
- [ ] 单测覆盖 24h 窗口切分。

### Reviewer verdict

- Round 1 code：PASS / FAIL
- Round 1 test：PASS / FAIL
- Round 2 code：N/A
- Round 2 test：N/A

### 遗留

- 无

### 结果摘要

（收尾时填：24h delta 前后对比、方案选择。）

---
tid: t165
slug: agent_window_singleton
diff_anchor: "<SHA>"
branch: t165_agent_window_singleton
---

# Task t165_agent_window_singleton

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

- [ ] 连续多次触发 `tokenStats.open()` 只存在一个 agent BrowserWindow。
- [ ] 已打开时再次触发 focus 已有窗口。
- [ ] 关闭后引用清空，再次触发可新建。
- [ ] 单测覆盖单例行为。

### Reviewer verdict

- Round 1 code：PASS / FAIL
- Round 1 test：PASS / FAIL
- Round 2 code：N/A
- Round 2 test：N/A

### 遗留

- 无

### 结果摘要

（收尾时填：多开场景下窗口数对比。）

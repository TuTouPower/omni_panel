---
tid: "t386"
slug: "emitted_session_dimension_key"
title: "emitted 会话维度去重防活跃长会话整段重发"
status: "done"
branch: "t386_emitted_session_dimension_key"
worktree: ""
review_level: "full"
diff_anchor: "031108a3c8b7bf2d87df7f3fe6b1901910fe451a"
depends_on: ""
conflicts_with: ""
note: "来源 p166"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

无

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending/todo/`**：用 `scripts/repo_template/pending.py new --slug <主题>` 建条目并填写，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round 1 (2026-08-15 07:00 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t386_code_f001|minor|已修|session_touch_ts 键加 source\|env 前缀（防跨源会话 id 碰撞） | src/main/core/token-stats/collector.ts:612,150-152 |
|t386_code_f002|minor|已修|reset_config 补 session_touch_ts.clear() | src/main/core/token-stats/collector.ts:751 |
|t386_code_f003|minor|已修|AC-001 去手动 set 走生产刷新路径 + 前缀断言 | tests/unit/main/core/token-stats/collector.test.ts:1109-1130 |
|t386_test_f001|important|已修|session_touch_ts 未清理致顺序依赖：beforeEach + reset_config 补清 | tests/unit/main/core/token-stats/collector.test.ts:149 |
|t386_test_f002|minor|已修|AC-001 手动 set 冗余：删，走生产刷新 | tests/unit/main/core/token-stats/collector.test.ts:1109 |

### Round 2 (2026-08-15 07:05 UTC+8)

- 复核：code PASS（f001-f003 消除）；test PASS（f001/f002 消除）。无新 finding。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001（活跃会话 key 保留）、AC-002（非活跃删除语义不变）、AC-003（跨会话独立 key）均列于 `handoff.json` 的 `ac_evidence`，mutation 验证

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS（f001-f003 minor）
- Round 1 test：FAIL（f001 important touch 清理 + f002 minor）
- Round 2 code：PASS
- Round 2 test：PASS

`single`：

- Round 1 general：N/A

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- emitted 去重 key 加会话维度 + 活跃会话保留；token-stats 全量 298 passed，code/test 双轴 2 轮 PASS。

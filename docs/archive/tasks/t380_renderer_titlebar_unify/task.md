---
tid: "t380"
slug: "renderer_titlebar_unify"
title: "四面板标题栏统一为共享 PanelTitleBar"
status: "done"
branch: "t380_renderer_titlebar_unify"
worktree: ""
review_level: "full"
diff_anchor: "e3eb137add1a677f5787a6cd10ce78d32cebf243"
depends_on: ""
conflicts_with: ""
note: ""
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

### Round 1 (2026-08-15 03:40 UTC+8)

| finding_id     | severity | status | rationale | fix_ref |
| -------------- | -------- | ------ | --------- | ------- |
| t380_code_f001 | important | 已修   | popup 标题栏契约迁移未同步 e2e：7 个 spec/helper 迁移 popup-titlebar→data-panel-titlebar=Usage + 导航名→XX面板 | tests/e2e/web/panel_navigation.spec.ts:56-64 |
| t380_code_f002 | minor    | 已修   | 非 floating 关闭语义变更（hide→window.close()）按 AC-002 实现并补单测 | tests/unit/renderer/views/popup_view.test.tsx:245-259 |
| t380_code_f003 | minor    | 已修   | PopupView 内联 use_panel_navigation() 提至组件顶层 | src/renderer/views/PopupView.tsx:50 |
| t380_code_f004 | minor    | 已修   | Session 页签 center 插槽 h-full 退化：center 容器加 h-full + items-stretch，页签整高贴底 | src/renderer/components/ui/PanelTitleBar.tsx:173 |
| t380_test_f001 | important | 已修   | 同 code f001（test 轴复核 e2e 契约迁移完整） | tests/e2e/ |
| t380_test_f002 | important | 已修   | AC-002 非 floating 关闭→window.close() 无测试：补单测锁定（close 被调 / hide 未调） | tests/unit/renderer/views/popup_view.test.tsx:245-259 |
| t380_test_f003 | minor    | 已修   | center/title_extra 用例位置断言弱：视图层行为断言补位（筛选器/页签入 titlebar） | tests/unit/renderer/views/token_stats_header.test.tsx:171-173 |

### Round 2 (2026-08-15 03:55 UTC+8)

- 复核：code PASS（f001-f003 消除，f004 修不彻底仍存）；test PASS（f001/f002 消除，f003 维持 minor 接受）。

### Round 3 (2026-08-15 04:00 UTC+8)

- 复核：code PASS（f004 center 加 h-full 后整高贴底消除）。两轴无新 finding。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001~005 均列于 `handoff.json` 的 `ac_evidence`（单测 + e2e 契约迁移），mutation（导航顺序打乱）验证

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：FAIL（f001-f004）
- Round 1 test：FAIL（f001-f003）
- Round 2 code：PASS（f004 修不彻底仍存）
- Round 2 test：PASS
- Round 3 code：PASS（f004 消除）

`single`：

- Round 1 general：N/A

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 四面板标题栏统一（PanelTitleBar center/title_extra/floating/onRefreshAll + Usage/Agent/Session 迁移），renderer 全量 1198 passed，三轮 review 全消除。

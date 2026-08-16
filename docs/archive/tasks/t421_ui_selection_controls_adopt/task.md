---
tid: "t421"
slug: "ui_selection_controls_adopt"
title: "选择框与分段控件统一走 ui 组件"
status: "done"
branch: "t421_ui_selection_controls_adopt"
worktree: ""
review_level: "full"
diff_anchor: "92f616fc5c1816a05f7cfe602c817c33e662af04"
depends_on: ""
conflicts_with: "t403,t404,t415,t419,t420,t422,t424"
schedule_status: "scheduled"
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

- doctor：无（`docs/blueprint/testing.md` 声明本仓无独立 doctor）。
- Checkbox 加法扩展 `select`/`order`，默认 native 不变；Segmented option 透传 title/aria-label/data-testid；Menu/MenuItem 透传 a11y 与 data-testid。
- 调用点：SessionRow/SessionCard/RecentSessionsModal；SessionLibrary/ProviderCard/ProviderAccountRow；WorkspaceToolbar。
- 趋势窗口 e2e 断言随 Segmented 选中态（surface-window）更新；provider_card 互斥高亮类名同收敛。
- 基线已有 4 条 lint 红（session-resume / general_section / settings_view_general）与本 task 无关，未改。

## Review 处置

### Round 1 场景说明

Round 1 零 finding，未进处置表。

## 收尾报告

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足（AC-004 为 [deploy] 人工目检）
- 证据：见 `handoff.json` `ac_evidence`

### Reviewer verdict

`full`：

- Round 1 code：PASS
- Round 1 test：PASS
- Round 2 code：PASS
- Round 2 test：PASS

### 结果摘要

选择/分段/工具栏菜单三路自绘收敛到 ui 组件；测试与 typecheck 绿。

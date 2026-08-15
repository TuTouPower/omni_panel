---
tid: "t423"
slug: "ui_card_statusdot_align"
title: "ui/Card 与 ui/StatusDot 对齐 DESIGN 并收拢手拼复制体"
status: "done"
branch: "t423_ui_card_statusdot_align"
worktree: ""
review_level: "single"
diff_anchor: "f01a033eadc974c4bb33947976c921544fde7012"
depends_on: "t415"
conflicts_with: "t406,t412,t424"
schedule_status: "scheduled"
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

- doctor：无
- Card 补 `shadow-card`；5 处手拼改走 Card：CollapsibleCard / SkeletonCard / TokenPanel / VendorCard / CpaCard。
- StatusDot 改为 7px + 同色 16% ring 光晕；tone 五档；扩展 HTMLAttributes 透传 data-testid 等。
- 6 处手拼改走 StatusDot：UpcomingResetRow / UsageRows / CpaConnectorSettings / CpaCard / AccountRow（5 文件；UpcomingResetRow 原 map 多行计为多处）。
- 形态差异统一（记入本笔记，属 AC-002 授权收拢）：
    - UsageRows 6px → 7px
    - CpaConnectorSettings 8px → 7px；未连接态补光晕
    - UpcomingResetRow 光晕 18% → 16%；unknown 补光晕
    - AccountRow/CpaCard 失败色 `risk-critical` → StatusDot `error`；清零 `style={{ background }}`
    - 卡片描边手拼 `0.5px` → Card 统一 `border`（1px）
- 测试：ui.test 组件 token 断言 + 业务侧手拼 grep；`pnpm test` 3342 passed（首跑偶见 WorkspaceView flake，重跑绿，登记 p191）。
- 存量 lint（session-resume / general_section）属 p190，本 task 未触。

## Review 处置

### Round 1 场景说明

Round 1 零 finding，未进处置表。

## 收尾报告

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001 Card shadow + 5 处替换 + grep；AC-002 StatusDot 7px/16% + 6 处替换 + inline 清零；AC-003 [deploy] 目检；AC-004 `pnpm test` 全绿。详见 `handoff.json` ac_evidence。

### Reviewer verdict

`single`：

- Round 1 general：PASS

### 结果摘要

Card/StatusDot 对齐 DESIGN 完整形态，手拼卡片与状态点收拢；组件层成为唯一配方源。

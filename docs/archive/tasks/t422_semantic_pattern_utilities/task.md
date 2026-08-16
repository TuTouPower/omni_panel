---
tid: "t422"
slug: "semantic_pattern_utilities"
title: "告警条/code chip/徽章/toast 复合模式沉淀复用"
status: "done"
branch: "t422_semantic_pattern_utilities"
worktree: ""
review_level: "single"
diff_anchor: "66086b918debdbbafb5737a8c92850ae51ac588c"
depends_on: ""
conflicts_with: "t404,t405,t406,t409,t410,t411,t412,t415,t419,t421,t424"
schedule_status: "scheduled"
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

- doctor：无
- 实现：`ui/Alert`（error/warning/success 12% 浅底）、`ui/CodeChip`、`ui/Toast`；`Badge` 增 `accent`/`recommend`。
- 替换 14 处：Alert×6、CodeChip×3、Badge 3 配方（accent×2 + count + recommend）、Toast×2。
- SettingsView 错误条 10%→12%（spec 授权先例）；LabelMapDialog 原未定义 `error-container` token 改走 Alert；WorkspaceView toast 圆角/内边距与 SessionLibrary 统一。
- 测试：ui.test 组件断言 + 业务侧配方 grep；`pnpm test` 3338 passed。
- 存量 lint（session-resume / general_section）不属本 task，已有 p190。

## Review 处置

### Round 1 场景说明

Round 1 零 finding，未进处置表。

## 收尾报告

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001 配方 grep 清零 + 调用点替换；AC-002 组件测试 token 类 + [deploy] 目检；AC-003 `pnpm test` 全绿。详见 `handoff.json` ac_evidence。

### Reviewer verdict

`single`：

- Round 1 general：PASS
- Round 2 general：PASS

### 结果摘要

四类复合模式收进 ui 组件层，14 处复制点清零；语义色 12% 浅底成为告警条授权先例。

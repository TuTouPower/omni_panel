---
tid: "t243"
slug: "recent_sessions_button"
title: "会话历史面板：打开最近会话时增加「最近 6 个会话」选择按钮"
status: "done"
branch: "t243_recent_sessions_button"
worktree: ""
review_level: "single"
diff_anchor: "20399d7c0da13fbdc5322537f2c5133f6c82cf44"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- 在 `RecentSessionsModal` 的快捷选择数组中加入 6，并同步更新组件注释。
- 新增组件测试覆盖四个快捷按钮、按 `ended_at` 倒序取前六个会话及选择顺序角标。
- worktree 初始未安装依赖，使用 `pnpm install --offline --ignore-scripts` 补齐本地依赖；生成 `build-info` 后完成类型检查与全量测试。
- 用户已将审阅上限提高到 10 轮；本 task 第 1 轮审阅通过，无需追加轮次。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending.md`「待办」节（普通模板）**，新条目先运行 `scripts/pending.py next` 取编号，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round 1 (2026-08-07 14:24 UTC+8)

Round 1 零 finding，未进处置表。

### Round N (YYYY-MM-DD HH:MM UTC+8)

有 finding 时用本表；每条 finding 一行。

| finding_id     | severity                 | status | rationale | fix_ref |
| -------------- | ------------------------ | ------ | --------- | ------- |
| t000_code_f001 | critical/important/minor | 已修   | 一句话    | 文件:行 |
| t000_test_f002 | minor                    | 遗留   | 一句话    | pNNN    |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：`WorkspaceView.test.tsx` 相关测试 30/30 通过；`pnpm test` 全量通过（237 个测试文件，2553 通过，1 跳过）；`pnpm typecheck`、`pnpm lint`、Prettier 与 `git diff --check` 均通过。

### Reviewer verdict

- Round 1 general：PASS

### 结果摘要

最近会话弹窗新增「最近 6 个」快捷选择，按结束时间倒序选取前六个会话并保持既有上限与其他档位行为。

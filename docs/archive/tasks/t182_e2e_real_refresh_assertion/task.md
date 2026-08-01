---
tid: "t182"
slug: "e2e_real_refresh_assertion"
title: "e2e 断言真实刷新替换死等"
status: "done"
branch: "t182_e2e_real_refresh_assertion"
worktree: ""
review_level: "full"
diff_anchor: "cc59e34d5090098e063217ac07e8b9a0f8d31569"
depends_on: ""
conflicts_with: ""
note: "p004"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- SPIKE：MutationObserver probe 实测 `refreshAll` 在 mock local-api 下即时完成，`.spinning` 在点击后不可稳定观测（React 批量更新合并 setRefreshing(true/false)），故「等 .spinning 出现再消失」会 flaky。
- 实现：scheduler.spec.ts:43 的 `waitForTimeout(1000)` 替换为 `await expect(refresh_btn).not.toHaveClass(/spinning/, { timeout: 15_000 })`——spinner 在转时真实等待到消失，mock 即时刷新立即通过（无固定时长），保留 `.scroll` 可见断言。
- 验证：scheduler + popup_refresh_state_reset 7 用例绿；synthetic 全量 web e2e 48 passed；typecheck/lint 绿。

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

### Round 1 (2026-08-01 16:40 UTC+8)

Round 1 code 与 test 均零 finding（clean review），未进处置表。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC1——scheduler.spec.ts 无 `waitForTimeout` 残留；AC2——`expect(refresh_btn).not.toHaveClass(/spinning/, { timeout: 15_000 })` 耦合 refreshing state 信号链（TitleBar.tsx:45 + refreshAll().finally()），慢刷新真实等待消失、mock 即时通过，非固定时长（SPIKE 实测 mock 下 .spinning 窗口 < 帧，等出现会 flaky）；AC3——scheduler + popup_refresh_state_reset 7 用例绿，synthetic 全量 web e2e 48 passed，typecheck/lint 绿。

### Reviewer verdict

`full`：

- Round 1 code：PASS
- Round 1 test：PASS

### 结果摘要

- scheduler.spec.ts manual refresh 用例的 `waitForTimeout(1000)` 死等替换为「等刷新按钮 .spinning class 消失」，真实等待刷新完成信号；synthetic 全量 web e2e 48 passed 无回归。

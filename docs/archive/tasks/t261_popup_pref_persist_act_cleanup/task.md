---
tid: "t261"
slug: "popup_pref_persist_act_cleanup"
title: "sparkline 窗口偏好持久化死锁修复 + popup t250 测试 act 警告清理"
status: "done"
branch: "t261_popup_pref_persist_act_cleanup"
worktree: ""
review_level: "single"
diff_anchor: "e2c5156da22867c58a2f92d505dfb91a8d9d783e"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- 死锁根因确认：`has_sparkline_pref_ref` 仅在 `apply_config` 中「config 值 ≠ 当前值」时置位；配置无 `sparklineWindowDays` 键或值恰等于当前显示值时永不置位 → 持久化 effect 跳过写盘。参照同组件 activeUsageTab 的 prev ref 范式（t153）修复。
- 修复：新增 `prev_sparkline_window_ref`（初始 7），`apply_config` 中 `typeof number` 时无条件同步 prev（值相等保留 state，t222 f001 函数式 setter 约束不变）；持久化 effect 改比较 prev vs state，`prev !== state` 才写回。所有场景推演：无键首切写盘 / 值相等首切写盘 / 有键恢复 / 外部回显不误写，全部符合。
- t250 测试改造：`wait_debounce` 由真实 `setTimeout(600ms)` 改 `vi.advanceTimersByTimeAsync(DEBOUNCE_MS+100)`（act 内）；beforeEach `vi.useFakeTimers()`，afterEach `vi.useRealTimers()`。
- RTL 适配：本仓 `@testing-library/dom` 10.4.1 的 waitFor **无** `shouldAdvanceTime` 选项（spec 上下文区描述方式不适用）；fake timers 下 RTL waitFor 直接引用全局 `jest.advanceTimersByTime`，vitest 未提供，故 beforeEach `vi.stubGlobal("jest", vi)` 使 RTL 走 fake-timers 轮询分支。
- fake timers 时序：`AC2 无 activeUsageTab 切页签` 测试原 `getByRole("Claude")` 同步查询在 plugin 数据异步到达前执行失败，改 `findByRole` 等待按钮就绪（断言语义不变）。
- act 警告验证：t250 单文件运行 0 条 act 警告（AC4 达标）。批量跑 8 个 popup_view 文件出现 2 条 act 警告，定位来自 height/t153/re_login/upcoming（本 task 未改动文件，既有警告，与本次改动无关）。
- config 测试新增 2 用例：config 无键首切写盘（AC1）、config 有键且值=当前显示时首切写盘（AC2）；均先红后绿。

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

### Round 1 (2026-08-08 13:20 UTC+8)

| finding_id    | severity | status | rationale                           | fix_ref |
| ------------- | -------- | ------ | ----------------------------------- | ------- |
| t261_gen_f001 | minor    | 已修   | spec 上下文区机制描述更新为实际方案 | spec.md |

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
- 证据：
    - AC1（无键首切写盘）：`popup_view_config.test.tsx` 新增用例「config 无键时用户首次切换即写盘」先红后绿；切换 7→1 后防抖写回 `sparklineWindowDays: 1`。
    - AC2（有键且值=当前显示时首切写盘）：新增用例「config 有键且值=当前显示时首次切换仍写盘」，切换 7→30 写回。
    - AC3（有键恢复回归不破）：既有 t222 用例（恢复 1 天）+ 新用例 2（恢复 7 天）通过，13→14 用例全绿。
    - AC4（t250 act 警告 0）：`popup_view_t250.test.tsx` 改 fake timers（`vi.useFakeTimers` + `vi.stubGlobal("jest", vi)` + `advanceTimersByTimeAsync`），单文件运行 0 条 act 警告；断言语义与覆盖路径不变（5 用例全过）。
    - 全量 `pnpm test`：2638 passed / 8 skipped，仅 build-info suite 因 worktree 未生成 `src/generated/build-info.ts` 失败，生成后复跑通过（t218 已知流程）。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`。按**实际发生**的轮次列出。

`single`：

- Round 1 general：PASS

### 结果摘要

- sparkline 窗口偏好持久化从 has_pref 门控改 prev ref 模式，消除无键/值相等首切死锁；t250 测试改 fake timers 消 act 警告。

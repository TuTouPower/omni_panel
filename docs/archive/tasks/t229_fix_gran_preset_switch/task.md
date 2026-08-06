---
tid: "t229"
slug: "fix_gran_preset_switch"
title: "修复 7d/30d 预设下柱状图粒度切换失效"
status: "done"
branch: "t229_fix_gran_preset_switch"
worktree: ""
review_level: "single"
diff_anchor: "50134143c369a2b489f75cc041e45e9f4c8f4458"
depends_on: ""
conflicts_with: "t230"
schedule_status: "scheduled"
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

- 根因：`effective_granularity` 在 t191 中把 7d/30d preset 恒返回 `"day"`，导致 Segmented 按钮状态被覆盖；24h preset 仍强制 `"hour"`。
- 修复：将 `effective_granularity` 的非 custom 分支改为 `preset === "24h" ? "hour" : gran`，恢复 7d/30d 下 `gran` state 的真实生效，同时保持 24h 强制小时不变。
- 测试：在 `token_stats_view.test.tsx` 新增 3 个用例覆盖 7d/30d 切换、24h 强制小时、自定义范围自由切换；断言按钮高亮与 `getDashboard` 请求 `gran` 一致。
- 验证：`pnpm test tests/unit/renderer/views/token_stats_view.test.tsx` 全绿；`pnpm test` 全绿；`pnpm lint`/`pnpm typecheck` 通过。

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

### Round 1 2026-08-06 17:10 UTC+8

Round 1 零 finding，未进处置表。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md) + [`docs/specs/ai-cli-token-stats-ui.md`](../../specs/ai-cli-token-stats-ui.md)
- 结果：全部满足
- 证据：
    - AC1（7d/30d 切换小时/天）：测试 `7d/30d preset allows switching granularity to hour/day` 断言按钮高亮与请求 `gran` 同步变化。
    - AC2（24h 强制小时）：测试 `24h preset forces hour granularity and ignores day click` 断言点击「天」后仍高亮「小时」且请求 `gran` 仍为 hour。
    - AC3（自定义范围自由切换）：测试 `custom range allows free hour/day switching` 断言自定义范围下可切换 hour/day。
    - AC4（请求 gran 与缓存键一致）：测试通过等待实际 `getDashboard` 请求并检查 `gran` 字段验证；代码中 `effective_gran` 用于 `display_ref`、query key 与请求参数，未改缓存语义。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-run` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS / FAIL
- Round 1 test：PASS / FAIL

`single`：

- Round 1 general：PASS

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

修复 `TokenStatsView` 粒度切换回归；全部 AC 覆盖并通过 lint/typecheck/test。

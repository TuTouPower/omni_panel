---
tid: "t206"
slug: "t204_model_filter_test_coverage"
title: "t204 model 筛选测试覆盖补强"
status: "done"
branch: "t206_t204_model_filter_test_coverage"
worktree: ""
review_level: "single"
diff_anchor: "9d7b3c6cc9d1839e54e28eed136249694f881748"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

### Step 2/3 红绿

- AC1（remount）：token_stats_view.test.tsx，render 选 sonnet → unmount → 二次 render，断言首次 getDashboard 含 `model:"sonnet"`（来自 prefs）。
- AC2（组合 + 刷新）：同文件，选 sonnet 再选 Grok，断言 query 同时含 agent+model；mockClear 后切「7 天」，断言重新拉取且下拉含 sonnet/opus。
- AC3（local-api 四端点）：server.test.ts，vi.spyOn 真实 store 的 query_dashboard_sessions/query_heatmap/query_hour_buckets/query_range_rollup，fetch 带 `model=sonnet`，断言被调用时收到 model。sessions 端点需 agent+platform（schema 必填）。
- AC4（IPC 透传）：token-stats-ipc.test.ts，heatmap/hourBuckets/rollup/dashboardSessions 四 handler 传 `{model:"sonnet"}`，断言 store 对应方法收到；createMockDeps 补 `query_dashboard_sessions` mock（合法 sessions DTO）。
- AC5（rollup 过滤）：token-stats-store.test.ts，种子 sonnet+opus 两 record，断言 `query_range_rollup({model})` 各返回 1 行且 model 正确，无过滤返回 2 行。
- 全量单测 2181 passed / 1 skipped；typecheck、lint 干净。src/ 零改动（纯测试增量）。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending.md`「待办」节（普通模板）**，新条目先运行 `scripts/pending.py next` 取编号，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **无 finding**：Round 1 零 finding，未进处置表。

### Round 1 (2026-08-04 22:00 UTC+8)

零 finding（general PASS）。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC1 remount 恢复、AC2 agent+model AND 与窗口刷新、AC3 四端点 spy 透传、AC4 四 IPC handler 透传、AC5 query_range_rollup 过滤，均单测覆盖。全量 2181 passed / 1 skipped，typecheck/lint 干净，src/ 零改动。

### Reviewer verdict

`single`：

- Round 1 general：PASS

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 补齐 t204 model 筛选五条测试覆盖缺口（remount、组合与窗口刷新、四端点透传、IPC 透传、rollup 过滤），闭环 p043。

---
tid: "t235"
slug: "session_history_query_cache"
title: "会话历史查询负载优化（提取/定位缓存 + 兜底轮询降级）"
status: "active"
branch: "t235_session_history_query_cache"
worktree: "../omni_usage_t235"
review_level: "full"
diff_anchor: "131a9c2022b8a516ce2fe615238d7777cde7b39a"
depends_on: ""
conflicts_with: "t232,t237"
schedule_status: "scheduled"
note: "merged from t236"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- 在 `subscription-service.ts` 增加 `extract_cache`：key 为 `source|env|session_id`，失效信号为文件 `mtime_ms + size`；`subscribe`、`query`、`handle_change` 均优先命中或刷新缓存，保证同一文件未变化时仅一次 `extract_full`。
- 在 `session-locator.ts` 增加 `resolution_cache` 与 `clear_resolution_cache()`：重复 resolve 按 stat 命中缓存；文件删除后失效，返回 `SESSION_NOT_FOUND`。
- 将 `workspace-view-helpers.ts` 兜底轮询间隔常量 `FALLBACK_MS` 从 5000 改为 30000，60s 窗口内兜底 query 次数从 12 次降至 ≤2 次。
- 新增/更新单元测试覆盖缓存命中、追加刷新、订阅后复用、定位缓存失效、兜底轮询次数。
- `pnpm lint`、`pnpm typecheck` 通过；`pnpm test` 仅环境相关 `secrets-store.test.ts` 超时失败（与本 task 无关）；MOCK_FIXTURE=synthetic 下 `session_panel.spec.ts` 5 条通过。

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

### Round 1 2026-08-06 17:20 UTC+8

Round 1 零 finding，未进处置表。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
  - AC1–AC3：`subscription-service.test.ts` 中 query 缓存命中/追加刷新、subscribe 后 query 复用缓存测试通过。
  - AC4：`session-locator.test.ts` 中重复 resolve 命中缓存、删除后返回 `SESSION_NOT_FOUND` 测试通过。
  - AC5：现有 session-history 相关单元测试通过。
  - AC6：`WorkspaceView.test.tsx` 中 60s fake timers 窗口内兜底 query 调用 ≤2 次测试通过。
  - AC7–AC8：`session_panel.spec.ts` 在 synthetic fixture 下通过（推送秒级上屏 + 兜底拉齐）。

### Reviewer verdict

`full`：

- Round 1 code：PASS
- Round 1 test：PASS

### 结果摘要

缓存层对调用方透明，分页/增量/not-found 语义未变；兜底轮询从 5s 降级为 30s，订阅推送路径保持不变。

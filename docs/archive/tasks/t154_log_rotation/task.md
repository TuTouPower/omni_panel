---
tid: "t154"
slug: "log_rotation"
title: "日志 50MB 上限改分段轮转，禁止静默停写"
status: "done"
branch: "t154_log_rotation"
worktree: ""
review_level: "full"
diff_anchor: "74d5d5750dba874399b4923ed2b277208cccb550"
depends_on: ""
conflicts_with: ""
schedule_status: ""
note: ""
---

# Task t154_log_rotation

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

只记有追溯价值的进展、踩坑、中途决策、偏离 plan、关键验证；不写命令流水账。

- 无事项时写：无

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 解决不了；满轮后进 blocked，在「遗留」与口头报告中列出
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

### Round 1 (2026-07-27 04:22 UTC+8)

| finding_id     | severity  | status | rationale                                                                                                                       | fix_ref                                 |
| -------------- | --------- | ------ | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| t154_code_f001 | important | 已修   | rename 失败不再静默吞掉；失败时直接 return，不继续向越限文件追加                                                                | src/main/core/logging.ts:108-109        |
| t154_code_f002 | important | 已修   | 当前活动文件计入段数上限；允许旋转的条件改为 currentSegment < maxSegments - 1，保证总段数（active + rotated）不超过 maxSegments | src/main/core/logging.ts:95-109         |
| t154_test_f001 | important | 已修   | 段数上限测试改用注入的日期与 limit 断言；验证不存在超过 maxSegments 的段文件，并限制当前文件大小不超过 limit + 缓冲             | tests/unit/main/logging.test.ts:110-137 |

### Round 2 (2026-07-27 04:28 UTC+8)

零 finding，未进处置表。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep {tid}` 查，不在此记。

### 验收标准勾选

- [x] 写满 50MB 自动轮转：旧段保留、新段继续写，无静默停写（单测可证：注入小 `MAX_LOG_FILE_BYTES` 驱动）。
- [x] 单日段数达上限后停写并打 warn（防循环日志写爆磁盘）。
- [x] 7 天清理对段文件生效。
- [x] `pnpm test` 全绿，`pnpm typecheck` 通过。

### Reviewer verdict

- Round 1 code：FAIL（2 findings，已修）
- Round 1 test：FAIL（1 finding，已修）
- Round 2 code：PASS
- Round 2 test：PASS

### 遗留

- 无

### 结果摘要

- 已实现：`initLogging` 支持可注入的 `maxLogFileBytes`（默认 50MB）与 `maxSegments`（默认 10）；写满后按 `app-<date>.N.log` 分段轮转，继续写新的当前文件；总段数（当前 + 历史）达上限后停写并 warn；`cleanupOldLogs` 清理段文件；`exportCurrentLog` 仅导出当前段。
- 已测试：新增/更新单元测试覆盖轮转触发、段号递增、段上限停写、旧段清理；`pnpm typecheck && pnpm lint && pnpm test` 全绿。
- 双审 Round 2 总体 PASS。

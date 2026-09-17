---
tid: "t502"
slug: "logging_and_exports_use_china_local_time"
title: "日志切分、日志时间戳与导出文件名改用系统本地时区"
status: "done"
branch: "t502_logging_and_exports_use_china_local_time"
worktree: ""
review_level: "single"
review_limit: "5"
verify_limit: "5"
diff_anchor: "2cfeae89044712b5870966d070b9980fc6adc995"
depends_on: ""
conflicts_with: ""
note: "来源 p252；日志文件名按本地时区切分，日志条目带本地时区时间戳，导出默认文件名对齐本地日期"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

- 新建 `src/shared/lib/local-time.ts`：`get_local_date_string`（本地 YYYY-MM-DD）、`format_local_iso`（带偏移 ISO）；`logger.ts` 的 `format_timestamp` 改本地，`serialize_meta` 的 Date 仍 UTC。
- `logging.ts`：`getLogFilePath` 改本地；`initLogging` 跟踪 `current_log_date/file`，写时 `rotate_if_date_changed` 跨午夜关旧 fd 开新文件并重置段计数；`exportCurrentLog` 同走本地日期保持同步；`cleanupOldLogs` 未改逻辑。
- 六处文件名本地化：`server.ts` Web 导出、`usageboard-web.ts` 两处、`log-ipc.ts`、`config-ipc.ts`、`background_serve.ts`（`format_local_iso().replace(/[:+.]/g,"-")`）。
- 测试：`logging.test.ts` 旧 UTC 断言改本地并加跨午夜轮转+导出同步（`vi.mock local-time` hoisted）；新建 `local-time.test.ts`；`logger.test.ts` 加 ts 偏移断言；`server.test.ts` 导出端点改本地对齐。
- 验证：`pnpm test` 318文件3885 passed；定向27+3+69 passed；`typecheck`/`lint`/`build` 绿；`git diff --check` 绿。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round 1 (2026-09-18 04:25 UTC+8)

Round 1 零 finding。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`pnpm test` 318文件3885 passed（9 skipped）；定向 `local-time/logger/logging` 27 passed，`logs/export` 3 passed，`usageboard-web` 69 passed；`typecheck`/`lint`/`build` 通过；`git diff --check` 绿
- 黑盒：`blackbox_verify` 无打包/托盘/真实Electron/live路径，`pnpm test` 即主黑盒；`pnpm build` 通过
- review：single；Round1 PASS零finding；`reviewed_scope` 对应最终内容
- AC 证据：见 `handoff.json`

### 结果摘要

- AC-001~AC-005 全落盘；遗留无；来源 p252 待归档。

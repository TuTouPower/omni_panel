# Task review t502（reviewer_focus: 通用）

- task：`t502_logging_and_exports_use_china_local_time`
- spec：`docs/tasks/t502_logging_and_exports_use_china_local_time/spec.md`
- diff_anchor：`2cfeae89044712b5870966d070b9980fc6adc995`
- target：`git diff 2cfeae89044712b5870966d070b9980fc6adc995`
- round：1
- reviewed_at：2026-09-18 04:26 UTC+8

reviewed_scope: ac7a4d6cf962faed

## Findings

零 finding。本轮未发现达到 minor 及以上阈值的问题。

## 结论

- 本轮新发现：0 条
- 验证执行（全部在工作区 `/Users/testuser/kar/code/omni_panel_t502` 实跑）：
    - `pnpm vitest run tests/unit/shared/local-time.test.ts tests/unit/shared/logger.test.ts tests/unit/main/logging.test.ts` → 3 文件 27 用例全过（含新增跨午夜轮转+导出同步用例）。
    - `pnpm vitest run tests/integration/local-api/server.test.ts -t "logs export"` → 3 用例通过。
    - `pnpm typecheck`（`tsc --noEmit`）→ 干净通过。
    - `src` 内 `toISOString().slice(0, 10)` 残留仅 `src/renderer/components/dev-panel/CommitHeatmap.tsx:23` 一处（dev-panel fallback，与本 task 范围无关）；其余 `toISOString()` 均为 `startedAt/updatedAt/exportedAt/scanned_at` 及 `logger.ts:132` meta 机器时间戳，属 spec 明确要求保留的 UTC。
- AC 覆盖核验（逐条对照 diff）：
    - AC-001：`src/shared/lib/local-time.ts:10-13` 本地 `YYYY-MM-DD`（`getFullYear/getMonth/getDate`）；`src/main/core/logging.ts:22-24` 文件名本地化；`logging.ts:122-133,143` 写时跨天检测+关旧 fd+重算路径+重置段计数/缓存。`tests/unit/main/logging.test.ts:209-238` 以 mock 日期 `2026-09-18→2026-09-19` 两次写入断言旧文件关闭、新文件创建、数据分属。覆盖成立。
    - AC-002：`logging.ts:63-69` `exportCurrentLog` 与写路径同经 `get_local_date_string`；同上测试 `231-234` 跨天后导出新文件非空且含当日 sentinel。覆盖成立。
    - AC-003：`src/shared/lib/logger.ts:110-112` `ts` 改走 `format_local_iso`；`logger.ts:132` `serialize_meta` 中 `Date→toISOString` 未动；`tests/unit/shared/logger.test.ts:156-174` 断言 `ts` 带 `[+-]HH:MM` 且非 `Z` 结尾、`meta.resetAt` 保留 `...Z`。覆盖成立。
    - AC-004：`src/main/core/local-api/server.ts:1057-1059` Web 导出查本地日期文件+下载名；`src/web/usageboard-web.ts:397,669` 两处默认文件名本地化；`src/main/ipc/log-ipc.ts:52`、`src/main/ipc/config-ipc.ts:482`、`src/main/cli/background_serve.ts:129`（`format_local_iso` + `[:+.]→-` 文件名合法化）对齐；`tests/integration/local-api/server.test.ts:3466-3485` 端点命中本地日期文件并断言下载头。覆盖成立。
    - AC-005：`logging.test.ts:163,191` 两处旧 UTC 断言改为 `get_local_date_string`（spec 点名的 `150,159-163` 对应位置，属要求内改造，非弱化）；新增 `tests/unit/shared/local-time.test.ts:1-33` 三用例（格式/偏移非 Z/偏移自洽）与上述轮转、端点、logger 用例。无 `.skip`、无 `expect` 删除、mock 采用仓内既有 `vi.mock(import(...), hoisted)` 模式（`logging.test.ts:11-19`，与 `net-client.test.ts:16`、`collector-local.test.ts:13` 一致）且 `finally` 重置 mock 日期。覆盖成立。
- 不变量/非范围守住：`cleanupOldLogs`（`logging.ts:42-57`）零改动，仍按 `mtimeMs` 滚动；`serialize_meta` UTC 保留；未改日志等级与记录结构；`task.md` diff 仅为 `start` 写入的状态机字段。
- 未进表的提示：
    - `exportCurrentLog` 为调用时重算日期而非共享 `current_log_file` 闭包状态，午夜到首次写之间短暂窗口内两者可差一天（沿袭改前语义，spec 未定义该窗口，属可接受边界）。
    - `local-time.test.ts` 以运行期 `getTimezoneOffset` 自洽断言实现多时区无关性，单次运行只覆盖当前 zone；真三 zone 矩阵需 `TZ` 矩阵或 mock `getTimezoneOffset`，属可选项，未达 finding 阈值。
    - `CommitHeatmap.tsx:23` 的 UTC fallback 与日志/导出无关，留置正确，不建议本 task 顺手改。
- 总体判断：实现与测试均对齐 AC-001~AC-005，无偏航、无 breaking、无安全/性能问题，通过。
- 系统性 follow-up：无

verdict: PASS

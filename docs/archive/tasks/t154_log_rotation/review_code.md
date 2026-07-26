# Task review t154（reviewer_focus: 代码）

- task：`t154_log_rotation`
- spec：`docs\tasks\t154_log_rotation/spec.md`
- diff_anchor：`74d5d5750dba874399b4923ed2b277208cccb550`
- target：`git diff 74d5d5750dba874399b4923ed2b277208cccb550`
- round：1
- reviewed_at：2026-07-27 04:22 UTC+8

## Findings

### t154_code_f001 - rename 失败被静默吞掉，可能导致越限文件继续增长并跳号

- 严重度：important
- 位置：`src/main/core/logging.ts:105`
- 问题：`await rename(logFile, segmentPath).catch(() => undefined);` 把重命名错误静默吞掉。若 rename 失败（文件被占用、权限不足、目标段文件已存在等），执行流会继续走到 `appendFile`，向已经超过阈值的当前日志继续追加，导致：
    1. 轮转失败但日志仍无界增长，违反「写满 50MB 自动轮转、无静默停写」的意图；
    2. `currentSegment` 已在 103 行自增，下一条成功重命名的记录会跳过当前编号，产生段号空洞。
- 建议：移除 rename 的无声 catch；重命名失败时应直接 return，不再追加本条日志，并视情况记录错误。若需保持非阻塞，可只 catch 后 return，但不要继续 append。

### t154_code_f002 - 段数上限未把当前活动日志计入，实际允许 `maxSegments + 1` 段

- 严重度：important
- 位置：`src/main/core/logging.ts:81、94、103-105`
- 问题：`currentSegment` 只统计已轮转出的 `app-<date>.N.log` 文件数，未把当前活动文件 `app-<date>.log` 算作一段。停止条件 `currentSegment >= maxSegments` 因此允许产生 `maxSegments` 个历史段 + 1 个当前段，共 `maxSegments + 1` 个段文件。spec 中明确「`app-<date>.log` 恒为当前段」且示例「10 段 ≈ 500MB」均把当前文件视为一段，实现导致磁盘上限比 spec 声明多出一个段（约 50MB）。以 `maxSegments = 1` 为例，实现会生成 `app-<date>.log` 与 `app-<date>.1.log` 两段后才停写。
- 建议：把当前活动文件计入段数。例如启动时将 `currentSegment` 视为已轮转段数，并在尝试轮转前判断 `currentSegment + 1 >= maxSegments`（即总段数将超限时）停止写入；或者调整计数语义使 `maxSegments` 直接对应目录中 `.log` 文件总数上限。

## 结论

- 前轮 finding 复核（Round 2 才写）：无
- 本轮新发现：2 条（t154_code_f001、t154_code_f002）
- 总体判断：核心轮转链路已实现并串在 `pending_write` 上，但 rename 失败处理与段数上限边界条件存在合规与正确性问题，需修复。

verdict: FAIL

## Round 2 (2026-07-27 04:28 UTC+8)

### 前轮 finding 复核

#### t154_code_f001 - rename 失败被静默吞掉，可能导致越限文件继续增长并跳号

- 状态：已修
- 复核依据：`src/main/core/logging.ts:106-108`
- 结论：修复彻底。`await rename(logFile, segmentPath)` 不再被 `.catch(() => undefined)` 包裹；rename 失败会抛出并由外层 `catch` 捕获，后续 `appendFile` 不会执行，因此不会继续向越限文件追加，也不会出现 `currentSegment` 已自增但 rename 未成功的段号空洞。

#### t154_code_f002 - 段数上限未把当前活动日志计入，实际允许 `maxSegments + 1` 段

- 状态：已修
- 复核依据：`src/main/core/logging.ts:81、95-103`
- 结论：修复彻底。`currentSegment` 初始化为目录中已轮转出的最大段号（`getCurrentSegmentCount`），旋转条件改为 `currentSegment >= maxSegments - 1`，即仅当「已轮转段数 + 1（当前活动文件）」将超过上限时才停止写入，保证目录中 `.log` 文件总数不超过 `maxSegments`。

### 本轮新发现

0 条。

### 结论

- 前轮 finding 复核（Round 2）：t154_code_f001 已修复；t154_code_f002 已修复。
- 本轮新发现：0 条
- 总体判断：Round 1 的两个 important finding 均已按 spec 意图修复，实现层无新增正确性或合规问题；`pnpm test tests/unit/main/logging.test.ts` 与 `pnpm typecheck` 均通过。

verdict: PASS

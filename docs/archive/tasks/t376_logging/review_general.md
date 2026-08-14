# Task review t376（reviewer_focus: 通用）

- task：`t376_logging`
- spec：`docs/tasks/t376_logging/spec.md`
- diff_anchor：`77b3b74fb6e1139c929a7ac9da9b7c3ccf8a5805`
- target：`git diff 77b3b74fb6e1139c929a7ac9da9b7c3ccf8a5805`
- round：1
- reviewed_at：2026-08-15 02:15 UTC+8

## Findings

### t376_gen_f001 - AC-002 周期 warn 语义失效：warn 消息经 file transport 回环自增殖

- 严重度：critical
- 锚点：AC-002（「首次立即 warn + 每 SEGMENT_WARN_INTERVAL=100 条周期 re-warn」）
- 位置：`src/main/core/logging.ts:136-147`（skip 分支）
- 问题：skip 分支内 `createLogger("logging").warn(...)` 的日志消息经 `emit` 遍历全部 transport（`src/shared/lib/logger.ts:193`，含 file transport），再次进入 file transport 写路径；此时 `cached_size` 仍 ≥ `maxLogFileBytes`，于是再次走 skip 分支并再次 warn → warn 自增殖。`writes_since_segment_warn` 计数被 warn 自身重置/递增，周期语义被破坏——实际行为是「每条被跳过的日志触发一次 warn」而非「首次 + 每 100 条」。
  - 实测（真实 fs，`initLogging` + `maxLogFileBytes=40, maxSegments=1`，写 12 条）：console.warn 命中「segment limit」**12 次**（=日志条数）。
  - 实测（mock fs/promises，同款 fake fd，12 条）：**43 次** warn，且 `open_count=2`（含 reopen）、`bytes=145`（仅 1 条实际落盘）——递归放大。
  - 期望值（首次 + 每 100 条）：约 2 次。
- 建议：skip 分支的 warn 不进入 file transport 写路径（如用独立 console-only 输出，或给 warn 写加「不参与 skip 判断」标记），或将 warn 计数器与 warn 消息自身隔离（warn 消息的 skip 不递增/不触发 warn）。

### t376_gen_f002 - AC-002 测试伪验证：断言 ≥2 恰好掩盖每日志一次 + 递归实况

- 严重度：important
- 锚点：AC-002 测试可信
- 位置：`tests/unit/main/logging-transport.test.ts:90-115`
- 问题：断言 `warn_calls.length >= 2` 只验证「确实 warn」，未验证「首次立即 + 每 100 条周期」。实测 mock 下 12 条日志即 43 次 warn，120 条更多——该断言对任何「≥2 次」的错误实现都通过。测试通过反而让 handoff `ac_evidence` 据此声称 AC-002 已实现（`docs/tasks/t376_logging/handoff.json:17-18`），与实测不符。
- 建议：断言 warn 次数落在期望区间（如 2~3），或逐条捕获并断言相邻 warn 间隔（每 100 条一次）。

### t376_gen_f003 - 写失败路径 fd 泄漏

- 严重度：important
- 锚点：AC-001（错误路径 fd 重置）
- 位置：`src/main/core/logging.ts:166-169`（catch 块）
- 问题：catch 里 `log_fd = null` 直接丢引用，未 close 失效 fd。当 `fd.write()` 抛错（磁盘满、fd 失效 EBADF）时 fd 仍处于 open 状态，但引用被置 null → OS fd 泄漏。下次写 `ensure_log_fd` 会 open 新 fd；持续写失败期间每次泄漏一个 fd，长运行可耗尽 fd 上限。`close_log_fd()` 已含 `.catch(() => undefined)`，可安全复用。
- 建议：catch 块改调 `await close_log_fd()`（而非仅 `log_fd = null`）。

### t376_gen_f004 - stat 校准失败后 cached_size 不回落：文件被外部删除时永久 skip

- 严重度：minor
- 锚点：AC-001（行为回归）
- 位置：`src/main/core/logging.ts:125-128`
- 问题：周期 stat 失败（`stat(logFile)` 文件被外部删除）时 `if (s) cached_size = s.size` 不执行，但 `writes_since_stat = 0` 仍执行；`cached_size` 保留超限旧值 → 之后永久走 skip 分支，即使文件已重建也不恢复写。原实现 stat 失败时 `s` 为 undefined，不进入 skip 判断，`appendFile` 会重建文件继续写。行为回归。
- 建议：stat 失败时回退用 `fd.stat()` 校准（fd 仍指向同一文件），或 stat 失败将 `cached_size` 重置为 0 走一次写入路径验证。

## 结论

- 前轮 finding 复核：round 1，无。
- 本轮新发现：4 条（f001 critical / f002 important / f003 important / f004 minor）。
- 未进表的提示：无。rotate 的 close→rename→reopen 时序在既有 rotate 测试（真实 fs）下通过，未发现时序问题。
- 总体判断：AC-001（持久 fd 复用、size 周期 stat、rotate 关/重开 fd、cleanup/flush 关 fd）实现正确，既有 9 个测试全绿，`open 只调 1 次` 断言确证 AC-001；但 AC-002 行为与 spec 不符——实测每日志一次 warn + warn 递归自增殖（真实 fs 12 条→12 次、mock 12 条→43 次），且测试断言过弱未捕获，`handoff.json` 的 AC-002 声称不实。存在未解决的 critical/important，FAIL。
- 系统性 follow-up：无（AC-002 修复应在本 task 内完成）。

## Round 2 复核

### 前轮 finding 复核

- **t376_gen_f001（critical）已消除**：skip 分支 warn 改 `console.warn(...)` 直接输出（`src/main/core/logging.ts:156-158`），不再经 `createLogger` → file transport 回环。实测真实 fs：12 条→**1 次** warn（首次立即）、120 条→**2 次**（首次 + 第 100 条周期）；mock fs 12 条→2 次以内（原 43 次）。`segment_warn_issued` 首标记 + `writes_since_segment_warn` 每 100 条周期的组合逻辑正确（首次 `!segment_warn_issued` 立即 warn，之后计数到 100 再 warn）。
- **t376_gen_f002（important）已消除**：断言改为 `2 <= warn_calls <= 4`（`logging-transport.test.ts:115-116`）且加 `expect(mocked).toHaveBeenCalledTimes(1)`（`:118`）防递归放大 reopen；mock `stat` 补同源返回（`:31`）避免 fake fd 不建真实文件时 ENOENT 误触发 f004 路径。测试现能区分「每日志一次/递归」与「首次+每 100 条」两种实现。
- **t376_gen_f003（important）已消除**：catch 改 `await close_log_fd()`（`src/main/core/logging.ts:181`），close 后再置 null，复用已有 helper（内部 `.catch(() => undefined)` 不会二次抛）。mock 验证：注入 `fd.write` 抛 ENOSPC → close 被调、失败条目不落盘、后续写重新 open。
- **t376_gen_f004（minor）已消除**：周期 stat 失败（`!s`）分支加 `await close_log_fd(); cached_size = 0;`（`src/main/core/logging.ts:131-134`），下次写 `ensure_log_fd` 重新 open 并从 `fd.stat()` 取真实 size。mock 验证：stat 注入 ENOENT → close 被调、open 重新计数。

### 本轮新发现

- **t376_gen_f005 - segment_warn_issued 在 rotate 后不重置：解除段限后再次达上限不「立即」warn**
  - 严重度：minor
  - 锚点：AC-002 语义边界
  - 位置：`src/main/core/logging.ts:92,151`（`segment_warn_issued` 声明与置位）、rotate 分支 `:162-174`
  - 问题：`segment_warn_issued` 一旦置 true 永不重置。rotate 发生（`currentSegment < maxSegments - 1`）说明段限已解除；随后新文件再写满、`currentSegment` 再次达上限时，第一次 skip 因 `segment_warn_issued` 仍为 true 不会立即 warn，要等 `writes_since_segment_warn` 累计到 100 条。真实场景需 rotate 满段后再次写满当前段（每段 50MB），影响极小，但「首次立即」语义在 rotate 循环后不再成立。
  - 建议：rotate 分支 `cached_size = 0` 处同步重置 `segment_warn_issued = false`（`writes_since_segment_warn` 本就由首次 warn 时置 0），使每次进入段限状态都重新「首次立即 warn」。

## 结论

- 前轮 finding 复核（Round 2）：f001/f002/f003/f004 全部已消除，以 diff 与实测（真实 fs + mock fs 复现、错误路径注入）为准。
- 本轮新发现：1 条（f005 minor）。
- 未进表的提示：skip 分支 warn 现为 `console.warn` 直接输出，格式（`[logging] ...`）与 `createLogger` 的 `[ts][WARN][logging]` 前缀不同、且不再经 scrub——消息为固定模板 + logFile 路径，无敏感信息，属 AC-002「不静默丢失」目标下可接受的行为变化。
- 总体判断：AC-001/AC-002 四项修复均经独立复现确认（真实 fs 12 条→1 次、120 条→2 次；错误路径 close/reopen 注入验证），logging 全量 11 测试绿、unit/main 全量 685 测试通过无回归。仅剩 f005 一处 minor，PASS。
- 系统性 follow-up：无。

## Round 3 复核

### 前轮 finding 复核

- **t376_gen_f005（minor）已消除**：rotate 分支（rename 后、`ensure_log_fd` 前）同步重置 `segment_warn_issued = false` + `writes_since_segment_warn = 0`（`src/main/core/logging.ts:170-173`），位置正确、幂等、无副作用。
  - 技术说明（如实记录）：`segment_warn_issued` 置 true 仅发生在 skip 分支（`:151`），而 skip 分支 `return` 不进入 rotate；`currentSegment` 只增不减，一旦达段限永回不到 rotate 分支。因此 rotate 分支可达时 `segment_warn_issued` 恒为 false，该重置在可达路径上是幂等 no-op。但代码现明确表达「rotate 后解除段限 → 下次达上限重新立即 warn」的意图，且不引入任何行为回归，判定 finding 消除。
  - 现实边缘场景提示（未升级 blocking）：日志文件被外部 truncate 时，周期 stat 校准使 `cached_size` 回落 < 上限、恢复正常写，但 `segment_warn_issued` 不随回落重置——再次写满达上限时首次 skip 不立即 warn（等 100 条周期）。属极轻微（周期 warn 仍保证诊断不丢），且非 f005 原文描述场景（f005 描述的 rotate 场景不可达）。

### 本轮新发现

- 无。

## 结论

- 前轮 finding 复核（Round 3）：f005 已消除（rotate 分支重置在位、位置正确、实测无副作用）。
- 本轮新发现：0 条。
- 未进表的提示：外部 truncate 后 `segment_warn_issued` 不随 `cached_size` 回落重置的边缘场景（见 f005 复核），周期 warn 仍工作，不判 blocking。
- 总体判断：真实 fs 实测 rotate 到段限（maxSegments=3 填满 3 段）后首次 warn 正确触发 1 次、250 条 skip 触发 3 次（首+100+200）周期语义正常；logging 11 测试绿。仅剩观察级提示，无未解决 critical/important/minor，PASS。
- 系统性 follow-up：无。

verdict: PASS
reviewed_scope: 2953f2013284da48

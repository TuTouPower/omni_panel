# Task review t197（reviewer_focus: 代码）

- task：`t197_grok_token_stats_collect`
- spec：`docs/tasks/t197_grok_token_stats_collect/spec.md`
- diff_anchor：`3b2804f6`
- target：`git diff 3b2804f6`
- round：1
- reviewed_at：2026-08-04 03:12 UTC+8

审查范围含两个未跟踪文件（`src/main/core/token-stats/grok-reader.ts`、`tests/unit/main/core/token-stats/grok-reader.test.ts`），属 t197 实现主体。已运行 `npx tsc --noEmit`（通过）与 4 个相关 vitest 文件（117 例全过）。

## Findings

### t197_code_f001 - AC5 不可读路径不产生 warn，仅缺失目录有 warn

- 严重度：minor
- 锚点：AC5（grok 目录或 updates.jsonl **缺失/不可读**时该 source 静默跳过并 warn 日志）
- 位置：`src/main/core/token-stats/grok-reader.ts:389-394`（`missing` 仅由 `existsSync` 判定）、`grok-reader.ts:96`（`collect_update_files` 吞掉 `readdirSync` 异常）、`grok-reader.ts:422-425` / `442-445`（`statSync` / `readFileSync` 异常直接 `continue`）
- 问题：`missing` 只在 sessions 根目录不存在时置真；目录存在但不可读（`readdirSync` 抛错被内部 catch）时 `missing` 保持 false，单文件不可读也静默跳过，二者都不触发 collector 的 warn-once 日志（`collector.ts:300-307` 仅看 `result.missing`）。AC5 的「不可读」子场景缺 warn，只覆盖了「缺失」子场景。行为差距仅限少一条日志，数据仍正确跳过、不阻断其它 source。
- 建议：`scan_grok_updates` 的 `collect_update_files` 失败（readdir 异常）或目录 exists 但读不到任何入口时返回 `missing: true`（或单独的错误标志），让 collector 对该 source 也 warn 一次。

## 结论

- 本轮新发现：1 条（minor）
- 未进表的提示：
    - 文件过大：`src/main/core/token-stats/grok-reader.ts` 488 行（实现源码 ≥400，minor 建议拆分 reader/merge/serialize 职责）；`src/main/core/token-stats/token-stats-store.ts` 1481 行（≥800，但本 task 仅改 1 行类型断言，属既有规模）。
    - 范围外改动：`src/main/core/local-api/server.ts:513-516` 有一处与 t197 无关的工作区改动——`/connector/refresh-all` 去掉 `await`。`handleConnectorRefreshAll`（`connector-ipc.ts:213`）确为同步函数、返回 `IpcResult<void>`，行为等价；注释标注 t196，疑为 t196 遗留未提交改动混入 t197 worktree，建议提交前拆分。
    - 数据质量边缘（非 AC 缺陷）：`turn_completed` 缺 `modelUsage` 或为空对象时（实测数据均带），records/daily 的 `model` 记为 `""`、session model 落库为 `'unknown'`，面板会出现空模型分组；可留防御或显式跳过。
    - 覆盖小缺口：`grok_sessions_path` 无精确字符串 path-builder 单测（现有集成式断言 `toContain(".grok\\sessions")`），建议补一条与 kimi 同风格的精确路径断言。
- 总体判断：AC1-AC6 实现完整、映射正确（reasoning 计入 output 不单记、增量 mtime + REPLACE 幂等、scan-state 续扫、WSL 门控、agent/source 一致），typecheck 与 117 例单测全绿；唯一 minor 为 AC5 不可读路径缺 warn。
- 系统性 follow-up：无

## Round 2（复核 f001 修复）

### 修复核对

- **missing 判定扩展**：`grok-reader.ts:389-402` — `existsSync` 之外，目录存在但 `readdirSync` 抛错（sessions_dir 实为文件 → ENOTDIR）置 `missing=true` 整体跳过并保留 prev state。
- **单文件 stat/read 失败**：`grok-reader.ts:429-459` — `statSync` / `readFileSync` 失败置 `file_unreadable=true` 并 `continue`，仍采集其它可读文件；返回值 `missing: file_unreadable`（`:501`）触发 collector 的 warn-once。
- **collector 端**：warn 逻辑未动（`collector.ts:300-307`，`result.missing && !grok_missing_warned` → warn 一次）。
- **测试**：`grok-reader.test.ts:334-341` 新增「treats an unreadable sessions path (a file, not a dir) as missing (t197 AC5)」。已跑通：grok-reader 13 例、collector 29 例、collector-state 8 例全过。
- 结论：f001 闭环。AC5「缺失/不可读 → warn once」行为已覆盖。

## 结论（Round 2）

- 本轮新发现：0 条（f001 已修复并验证，无新 blocker）
- 未进表的提示：
    - 嵌套子目录 `readdirSync` 失败（`collect_update_files` 内部 catch）仍静默跳过，与 kimi/claude reader 既有行为一致，不触发 warn；属既有设计一致边缘，不单列 finding。
    - 单文件 read 失败时 mtime 已记录，mtime 不变则不再重试；与 kimi/claude reader 一致，且 Grok 追加新 turn 必改 mtime，无实质数据丢失。
    - 文件过大与 server.ts:513 去 await 两处按 coordinator 说明不处置。
- 总体判断：Round 1 唯一 minor 已修复，AC1-AC6 全部满足，测试与 typecheck 全绿。
- 系统性 follow-up：无

## Round 3（复核 mtime 落盘行为修复）

### 修复核对

- **mtime 落盘时机**：`grok-reader.ts:433-476` 逐文件循环 — mtime 从「stat 时无条件落」改为「读+解析成功后才落」；`statSync`/`readFileSync` 失败置 `file_unreadable=true` 且**不落 mtime**，下轮扫描重试（而非旧行为下 mtime 已记录、mtime 不变不再重读）。
- **skip 分支仍落 mtime**：命中 prev.mtime（`:443-448`）、session_id 缺失（`:464-466`）、parse 失败 facts null（`:469-471`）均落 mtime，与 kimi/claude reader 一致（parse 失败跳过重读）。此三分支的文件在旧 state 中均有对应记录或本就无 facts 产出，落 mtime 仅让 state 随扫描前移，不丢数据。
- **测试**（`grok-reader.test.ts`，`vi.mock("node:fs")` 部分委托 + `vi.hoisted` 注入失败路径）：
    - `:362-378`「flags the source unreadable when one updates.jsonl cannot be read, still collecting the rest」——`missing=true` 且可读文件仍产出 1 条 records。
    - `:380-403`「retries an unreadable file on the next scan instead of skipping it forever」——首扫 `first.new_state.mtimes.has(file) === false`，二扫 `missing=false` 且 records 恢复。
- 已跑通：grok-reader 15 例、collector 29 例、collector-state 8 例全过。
- 结论：mtime 落盘修复正确，未引入新问题；数据一致性优于旧行为（瞬时不可读文件不会永久跳过）。

## 结论（Round 3）

- 本轮新发现：0 条
- 未进表的提示：嵌套子目录 readdir 失败静默（与 kimi/claude 一致）按 coordinator 说明不处置；文件过大与 server.ts 去 await 两处沿用前轮处置。
- 总体判断：mtime 落盘行为修复闭环，AC1-AC6 全部满足，测试与 typecheck 全绿，无新 blocker。
- 系统性 follow-up：无

verdict: PASS

# Task spec

## 背景

review_20260723_opus：P3 cycleDurationMs 语义混淆；I8（`connectors/kimi/connector.ts:62-63,93-95`）用 `reset_at - now`（距下次重置剩余时间）当「周期时长」；I9（`connectors/opencode_go/connector.ts:176`）`reset_in_sec*1000`（剩余秒数）当周期时长；minimax（`:189`）`end_time-start_time`（数据异常 end<start 得负值）。与 claude/cpa/glm/mimo 固定周期常量用法相反。下游依赖该字段算进度/刷新节奏会错。

## 范围

- kimi：改固定周期常量（`7*24*3_600_000` 周窗口、`5*3_600_000` 5h 窗口）。
- opencode_go：rolling 用 `null`，weekly/monthly 用固定常量。
- minimax：`cycleDurationMs` 校验 `>=0`（end<start 时 `Math.max(0)` 兜底为 0，下游与 null 等价）。
- observation schema 注释明确：`cycleDurationMs` = 完整周期时长（非剩余）；host 层 `cycleDurationMs>=0` 校验。

## 非范围

- 不改 reset_at 语义（reset_at 是下次重置时刻，正确）。

## 验收标准

- [x] kimi cycleDurationMs = 固定周期常量（非 reset_at-now）。
- [x] opencode_go rolling=null，weekly/monthly=常量。
- [x] minimax end<start 时 `Math.max(0,...)` 兜底为 0（下游 provider-usage 与 null 等价处理，无功能差异）。
- [x] schema JSDoc 注释（observation.ts）+ host 校验 cycleDurationMs>=0（plugin-output nonnegative）。
- [x] 单测覆盖三连接器（kimi 固定常量、opencode_go rolling=null/weekly=7d/monthly=30d、minimax 负值兜底）。

## 依赖与约束

- 无外部依赖。

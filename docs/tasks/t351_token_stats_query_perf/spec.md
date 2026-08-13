# Task spec

## 背景

token-stats 查询/存储有三处性能问题：(1) `query_trend_series` 无 LIMIT 全窗口物化后 JS 分桶，输出恒 ≤120 点；(2) rollup ready 后 dashboard 查询仍从 raw records 全窗口扫（`materialize_session_meta`/`window_models` 走窗口函数）；(3) `query-dispatcher` 的 queued 请求超时计时从入队起算，active 请求慢时 queued 一发送即误报 QueryTimeoutError。

## 契约区

### 范围

- 把 `query_trend_series` 分桶下推到 SQL（按桶取 MAX(observed_at) 行或 GROUP BY date + LIMIT），单查询返回行数 ≤ cap。
- `materialize_session_meta`/`window_models` 从已就绪的 hour_rollup/window_rows 派生，或建成持久化增量表。
- `query-dispatcher` 发送 queued 请求时重置其 timer（timer 只在成为 active 后生效）。

### 非范围

- 不改查询结果语义/字段。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。

<!-- /规范 -->

- [ ] AC-001：`query_trend_series` 单查询返回行数有界（≤ cap），不再全窗口物化后 JS 分桶。
- [ ] AC-002：rollup ready 后 dashboard 查询不依赖 raw records 全窗口扫描。
- [ ] AC-003：queued 请求在 active 变慢时不被误报超时（timer 在发送/激活时重置）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：store 单测断言返回行数、dispatcher 单测断言 queued timer 重置。

## 上下文区

- 来源：review_20260813_114911/review_intensive.md（`observation-store.ts:290`/`:297`、`token-stats-store.ts:598`、`query-dispatcher.ts:220`）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- store 单测：注入大窗口数据，断言分桶后行数 ≤ cap 且每桶取最新行。
- dispatcher 单测：mock active 慢请求，断言 queued 发送时 timer 重置。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：SQL 分桶语义与 JS 分桶不完全一致（边界/取行策略）。
- 回退：先以等价测试锁定 JS 分桶输出，再替换 SQL 实现，输出 diff 归零。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无

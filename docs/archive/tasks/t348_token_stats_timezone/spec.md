# Task spec

## 背景

token-stats 时区约定固定 UTC+8（`token-stats-store.ts` 用 `+28800000`、spec/conventions 明示「UTC+8 整点」），但渲染端多处用机器系统时区：`bucketize` 用 `new Date(timestamp)` + `setMinutes(0,0,0)`（系统时区），BarChart hour 轴标签用 `getHours()`，chart-data 的 heatmap/rollup 用本地 `getDay()/getHours()`。非 UTC+8 机器上小时轴错标、数据错桶、图表间互相矛盾；`date` 字段 schema 注释声明 UTC 而 reader 按本地时区归日。

## 契约区

### 范围

- 渲染端统一定义 UTC+8 offset 的日期/小时边界 helper，替换 `bucketize` 与 `getDay/getHours` 的本地时区调用。
- 测试固定 `TZ=Asia/Shanghai` 并补非 UTC+8 用例。
- `token-stats.ts` 的 `date` 字段注释与实现/测试口径统一（本地或 UTC 二选一）。

### 非范围

- 不改服务端 SQL 的 UTC+8 聚合（已正确）。

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

- [ ] AC-001：渲染端 bucket 边界/小时标签统一按 UTC+8 计算，与 token-stats-store 一致（非 UTC+8 机器不落错桶）。
- [ ] AC-002：测试固定 `TZ=Asia/Shanghai` 并含非 UTC+8 用例，任何整点时区机器都红/绿一致。
- [ ] AC-003：`date` 字段 schema 注释与 reader 实现口径一致。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：渲染端 helper 单测 + TZ 固定后 chart-data 测试。

## 上下文区

- 来源：review_20260813_114911/review_intensive.md（`aggregate.ts:65`、`BarChart.tsx:231`、`chart-data.ts:370`、`token-stats.ts:114`、`BarChart.tsx:227`/`aggregate.ts:55`）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- chart-data/aggregate 测试：`TZ=Asia/Shanghai` 固定，补 UTC-5 机器期望的桶边界/标签断言。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：UTC+8 helper 引入后，records 短窗路径（本地 bucketize）与 cells/buckets 路径需共用同一 helper。
- 回退：统一到单一 `utc8_offset` 常量，替换所有本地时区调用点。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无

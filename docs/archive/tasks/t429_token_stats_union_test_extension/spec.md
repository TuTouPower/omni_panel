# Task spec

## 背景

rollup ready 后 union 路径缺两项覆盖：① agent+model 组合过滤（records 路径已有 `token-stats-store.test.ts:2590`，union 用例 :2300/:2644 均 agent=all 仅 model）；② 跨 model 同 session 的 COUNT(DISTINCT session) 去重断言（:2644 数据已构成同 session 跨 model 命中，但只断言 `current.calls=2`，无 sessions 去重断言）。is_hour_rollup_ready 断言已覆盖（:2305/:2442/:2492/:2496/:2254），本 task 不再重复。

## 契约区

### 范围

- 仅在 `tests/unit/main/core/token-stats/token-stats-store.test.ts`（或同目录测试文件）补测试用例，触达 rollup-ready 生产路径（dashboard_window_union_builder 双源）；不改生产代码。

### 非范围

- 不新增 store 层行为。
- 不改既有用例语义。

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

- [ ] AC-001：新增 rollup ready（is_hour_rollup_ready()=true）下 agent+model 组合过滤用例，断言两条查询路径（rollup union + records fallback）均只返回匹配行。
- [ ] AC-002：新增跨 model 同 session 用例，断言 sessions 维度去重（COUNT(DISTINCT session) / sessions 列表无重复 session）。
- [ ] AC-003：既有用例不回归（全量 token-stats 测试绿）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试。

## 上下文区

- 来源：p183（t384 reviewer 登记；2026-08-16 核实：is_hour_rollup_ready 断言已覆盖，本 task 不再重复；仍缺 agent+model 组合过滤与 sessions 去重两项）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 沿用 :2300/:2644 union 用例范式与 record() fixture 助手。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：用例若未真正触达 union 路径（rollup 未 ready）即空跑——必须显式断言 ready。
- 回退：删除新增用例。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无

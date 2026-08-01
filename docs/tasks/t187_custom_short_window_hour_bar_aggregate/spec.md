# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

来源：p023。

t183 把 24h preset 的时间轴小时柱改走 `query_hour_buckets` 聚合（消除 records LIMIT 截断），但 `hour_fetch` 条件 `gran !== "hour" || !time_axis || (is_short_window && preset !== "24h")` 仍让**非 24h preset 的 ≤25h 自定义范围**（custom range）时间轴小时柱走 records。高密度时该路径受倒序 LIMIT 50000 截断，与 p020 同源。hour 聚合支持任意窗口（无短窗口对称切分约束——那是 KPI/donut 的事），可统一覆盖。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- ≤25h 自定义范围（custom range，preset=null）在时间轴 + 小时粒度下，小时柱改走 `query_hour_buckets` 聚合，不再走受 LIMIT 截断的 records。
- 24h preset 行为不变（t183 已修）；≥7d 与 day 粒度路径不变。

### 非范围

- 不改 ≤25h 自定义范围的 KPI/donut/项目/会话轴（仍走 records，无对称切分约束下的等价聚合）。
- 不改 records LIMIT 或 records fetch 量。
- 不改 hour 聚合 SQL 本身。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：≤25h 自定义范围 + 时间轴 + 小时粒度下，BarChart 接收 `query_hour_buckets` 完整窗口数据，而非受 LIMIT 截断的 records。
- [ ] AC2：该路径下 getHourBuckets 收到完整自定义窗口 [start, end]。
- [ ] AC3：24h preset、≥7d、day 粒度路径行为不变（回归用例）。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

全部 AC 可自动测试。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

无。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- renderer view 测试：用 RangePicker 触发 ≤25h 自定义范围 + 小时粒度，mock records 截断（仅最近几小时）+ hour buckets 完整窗口，断言 BarChart 收到完整 hour buckets。
- 保留 t183 的 24h preset hour bucket 测试与 7d/30d 回归。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

无。

### 风险与回退

- 风险：自定义范围边界（如恰好 25h）的 hour 聚合对齐；RangePicker 触发时序在测试中的稳定性。
- 回退：恢复 hour_fetch 的 `(is_short_window && preset !== "24h")` 条件（自定义范围回到 records，截断风险回到 p023 前状态）。

### 依赖与约束

- 依赖 t183 已建立的 hour bucket 接线（getHourBuckets / prepareBarDataFromHourBuckets / BarChart rollup prop）。
- 不与 task-run 队列冲突。

### Finalization 时更新的 blueprint

- `docs/specs/ai-cli-token-stats-ui.md`：数据源表「BarChart 时间轴 · 小时粒度」行的「非 24h 的 ≤25h 自定义范围仍走 records」说明改为「≤25h 自定义范围也走 hour 聚合」。

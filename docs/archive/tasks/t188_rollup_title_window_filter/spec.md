# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

来源：p024（t184 review Round 2 f003 复核提示）。

`token-stats-store.ts` 的 `query_range_rollup` 用相关子查询选每组最新 timestamp 的 title 对齐 records `rs[0].title`，但子查询 `WHERE t2.session_id=... AND source=... AND env=...` 未带窗口 `timestamp` 过滤，选的是该 session **全表**最新标题。records 版 `query_records` 先按窗口过滤再 `ORDER BY timestamp DESC`，`rs[0].title` 是**窗口内**最新。差异：session 在窗口外被改名时，rollup 返回窗口外的新名，session 轴 label 前 7 字符可能漂移；token 统计不受影响。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- `query_range_rollup` 的 title 子查询补窗口过滤（`timestamp >= @start`，与外层 current 窗口一致；end 用半开 `< @end` 对齐外层），选窗口内最新 timestamp 的 title。
- 仅当外层 query 带 start 时加窗口条件；不带 start（全表 rollup）保持全表最新。

### 非范围

- 不改 rollup 的 token/calls 聚合或分组键。
- 不改 records 版 `sessionRows` 的 title 取数。
- 不改其他聚合（hour buckets / heatmap）的 title 口径。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：session 在窗口外被改名后，`query_range_rollup({start, end})` 返回的 title 是窗口内最新 timestamp 对应的标题，不是窗口外的新名。
- [ ] AC2：不带 start 的全表 rollup 仍返回全表最新 title（行为不变）。
- [ ] AC3：带 start 但窗口内无记录的 session 不出现在结果（外层 WHERE 已保证），title 子查询不引入额外行。

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

- store 测试：构造 session s1 在窗口内（title=A）+ 窗口外（title=B，timestamp 更晚），断言 `query_range_rollup({start, end})` 返回 title=A；不带 start 返回 title=B。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

无。

### 风险与回退

- 风险：子查询加 start 条件后，需正确传递 @start 参数（better-sqlite3 named params 跨子查询）；性能影响可忽略（窗口过滤缩小子查询扫描集）。
- 回退：移除子查询的 start 条件（回到全表最新，p024 偏差恢复，无数据迁移）。

### 依赖与约束

- 依赖 t184 已建立的 rollup title 子查询结构。
- 不与 task-run 队列冲突。

### Finalization 时更新的 blueprint

- 无（rollup title 语义在 t184 store 注释中已说明，本次仅补窗口过滤使行为与注释一致）。

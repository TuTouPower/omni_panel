# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

p040（t200_code_f003）：`tokenStatsRollupRowSchema` 不含 `env`，renderer `prepareBarDataFromDashboardRollup` 的 session_key 缩为 `${source}|${session_id}`（chart-data.ts:1090）。跨平台（win/wsl）同 session_id 的会话在 session 轴被合并为一个 category。已核实：内部 `DashboardRollupRow = TokenStatsRollupRow & { env }` 与 SQL（含 env 列、GROUP BY 含 env）都已就绪，缺的只是 schema 公开字段与 renderer key 收口。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- `src/shared/types/token-stats.ts`：`tokenStatsRollupRowSchema` 加 `env` 字段（对齐 `tokenStatsEnvSchema`）。
- `src/main/core/token-stats/token-stats-store.ts`：`query_range_rollup` 返回含 env 的行（SQL 已含 env 列，`rollup_row_from` 已取，仅类型收口）。
- `src/renderer/lib/token-stats/chart-data.ts`：session_key 与 sessions 去重 key 改为 `${source}|${env}|${session_id}`。
- 相关单测：rollup schema 含 env；session 轴跨 env 同 session_id 不合并。

### 非范围

- 其他 xaxis（time/project）语义。
- 历史明细表（SessionTable）session 行 key（identity_key 已含 env）。
- 任何 SQL 分组/校验语义变更——本次只把已存在的 env 字段补进公开类型与 renderer key。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] rollup 行 schema 含 `env`，序列化/反序列化不丢字段。
- [ ] session 轴下，同 session_id 但不同 env（win/wsl）的两个会话显示为两个独立 category。
- [ ] sessions 计数按含 env 的 session key 去重，跨 env 同 session_id 不重复计入同 category。
- [ ] 既有 time/project 轴行为不回归。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- 全部 AC 可自动测试：schema 单测 + `prepareBarDataFromDashboardRollup` 纯函数单测 + store 集成测试。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 无。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- fixture：构造含同 session_id 不同 env 的 rollup rows，断言 `prepareBarDataFromDashboardRollup` 输出两个 category。
- store：`query_range_rollup` 集成测试断言返回行含 env。
- 回归：token_stats_view dashboard 测试（xaxis 切换）。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 无。

### 风险与回退

- 风险：`query_range_rollup` 调用方（KPI/donut）对新增字段不感知——只加字段不改既有字段，向后兼容。
- 回退：session_key 改回不含 env（若上游消费方出现合并期望）。

### 依赖与约束

- 依赖 t200（rollup DTO 拆分）与 t204（model 筛选）。
- 无平台/安全约束。

### Finalization 时更新的 blueprint

- `docs/specs/ai-cli-token-stats-ui.md`：session 轴 key 含 env 注明。

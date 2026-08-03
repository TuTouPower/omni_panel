# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

t197 已把 Grok 的 token 用量采集进 token-stats（source=grok、agent=grok）。本 task 让面板展示层识别新 source：source/agent 筛选、图表 label/color、查询 filter 类型。数据层枚举（`tokenStatsSourceSchema`、records `agent` schema）由 t197 扩展，本 task 依赖其取值。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 查询 filter 类型（sessions/records/rollup 等查询的 `agent?` 枚举）扩展 grok 值。
- 图表 label/color 映射与各 donut/segment/筛选数组加入 grok（含 buckets 与 rollup 两条线）。
- source/agent 筛选控件出现 grok 项，records/图表按 grok 正确过滤。
- web 查询面（local-api / usageboard-web）agent 参数类型收窄同步 grok。

### 非范围

- 数据采集与入库（t197）。
- token-stats 数据模型枚举扩展本身（t197 已含 records `agent` schema 与 source schema）。
- Grok billing 额度面板（独立连接器）。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：面板 source 筛选出现 grok 项（含 label 展示）。
- [ ] AC2：选择 grok 后，各 token-stats 图表与统计（趋势、KPI、donut、heatmap、列表）仅展示 `source=grok` 数据，不混入其它 source。
- [ ] AC3：records 视图按 agent 过滤时 grok 值与 source 筛选一致，可筛出 grok 记录。
- [ ] AC4：`source=grok` 无任何数据时，筛选与图表不报错、不出现异常渲染（显示空态或默认值）。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- AC1：可自动测试（chart-data/筛选纯函数 + UI 测试断言 grok 项存在）。
- AC2：可自动测试（纯函数 fixture 断言 grok 数据聚合正确、其它 source 隔离）。
- AC3：可自动测试（查询/过滤纯函数）。
- AC4：可自动测试（空数据 fixture 用例）。真实渲染需 web e2e，数据为空时断言无异常。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 参考与数据来源

- 数据模型取值来自 t197：`source="grok"`、records `agent="grok"`（kebab-case 约定）。
- 展示层现有三 source 的 label/color 在 `src/renderer/lib/token-stats/chart-data.ts`（records 侧 `AGENT_*` 与 buckets/rollup 侧 `BUCKET_AGENT_*` / `ROLLUP_AGENT_*` 两组映射）与查询 filter 类型（`src/shared/types/token-stats.ts`）中，本 task 按同构扩展。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 真实 WSL grok 数据的端到端 UI 渲染（CI 无 WSL grok 数据）：不测，用 fixture。
- grok 颜色/图例排版的像素级视觉验证：沿用现有 source 的测试粒度，不做视觉快照。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- chart-data / 聚合纯函数单测：注入含 grok 的 buckets/rollup fixture，断言 agentSegments、modelSegments、KPI 等按 grok 聚合正确。
- 查询与过滤纯函数单测：grok agent 过滤。
- UI：web e2e 或组件测试断言筛选项与空态（按现有 token-stats 面板测试组织）。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 无（取值来自 t197 已确证数据层；展示层为内部映射扩展）。

### 风险与回退

- 风险：漏扩某处硬编码 source/agent 枚举（label/color/筛选数组多处），grok 显示为裸值或筛不掉。回退：执行期全量 grep source/agent 枚举接点核对，review 复核。
- 风险：查询 filter 类型收窄处（web 查询面）未同步导致类型编译错误。回退：tsc 全量类型检查兜底。

### 依赖与约束

- 依赖 t197 完成并确认 `source`/`agent` 取值。
- 三 source 现有多处硬编码数组（label/color/筛选）与 `token-stats.ts` 查询 filter 类型需同构扩展，一处不漏。

### Finalization 时更新的 blueprint

- `docs/blueprint/domain.md`：如 t197 finalization 已记录 grok source，本 task 补充展示层映射（label/color/agent 值）或确认无需。

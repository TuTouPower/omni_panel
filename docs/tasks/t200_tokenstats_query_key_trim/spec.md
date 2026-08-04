# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

代理面板查询缓存（`src/renderer/lib/token-stats/query-cache.ts`）的 key 序列化含 `metric`、`xaxis`、`gran` 与 `session_offset`（`TokenStatsView.tsx:311-322`）。展示维度切换触发相同数据依赖的重复 dashboard IPC 查询并占用 LRU 条目（p026 = t190_code_f003）；翻页时 `session_offset` 变化导致整个 dashboard（summary/chart/heatmap 一并重算）cache miss 重复聚合（p029 = t191_code_f006）。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 消除 query cache key 中的展示派生维度（`metric` / `xaxis` / `gran`），使同一范围 + 筛选 + 数据版本下切换展示方式复用缓存。
- 消除 query cache key 中的 `session_offset`，使会话翻页独立按需加载，不再重算 summary / chart / heatmap。
- 保持 dashboard 展示正确性与现有筛选 / 别名行为不变。

### 非范围

- 不改变后端聚合口径、DTO 契约或 IPC 通道。
- 不实施查询进程隔离、不做视觉设计改动。
- 不把 renderer 查询结果持久化到磁盘。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：同一时间范围 + agent/platform 筛选下，切换 `metric` / `xaxis` / `gran` 不触发新的 dashboard IPC 查询（命中缓存），展示内容正确派生。
- [ ] AC2：会话翻页只请求会话页数据，summary / chart / heatmap 不因翻页重新请求或重算。
- [ ] AC3：跨筛选/范围/数据版本变化的缓存失效语义保持正确（陈旧数据不展示，新版本触发刷新）。
- [ ] AC4：dashboard 展示结果与改前在全部选项组合下等价（以 oracle 或既有测试基线核对）。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

全部 AC 可自动测试（renderer 单测断言查询调用次数与缓存命中，展示派生正确性沿用既有图表测试）。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 不测图表视觉渲染细节（颜色/布局），沿用既有约定。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- renderer 测试：spy dashboard IPC 调用，断言展示维度切换与翻页不新增调用、缓存命中复用。
- 后端行为不变时，dashboard IPC 结果仍由 store 测试保证；renderer 侧重缓存与请求编排。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 展示维度（`metric` / `xaxis` / `gran`）从 dashboard 查询参数剥离后，renderer 能否用已返回聚合数据完整派生所有展示（含 sessions metric 的 directory 维度、hour/day 桶、time/rollup 两种 x 轴）：`UNVERIFIED-SPIKE`，执行期用现有 DTO 字段实验验证派生完备性后落地。
- 会话分页独立加载的最小契约：`UNVERIFIED-SPIKE`，执行期确认是否新增 IPC 通道或复用现有 dashboard 会话字段。

### 风险与回退

- 风险：剥离展示维度后 renderer 派生遗漏某区域导致展示漂移；分页独立请求引入额外 IPC 延迟。
- 回退：保留旧 query key 序列化分支，回退实现 commit 即恢复原加载路径；不涉及数据迁移。

### 依赖与约束

- 依赖 p026（t190_code_f003）与 p029（t191_code_f006）登记。
- 依赖 t192 聚合层：展示派生基于 dashboard 已返回的聚合数据，不回到 per-message records。
- 约束：query cache key 只反映「数据」身份，展示维度属 renderer 本地状态。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：renderer 查询缓存 key 边界与展示派生数据流。
- `docs/specs/ai-cli-token-stats-ui.md`：展示维度切换与翻页的加载语义。

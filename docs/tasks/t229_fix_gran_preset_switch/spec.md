# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

来源：p060。

`src/renderer/views/TokenStatsView.tsx` 自 t191（commit 96cbf532）引入 `effective_granularity(preset, custom, gran)`：`preset` 非 24h 时恒返回 `"day"`、24h 恒返回 `"hour"`，且粒度 Segmented 的 `value={effective_gran}`、onChange 只 `setGran`。导致 7d/30d 预设下点「小时」不生效（`gran` state 被覆盖），24h 下点「天」无视觉反馈。t191 之前 `value={gran}` 原生生效，属回归。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 恢复 7d/30d 预设下时间轴「小时/天」粒度按钮的真实切换。
- 保持 24h 预设强制小时粒度不变（t183：24h preset 时间轴走 `query_hour_buckets` 小时聚合）。
- 自定义范围保持可自由切换粒度。

### 非范围

- 不改后端查询逻辑与 IPC 契约。
- 不做粒度按钮禁用/隐藏的样式调整。
- 不改变 24h preset 走 rollup（t184）与 24h 强制小时的既有行为。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] 7d/30d 预设下，点击时间轴「小时」后，粒度按钮高亮切换到「小时」，且图表与请求的 `gran` 为 `hour`；点击「天」恢复 `day`。
- [ ] 24h 预设下，粒度按钮恒为「小时」，点击「天」不改变生效粒度（保持 hour 高亮）。
- [ ] 自定义范围下，「小时/天」均可真实切换，生效粒度与按钮一致。
- [ ] 切换粒度触发的 `getDashboard` 请求携带与实际生效一致的 `gran` 值，并进入查询缓存键（不破坏既有缓存语义）。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- 全部 AC 可自动测试：前 4 条均在 `tests/unit/renderer/views/token_stats_view.test.tsx` 用 Segmented 点击 + `getDashboard` mock 请求断言覆盖。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 无

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 复用 `tests/unit/renderer/views/token_stats_view.test.tsx` 既有 mock（`getDashboard`、BarChart/Segmented 真实渲染）。断言点：7d/30d 下点「小时」后 Segmented `on` 类与 `getDashboard.mock.calls.at(-1)` 的 `gran`；24h 下点「天」后高亮仍为 hour 且请求 `gran` 为 hour。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 无（t173 已确认 ≥7d 小时粒度后端 hour buckets 聚合可用，spec `ai-cli-token-stats-ui.md:150` 有据）。

### 风险与回退

- 风险：7d/30d 下切小时会触发 hour 级桶查询，窗口大时查询量与渲染量上升；但 t173 已为 ≥7d 小时聚合建桶，属既有支持路径，非新风险。若 `effective_granularity` 语义被其他依赖消费（`range_refresh_key`、`session_query_identity`、查询键均用 `effective_gran`），改动需保持这些引用一致。
- 回退：还原 `effective_granularity` 为 t191 现状即可，涉及仅 `TokenStatsView.tsx` 单文件。

### 依赖与约束

- 依赖 p060 登记（根因已定位）。
- 约束：不改后端；不改 IPC/DTO 契约；24h 强制小时保持。

### Finalization 时更新的 blueprint

- 无

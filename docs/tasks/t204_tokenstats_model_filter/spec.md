# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

代理面板（TokenStatsView）顶部已有 工具 / 平台 / 时间范围 / 主题 筛选，但无「模型」维度。用户要按某个模型查看用量：面板最上面加一个模型筛选控件，选定后整块面板（KPI 圆环、时段热力、柱状图、会话表）都只统计该模型。现有 dashboard 查询链（token_stats_records → hour_rollup 联合窗口物化 + heatmap/rollup/sessions 聚合）均无 model 过滤维度。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 后端：dashboard / dashboard/sessions 查询 schema 增加可选 `model` 参数；store 的窗口物化（records 源 / hour_rollup 联合源）、heatmap、range_rollup、sessions 聚合全部按 `model` 过滤；heatmap/rollup/sessions 的 filter 类型加 `model`；local-api 与 IPC 透传。
- 前端：TokenStatsView 顶部（controls 区）加模型筛选控件（可选：全部模型 / 具体某模型），选定值纳入查询 key 与缓存，prefs 持久化。
- 模型选项来源：dashboard 返回该筛选窗口（agent/platform/range/gran）内出现的 distinct model 列表，供下拉展示；切换窗口时列表随之刷新。

### 非范围

- 不改动模型别名（model_aliases）机制与现有 alias 配置 UI。
- 不做多模型复选 / 排除模型 / 模型排序自定义。
- 不改变 heatmap 分档逻辑（分档改动属 t205）。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：代理面板顶部出现「模型」筛选控件，默认「全部模型」；选项列表 = 当前筛选窗口内实际出现过的模型名。
- [ ] AC2：选定某模型后，面板 KPI（总 Token/会话数/调用次数/工具占比/缓存命中率）、时段热力、柱状图、会话表数据全部只含该模型（其余模型数据不出现）。
- [ ] AC3：模型筛选与 工具/平台/时间范围/粒度/主题 组合时语义正确（AND 关系）；切换窗口后模型列表与面板数据同步刷新。
- [ ] AC4：模型选择持久化（localStorage prefs），重开面板保持；切换「全部模型」恢复全量。
- [ ] AC5：dashboard 响应含窗口内 distinct model 列表字段；web SPA（local-api `/v1/dashboard`）与 electron IPC 两通道均透传 `model` 参数且行为一致。
- [ ] AC6：现有查询缓存语义不回归——模型筛选变化必须使缓存失效并重新查询（不能命中旧的跨模型缓存）。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- AC1-AC6 均可自动测试：后端 SQL 过滤用 store 单测（种子数据断言 model 过滤后 KPI/heatmap/rollup/sessions 计数）；模型列表字段单测；renderer 控件渲染、prefs 持久化、query key 含 model、缓存失效用组件单测。e2e 层可用 token-stats 真实数据冒烟（本机有 token-stats 数据源）。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 真实 Electron 弹窗内模型下拉的可视布局：沿用现有 controls 区控件测试方式（渲染 + 选中断言），不测视觉细节。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 后端：token-stats-store 单测/集成测，种子多模型 records，断言加 `model` 过滤后 summary totals / heatmap cells / rollup 行 / sessions 数与手算一致；`model` 缺省时行为不变（回归）。
- schema：dashboard/sessions query 的 `model` 可选字段接受/拒绝用例。
- 前端：TokenStatsView 单测（控件渲染、选择触发 query key 变化、prefs 读写）；query-cache 单测（model 进 key → 切换 model 不命中旧缓存）。
- 模型列表：dashboard DTO 新增字段的 schema 校验 + store 返回 distinct models 单测。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- distinct model 列表的准确来源（records 全窗口 distinct vs 物化窗口 distinct）：`UNVERIFIED-SPIKE`，执行期用本机真实 token-stats 库核对窗口内模型全集与两种取法的差异，选与面板窗口语义一致者。
- model 过滤对 hour_rollup 联合窗口 SQL 的影响（rollup 侧 / records 侧 where 均须加 model 条件）：`UNVERIFIED-SPIKE`，执行期以真实数据验证 UNION 两侧过滤后合计与 records 全窗口一致。

### 风险与回退

- 风险：SQL 过滤在 union/rollup/records 多路遗漏一侧，导致筛选结果不精确（某些区域漏滤或重复计数）。
- 回退：回退实现 commit 即恢复；model 字段为可选参数，缺省走原全量路径。

### 依赖与约束

- 依赖：token-stats 数据已采集（本机有历史数据可验证）。
- 约束：不改变 dashboard DTO 既有字段语义；新增字段须向后兼容（web 与 electron 同 schema）。

### Finalization 时更新的 blueprint

- `docs/blueprint/decisions.md`：如模型列表来源 / 过滤实现有值得长期约束的决策。

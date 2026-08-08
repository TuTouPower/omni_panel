# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

Agent 统计窗口（`TokenStatsView`）自带一套独立色板（紫色强调、独立字体栈、默认亮色），与外壳 PanelTitleBar 的 globals 蓝体系并存，是「同一窗口两种语言」的典型。本 task 将其迁移到统一规范并退役 token-stats 体系；ECharts 图表配色经 token resolver 接入，随主题/accent 重绘。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- Agent 统计窗口全部视图（KPI、图表、表格、徽章、品牌 dot 等）样式迁移到 ui 组件库 + 语义 token。
- 现存信息结构与展示形态（KPI 卡片、图表类型、表格列、徽章种类）原样保留；紫色强调与紫青渐变品牌 dot 等体系级色板差异按 DESIGN.md 收敛到统一色板，单一组件形态不新增不删除。
- **chart token adapter**：为 ECharts 建立 token resolver——渲染期从语义变量解析实际颜色（轴、提示框、类目色、dataZoom、热力等全套），主题或 accent 变化使 palette revision 递增并触发 `setOption` 重绘；canvas 已绘制内容不依赖 CSS 类自动更新。
- 删除 token-stats 独立样式体系及其作用域变量（含 t268 兼容桥在本侧的桥接条目），窗口外壳与内容同色板、同字体栈。
- 删除后确认无残留引用（grep 可证：文件不存在、import 为零、`--ts-*` 变量与 `ts-*` 类引用为零）。

### 非范围

- 不改统计数据来源、图表配置逻辑、ECharts 集成方式（图表配色接入 token resolver 除外）。
- 不动其它窗口。
- agent 识别色 token 的定义归 t268，本 task 只消费。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] Agent 窗口全部现存功能行为不变：KPI 数值、图表渲染与切换、表格、时间范围筛选。
- [ ] 窗口内容区与标题栏视觉同体系：强调色随全局五档切换即时生效（含图表配色重绘），字体栈全局一致。
- [ ] 明暗主题切换后 DOM 与图表配色同步变化，默认方向与全局一致，无独立的反方向默认值。
- [ ] token-stats 体系文件已删除且无残留引用（grep 可证）。
- [ ] 视觉符合 DESIGN.md，人工抽查确认。[deploy]

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- AC 5：视觉对照属人工验证；AC 2/3 的 accent 与主题生效可断言 DOM 变量与传入 ECharts 的解析后 option。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- ECharts 画布内像素渲染：图表库内部绘制，断言解析后的 option 与重绘触发，不断言像素。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- token resolver 单测：断言解析后的实际颜色值（非 `var(...)` 字符串）、palette revision 递增与 `setOption` 重绘触发。
- 行为回归以现有 Agent 窗口测试为准；被 mock 掉的图表改经 resolver 层断言。
- 门禁：`pnpm check`、`pnpm build`、`pnpm test`、对应 electron e2e。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 无

### 风险与回退

- 风险：token-stats 变量被非预期位置引用（动态拼接类名等），删除后漏网；resolver 主题监听漏掉系统主题跟随路径。
- 回退：单 commit，revert 即恢复。

### 依赖与约束

- 依赖 t271；消费 t268 的 accent 派生变量、分类色与 agent 识别色 token。

### Finalization 时更新的 blueprint

- 无

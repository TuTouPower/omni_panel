# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

用量面板（主窗口 / web 版）顶部的厂商 tab 目前按固定顺序渲染（如 codex、antigravity、kimi、tavily、firecrawl）。用户希望像拖拽卡片一样拖拽 tab 图标来调整顺序，并且顺序能持久化。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- `ProviderNav` 组件内的厂商 tab 支持拖拽排序。
- 拖拽顺序保存到配置中，重启后恢复。
- 未排序或新增厂商时保持现有默认顺序。
- 提供视觉反馈（拖动中、放置目标）。

### 非范围

- 不改变 ProviderCard 的拖拽重排行为。
- 不改动 account 行在单 provider tab 视图内的顺序。
- 不新增第三方拖拽库；复用项目现有 HTML5 drag & drop 工具函数。
- 不影响 tab 的点击切换行为。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [x] AC1：用户可按住某个厂商 tab 图标拖动到另一个 tab 位置，松开鼠标后 tab 顺序立即更新。
- [x] AC2：拖拽过程中，被拖 tab 有可视化拖动状态，目标位置有可视化放置指示。
- [x] AC3：tab 顺序变更后写入配置持久化，应用重启后按保存的顺序渲染。
- [x] AC4：仅拖拽图标本身触发排序；点击 tab 仍正常切换当前 tab，不会误触发拖拽。
- [x] AC5：新增未排序过的厂商或清空排序配置时，tab 回退到默认顺序（与当前一致）。
- [x] AC6：拖拽排序在 web 构建与 Electron 构建中行为一致。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- AC1/AC2/AC4：可编写 renderer 单元测试模拟 dragStart/dragOver/dragEnd 事件并断言 DOM 顺序与状态；也可由 web e2e 覆盖真实拖拽。
- AC3：可编写单元测试断言配置保存与恢复；e2e 刷新页面验证持久化。
- AC5：可编写单元测试，给定空/部分排序配置时断言渲染顺序。
- AC6：由 web e2e + 打包后 smoke 覆盖；Electron 端行为依赖配置持久化逻辑一致，`[deploy]` 人工确认。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 无

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- renderer 单元测试：模拟 HTML5 DragEvent，验证 `ProviderNav` 在拖拽后回调正确的顺序数组。
- 配置持久化测试：mock `window.api.config` 或 config IPC，验证排序写入与读取。
- web e2e：在主窗口/页面中真实拖拽 tab，刷新后断言顺序保持。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 无

### 风险与回退

- 风险：拖拽事件与点击事件冲突，导致切换 tab 困难或无法触发拖拽。
- 回退：已通过在图标 span 上绑定 drag 事件、按钮保留 click 事件，并在 dragEnd 后用 setTimeout 清理标记抑制误点击；若后续发现冲突，可回退到不可拖拽状态。
- 风险：配置字段命名与已有 `provider_order` / `accountOrders` 混淆。
- 回退：复用既有 `providerOrder` 字段，使其同时控制总览卡片顺序与厂商 tab 顺序，不新增 `providerTabOrder`。

### 依赖与约束

- 依赖项目现有 `compute_drag_reorder` / `build_reorder_base` 工具函数。
- 配置持久化沿用现有 config IPC / `use_config` 模式。
- 无新增依赖。

### Finalization 时更新的 blueprint

- `docs/blueprint/domain.md`：补充厂商 tab 排序配置字段说明（如实现中新增配置项）。

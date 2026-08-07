# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

工作台会话面板头部与左侧会话 rail 目前用编程软件名称首字母（C / OC / K / G）作为徽标，用户要求改用用量面板已有的 provider logo 资源（Kimi、Claude Code、Grok、opencode 等），保持全应用视觉一致。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 工作台会话面板（`SessionPane`）头部徽标：由首字母改为复用用量面板的 provider logo（`VendorMark` 及其资源）。
- 工作台左侧会话 rail（`SessionRail`）槽位徽标：同样替换。
- source 到 logo 的映射：`claude_code`→claude、`kimi_code`→kimi、`grok`→grok、`opencode`→opencode（用量面板对应资源）；未知 source 有兜底显示。

### 非范围

- 不改动用量面板自身的 logo 显示。
- 不改动会话库列表中的文字 agent 名（非首字母徽标处）。
- 不新增/替换 logo 资源文件，只复用已有资源。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：工作台四个来源（claude_code / kimi_code / grok / opencode）的会话面板头部与 rail 徽标渲染为与用量面板相同的 provider logo 图形，不再是首字母。
- [ ] AC2：logo 在浅色/暗色主题下的显示与用量面板一致（含双主题资源的 provider）。
- [ ] AC3：未映射来源的会话显示兜底徽标，不报错、不渲染空白。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- AC2：主题下双资源切换依赖 CSS 显隐，自动测试断言两类资源节点均按 `VendorMark` 既有结构渲染；视觉效果以人工黑盒补充。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- logo 图形本身的视觉正确性：资源为既有入库文件，不在本 task 重复验证。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- source→vendor id 映射抽为纯函数，单测覆盖四个已知来源与未知来源兜底。
- 组件级测试：渲染面板头部与 rail，断言使用 `VendorMark` 且传入映射后的 id。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 已验证：`opencode` 会话映射到用量面板的 `opencode_go` vendor id。证据为 `connectors/opencode_go/manifest.json`、`src/renderer/lib/provider-usage.ts`、`src/renderer/components/Icon.tsx` 与既有 `icon.test.tsx` 均使用 `opencode_go`。

### 风险与回退

- 风险：vendor id 映射错误导致显示错误 logo；徽标尺寸变化可能挤压头部布局，需保持原徽标尺寸约束。
- 回退：恢复 `agent_initial` 字母徽标。

### 依赖与约束

- 无。

### Finalization 时更新的 blueprint

- 无

# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

会话面板 `PaneMessageRow` / `MarkdownMessage`（react-markdown，单条解析成本高）与会话库 `SessionCard` / `SessionRow` 均未 memo 化，回调全为内联闭包。后果：勾选单条消息 → selection_store 变更 → `WorkspaceView` 整树重渲染 → 所有面板所有消息行重渲染且 markdown 全量重解析；新消息推送/兜底返回 → `set_columns` → 整列 markdown 重解析；会话库每张卡片摘要到达单独 `set_summaries` → 一页 50 次整表重渲染。表现为「点一下就卡一下」。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- `PaneMessageRow` / `MarkdownMessage` memo 化；选中态以稳定 boolean props 传入，行级回调稳定化。
- `SessionCard` / `SessionRow` memo 化与回调稳定化。
- 摘要状态更新合批，一页卡片摘要到达不再逐条触发整表重渲染。

### 非范围

- 不做消息列表虚拟化（另一优化 task 负责）。
- 不替换 markdown 渲染器，不改 `MarkdownMessage` 的 props 契约（text 进、渲染出）。
- 不改选择 / 悬停 / 复制 / 预览 / 打开等行为语义与样式。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] 勾选/取消单条消息时，仅该行重渲染，同面板其他消息行不重渲染（渲染计数断言）。
- [ ] 新消息推送到列尾时，既有消息行不触发 markdown 重解析（渲染计数或 props 引用相等断言）。
- [ ] 会话库一张卡片摘要到达时，其余已渲染卡片不重渲染；一页摘要批量到达时整表重渲染次数有固定小上界。
- [ ] 消息选中 / Shift 连选 / 悬停 Space 选中、卡片选择 / 预览 / 打开行为不变，现有面板与会话库测试全部保持通过。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- 全部 AC 可自动测试：testing-library + 渲染计数探测组件断言重渲染范围；交互行为沿用现有测试。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 无

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 用带渲染计数器的探测包装（profiler 或计数子组件）断言重渲染范围；交互行为沿用现有 pane / library 测试，不改其语义。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 无

### 风险与回退

- 风险：memo 化后 props 比较掩盖应更新的场景（如选中态漏传）导致 UI 不刷新；以交互测试兜底。
- 回退：去掉 memo 包装恢复每次重渲染。

### 依赖与约束

- 无前置 task 依赖。
- 约束：与消息列表虚拟化、会话库内容搜索批量接口、会话摘要轻量通道及 SessionLibrary / 工作台文件拆分 task 同文件（`SessionPane.tsx` / `SessionLibrary.tsx`），须串行（conflicts_with 登记）。

### Finalization 时更新的 blueprint

- 无

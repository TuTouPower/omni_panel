# Task spec

## 背景

会话面板消息列表当前每条消息独立渲染角色标签（「用户」/「Agent」），连续同角色时标签重复；行间仅有 `py-1`，视觉贴紧。需要改为：相邻同 role 并组只在组首显示角色名、任意相邻消息统一固定间距、用户消息每条独立 `primary-container` 底色；时间戳改为跟随单条展开态显示，不再受工具栏全局 `show_time` 闸控。

## 契约区

### 范围

- 会话面板消息列表展示层（`PaneMessageRow` / `SessionPane` / `VirtualMessageList` 及相关纯函数）：
    - 相邻消息仅在 `role` 变化时拆组；组内仅组首显示「用户」或「Agent」标签。
    - 任意相邻消息（含同组连发与换角色）之间使用统一固定可见间距。
    - 用户消息每条内容各自一块 `primary-container` 底色（块间保留间距，不合并为整组连通底）；Agent 消息无该底色。
    - 单条消息折叠态不显示时间戳；展开态显示该条时间戳（每条消息在展开时都有时间，若 timestamp 为 null 则不显示时间文案）。
    - 消息时间显示不再依赖工具栏 `view.show_time`（该开关对消息时间无效；实现可保留开关 UI 或一并隐藏，以最小改动为准，但不得再以 `show_time` 为真时才显示消息时间）。
- 既有时间分割线 `should_insert_divider` 行为保留；时间分割线**不**拆组（组边界只看相邻 `role`）。
- 既有点击本体展开/折叠、checkbox 多选、user 底色 token、虚拟列表测量与滚动补偿保持可用。

### 非范围

- 不改消息数据模型、历史拉取/IPC、Markdown 渲染语义。
- 不改会话头部元信息、侧栏、会话库、大纲/定位逻辑。
- 不改跨时段时间分割线的触发阈值（仅约束其不参与拆组）。
- 不强制删除工具栏「显示时间」入口（是否移除 UI 属实现取舍，不作为 AC）。
- 不改 compact 模式以外的其它全局视图偏好语义（除上述消息时间与 `show_time` 解耦）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。

<!-- /规范 -->

- [ ] AC-001：相邻两条消息 `role` 相同（user 或 assistant）时，后一条 DOM 内不出现角色文案「用户」或「Agent」；仅该连续段第一条出现对应角色文案。
- [ ] AC-002：相邻两条消息 `role` 不同时，后一条 DOM 内出现其角色文案（「用户」或「Agent」）。
- [ ] AC-003：列表中任意两条相邻消息行之间存在固定、非零的垂直间距（同组连发与 user↔agent 切换使用同一间距量）；不得因连续同角色而变为零间距贴合。
- [ ] AC-004：`role=user` 的每条消息各自带有 `primary-container` 背景区域；同组多条 user 消息的背景不合并为单一连通矩形（相邻 user 背景块之间可观察到间隔）。
- [ ] AC-005：`role=assistant`（Agent）消息不带 `primary-container` 背景。
- [ ] AC-006：消息处于折叠态（默认单行）时，该条不显示时间戳节点；切换到展开态后，若该条 `timestamp !== null`，则显示该条时间戳。
- [ ] AC-007：消息时间戳是否显示仅取决于该条展开态与 `timestamp` 是否非空，与工具栏 `view.show_time` 取值无关（`show_time=false` 时展开态仍显示时间；`show_time=true` 时折叠态仍不显示时间）。
- [ ] AC-008：时间分割线（`should_insert_divider` 为真）插入时，不改变 AC-001/AC-002 的组边界规则（仅 `role` 变化拆组）。
- [ ] AC-009：既有行为保持：超行消息点击本体可展开/折叠；checkbox 点击只改选中不触发展开；用户消息底色 token 仍为 `primary-container`；现有相关单元测试与本变更触及的用例通过。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- AC-001～AC-008：可用单元/组件测试（构造相邻同 role / 异 role 序列、展开折叠、`show_time` 开关组合）自动验证。
- AC-003 的「固定非零间距」：组件树可断言列表/行上存在统一间距类名或等价 style；不强制像素级视觉回归。
- AC-004「不合并为连通矩形」：可断言每条 user 行各自带底色 class，且相邻行外层保留间距结构。
- AC-009：既有 `PaneMessageRow` / `SessionPane` 相关单测回归 + 全量 `pnpm test` 中触及本变更的用例。

## 上下文区

- 来源：用户会话需求（2026-08-16 澄清：仅 role 拆组；每条内容独立底；统一固定间距；展开显时间/折叠隐时间，忽略全局 `show_time`）；无 pending 条目

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 工具栏「显示时间」入口是否移除：实现取舍，不单测 UI 清理路径。
- 间距具体 token 数值的视觉美学（只验「统一且非零」结构）。
- 虚拟列表 scroll 补偿在本视觉改动下的像素级稳定性（沿用既有测量路径，不新增专项 e2e）。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 以 `tests/unit/renderer/components/workspace/PaneMessageRow.test.tsx` 及必要时 `SessionPane` 级列表渲染为主。
- 构造消息序列 fixture（同 role 连发、异 role 切换、timestamp null、divider 两侧同 role）。
- 展开态：mock `content_overflows` / 尺寸或直接触发 expand 后断言时间节点存在与否。
- 不 mock 生产 role 标签文案以外的 Markdown 内部。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：虚拟列表行高随「是否显示角色标签 / 时间」变化，测量不准导致滚动跳动；组首判定若用 index 而非相邻 role 比较会在 prepend 历史消息时出错。
- 回退：恢复每行必显角色标签 + `show_time` 控时间 + 原 `py-1` 间距的渲染路径。

### 依赖与约束

- 无前置 task 依赖。
- 须遵守 DESIGN.md token（`primary-container`、间距优先用既有 spacing token）；禁止硬编码散落色值。
- 与 `docs/specs/session-pane-display-adjust.md` / `session_message_click_expand.md` 冲突处：本 task 完成后 finalization 须回写生效 spec（角色标签去重、间距、时间跟展开态）。

### Finalization 时更新的 blueprint

- 无（蓝图架构不变）；生效 spec 更新：`docs/specs/session-pane-display-adjust.md` 与/或 `docs/specs/session_message_click_expand.md`（消息列表展示：组首角色标签、统一行间距、展开显时间）

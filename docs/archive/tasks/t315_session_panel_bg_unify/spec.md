# Task spec

## 背景

会话历史窗口（SessionShell）及其工作台/会话库子面板根背景用 `--color-surface`（浅灰），而用量/设置/代理三个面板根背景用 `--color-surface-window`（白），导致会话窗口与其他面板视觉不统一。同时会话卡片（SessionPane）为白卡 + `gap-px` 发丝间隔，与 demo（canvas 背景 + panel 卡片两色分明）相比卡片间距与层次不够清晰。用户要求：根背景与其他面板统一，卡片/内容区呈第二种颜色，间距控制到位。

## 契约区

### 范围

- 会话窗口根容器（SessionShell）背景从 `bg-surface` 改为 `bg-surface-window`（对齐用量/设置/代理三面板根背景）。
- 工作台（WorkspaceView）与会话库（SessionLibrary）根背景同步改为 `bg-surface-window`，避免内层灰底叠在白根上。
- 会话卡片（SessionPane）与会话库内容区的第二色：调整为 `bg-surface-raised` 或保持 `bg-surface-window` 白卡但用 `surface-raised` 区隔，使「面板背景 / 卡片背景」两色分明；同步检查 grid `gap-px` 与发丝线间距，卡片间距与 demo 对齐。
- 明暗双主题不退化（`dark:` 变体沿用 token 翻转）。

### 非范围

- 不改 demo（public/frontend_demo）代码。
- 不改其他三面板（Usage/Settings/TokenStats）布局。
- 不做卡片尺寸/交互重构。

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

- [ ] AC-001：会话窗口根背景为 `surface-window`（与用量/设置/代理面板一致），不再整屏 `surface` 灰底。
- [ ] AC-002：工作台/会话库内层根背景为 `surface-window`，会话卡片/内容区为第二色（`surface-raised`），两色可辨。
- [ ] AC-003：会话卡片间距与发丝线在明暗双主题下清晰（无卡片贴边/间距模糊）。
- [ ] AC-004：会话面板既有测试全绿（含改造后新增的背景/间距断言）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：组件单测断言根容器/卡片背景 token 类；web e2e 断言 computed background 两色可辨。

## 上下文区

- 来源：用户观察（2026-08-11：会话面板背景与其他面板不统一，卡片间距与 demo 有差异）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 像素级视觉一致性：人工对照 demo 参考图，不写自动断言。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 单测：断言 SessionShell/WorkspaceView/SessionLibrary 根容器含 `bg-[var(--color-surface-window)]`、SessionPane 卡片含第二色类。
- web e2e：断言会话窗口 computed 根背景 ≠ 卡片背景。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：改背景色影响会话窗口视觉基线；`gap-px` 发丝线调整影响卡片间距。
- 回退：样式级改动可逐组件回退。

### 依赖与约束

- 与 t313（面板按钮/路由）、t314（槽位 badge）不重叠，但同一会话窗口组件，若并行执行注意合并冲突。

### Finalization 时更新的 blueprint

- 无

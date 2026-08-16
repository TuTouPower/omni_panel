# Task spec

## 背景

用户审查 Session 窗口截图发现背景色层次混乱：卡片背景（实测 #262b34 = `surface-raised`）比窗口亮两档、侧栏用无 token 依据的 `color-mix(window 70%, surface 8%)`、窗口/侧栏/卡片三套底色肉眼可辨。DESIGN.md「Colors」节已有权威规定：暗色下窗口 `surface-window` #181b22、内容卡片 `surface-card` #1f232c 仅略亮一档，`surface-raised` 只用于 hover 铺底/分段控件选中块/徽章灰底，不作面板背景。实现偏离了规范，且用户要求审计**所有窗口**统一回归。

## 契约区

### 范围

- 会话窗口（SessionShell/WorkspaceView/SessionRail/SessionPane 等）：卡片背景 `surface-raised` → `surface-card`；SessionRail 去掉 color-mix 背景，等于 `surface-window`（保留 border-r 发丝分隔）。
- 审计其余窗口（用量面板 PopupView、设置 SettingsView、Agent 统计、托盘菜单、会话库）的面板级背景类名，同类漂移（`surface-raised` 用作整面背景、无 token 依据的 color-mix 背景色）一并修正。
- 统一规则：窗口/侧栏/主区大背景 = `surface-window`；内容卡片 = `surface-card`；`surface-raised` 仅作交互态（hover、选中块、徽章底）。
- 创建期审计已定位的已知位点：`SettingsView.tsx:435`、`SessionShell.tsx:107/111` 存在与 SessionRail 同值的无 token 依据 color-mix 底色，一并修正。

### 非范围

- 不改 token 定义值本身（DESIGN.md front matter 与全局 `@theme` 数值不动）。
- 不改布局、圆角、描边宽度、阴影；不改亮色主题的 token 映射关系。
- 不重构组件结构；会话卡片内部元素（消息气泡、代码块等）的局部底色不在本 task。

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

- [ ] AC-001：暗色主题下会话窗口内容卡片的背景解析为 `surface-card`（#1f232c），不再以 `surface-raised` 作为卡片整面背景。
- [ ] AC-002：会话窗口侧栏背景解析等于 `surface-window`，`SessionRail` 容器不再含 color-mix 背景色。
- [ ] AC-003：代码库内面板级容器（窗口外壳、侧栏、主区、卡片）不再存在把 `surface-raised` 用作整面背景、或无对应 token 的 color-mix 背景字面量（grep 审计覆盖用量面板/设置/Agent 统计/托盘/会话库，审计清单写入上下文区）。
- [ ] AC-004：hover 铺底、分段控件选中块、徽章灰底等交互态仍使用 `surface-raised`，未被本 task 一并抹掉。
- [ ] AC-005：[deploy] 暗色主题下打开会话/设置/用量面板窗口人工目检：窗口与侧栏同底、卡片仅略亮一档，无第三档突兀底色。
- [ ] AC-006：现有单测与 e2e 全部通过。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- AC-001/002/004：组件测试断言类名/token 引用，可自动测试。
- AC-003：grep 全仓审计，可自动执行；审计清单落文档。
- AC-005：视觉统一性需人工目检，标 `[deploy]`。

## 上下文区

- 来源：用户需求（2026-08-16 截图审查，PixPin_2026-08-16_00-51-19.png 背景色质疑）；DESIGN.md:374-392「Colors」节为权威依据

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 各窗口暗色下最终视觉效果：属像素级观感，由 AC-005 人工目检覆盖，不写快照测试。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 组件测试：断言 SessionPane 卡片容器类名含 `surface-card` 语义、SessionRail 容器类名不含 color-mix 背景。
- grep 审计：`bg-[var(--color-surface-raised)]` 与 `color-mix` 背景在面板级容器的残留扫描，结果清单写入本文件上下文区。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

无

### 风险与回退

- 风险：其它窗口可能存在依赖「卡片比窗口亮两档」观感的现有设计（如设置页卡片嵌套），改色后局部对比变弱——审计时逐处记录并按两级规则执行，视觉由 AC-005 兜底。
- 回退：git 还原类名改动即可，无数据迁移。

### 依赖与约束

- 与 t411/t412/t413 同触会话窗口文件，顺序由 task-schedule 排；建议本 task 先行（背景是其它视觉 task 的底色前提）。

### Finalization 时更新的 blueprint

- `docs/blueprint/decisions.md`：记录「面板背景两级（window/card），raised 仅交互态」为长期约束（若已有等价条目则不重复）。

### AC-003 审计清单（t406 实施）

| 路径 | 原状态 | 处置 |
|---|---|---|
| `SessionPane` conversation-pane | `surface-raised` 整面 | → `surface-card` |
| `SessionRail` 容器 | color-mix window70/surface8 | → `surface-window` |
| `SessionShell` rail-toggle 行/按钮 | 同上 color-mix | → `surface-window`（hover raised） |
| `SettingsView` settings-sidebar | 同上 color-mix | → `surface-window` |
| `SessionCard` | `Card raised` | 去 raised → 默认 card |
| `SessionRow` | `surface-raised` 整面 | → `surface-card` + hover raised |
| PopupView / TokenStatsView 外壳 | 已是 surface-window | 无改 |
| toast/dock 半透明 color-mix | window 浮层 | 保留（非面板整面） |
| Segmented/Switch/Progress/chip/hover | surface-raised | 保留（AC-004） |

面板级 `color-mix(window 70%, surface 8%)` 残留：零。

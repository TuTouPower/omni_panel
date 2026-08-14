# Task spec

## 背景

四个面板的标题栏实现不一致：Settings 已用统一 `PanelTitleBar` panel 形态；Usage（popup）完全自绘 `popup-view/TitleBar.tsx` 且面板导航顺序错位（自身按钮置首）；Agent（`TokenStatsView.tsx`）用通用形态手写复制了 panel 形态（标题+状态+筛选器+导航+窗口控制全塞 `header_actions`）；Session（`SessionShell.tsx`）rail-toggle 独占标题栏左侧 220px、中间 `session-tabs` 页签绝对定位自绘，未接入共享插槽。统一目标：左上 `icon + Omni Panel - <panel_name>`、右上固定顺序「刷新 设置 用量 代理 会话」、中间各面板自己的按钮/状态、字号颜色背景一致。

## 契约区

### 范围

- 增强 `src/renderer/components/ui/PanelTitleBar.tsx`：新增中间插槽（面板自己的按钮/页签）、标题后扩展区（面板状态）、刷新语义参数化（刷新当前面板 vs 刷新全部）、窗口控制插槽（允许 popup floating 用「隐藏到托盘」替代 min/max/close）。
- 将 `src/renderer/views/popup-view/TitleBar.tsx` 迁移为共享 `PanelTitleBar` panel 形态（`PopupView.tsx:698` 改传 `panel="Usage"`），删除旧自绘标题栏，面板导航顺序对齐为「设置 用量 代理 会话」。
- 将 `src/renderer/views/TokenStatsView.tsx:652-876` 从通用形态（`title` + `actions` 手写）迁移到 panel 形态，标题/状态走扩展区、筛选器走中间插槽、导航与窗口控制由 PanelTitleBar 提供。
- 将 `src/renderer/components/session-shell/SessionShell.tsx:47-119` 的 rail-toggle 下移一行（不再占用标题栏左侧 220px），`session-tabs` 页签迁入 PanelTitleBar 中间插槽；rail-toggle 背景色不在此改动（归 t381）。
- `src/renderer/views/SettingsView.tsx` 作为基准，仅核对，不强制改。

### 非范围

- 不修改各面板标题栏下方的业务内容与数据逻辑。
- 不涉及托盘菜单 `TrayMenu.tsx`（非面板标题栏）。
- 不改 `SessionRail.tsx` 侧边栏与槽位卡片的背景色层级（属 t381）。

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

- [ ] AC-001：四个面板（Settings / Usage / Agent / Session）标题栏渲染同构——左上 `icon + "Omni Panel - <panel>"`，右上导航按钮顺序一致为「刷新 设置 用量 代理 会话」（刷新在首位，当前面板自身按钮不置首）。
- [ ] AC-002：用量面板在 floating 模式下关闭按钮触发「隐藏到托盘」（`window.usageboard.main_panel.hide()`），非 floating 与其余面板关闭触发 `window.usageboard.window.close()`；min/max 行为不变。
- [ ] AC-003：Agent 面板标题栏状态（updatedAgo / sourceIssues / refreshing / error）迁移后仍正常渲染，筛选器（工具/平台/模型/指标/粒度/时间范围）仍可用且数据请求行为不变。
- [ ] AC-004：Session 面板 rail-toggle 位于标题栏下方独立一行，`session-tabs`（工作台 / 会话库）仍可切换且当前页签高亮正确。
- [ ] AC-005：web 端四面板导航仍为原生 `<a href="#route">`（`#usage` / `#setting` / `#agent` / `#session`），桌面端为 Button + `onNavigate`，两端按钮顺序一致。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：渲染结构、按钮顺序、导航点击、窗口控制调用均可用 vitest + testing-library + mock `window.usageboard` 断言；窗口控制的真实系统行为（真正最小化/关闭）不属本 task 范围，单测断言调用即可。

## 上下文区

- 来源：p150（`docs/pending/todo/p150_popup_titlebar_panel_button_order.md`，标题栏统一主点 + 面板导航顺序错位 + Session rail-toggle 下移）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 真实窗口系统行为（实际最小化/最大化/关闭进程）：Electron 原生能力，单测无法覆盖，依赖现有 e2e 门控；不新增对应断言。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 按项目默认（vitest + testing-library，jsdom）。`window.usageboard` 用现有 `install_history_usageboard` / mock 桩；断言渲染输出 DOM 的标题栏结构、导航按钮 `aria-label` 顺序、窗口控制按钮点击调用的 `window.usageboard.*` 方法。
- 更新 `popup_view.test.tsx:340` 顺序断言为正确顺序；在 `PanelTitleBar.test.tsx` 补中间插槽 / 刷新语义 / 窗口控制插槽用例；`token_stats_header.test.tsx` 补面板导航顺序断言；`SessionShell.test.tsx` 补标题栏结构断言。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：popup 迁移后窗口控制语义（hide vs close）出错，导致用量面板关闭按钮回归为销毁窗口；标题栏结构改动导致既有面板交互测试失败。
- 回退：git 回退本次改动；窗口控制调用由单测锁定（`window.usageboard.main_panel.hide()` vs `window.usageboard.window.close()`）。

### 依赖与约束

- 与 t381（SessionRail 背景色）文件不重叠：本 task 只动 SessionShell 的 rail-toggle 结构下移，t381 动 SessionRail.tsx 与 SessionShell.tsx rail-toggle 的背景色；并行时若 t381 先合，本 task 合并时只改结构不覆盖背景色，反之亦然。

### Finalization 时更新的 blueprint

- `DESIGN.md`：如标题栏统一后有新增中间插槽/窗口控制插槽的组件契约，同步在 `components.panel-titlebar` 附近补充说明；无则写「无」。

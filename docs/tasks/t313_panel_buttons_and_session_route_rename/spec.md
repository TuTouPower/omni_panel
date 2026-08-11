# Task spec

## 背景

会话历史面板（SessionShell）标题栏按钮存在多处一致性问题：面板切换按钮顺序各面板不统一（PanelTitleBar 按 `["Usage","Agent","Session","Settings"]` 过滤渲染，popup 独立 TitleBar 顺序不同），用户期望所有面板统一固定序「刷新 设置 用量 代理 会话」且当前面板隐藏；会话面板按钮未贴窗口右上角（header 内 tab 导航 `ml-auto` 挤占）；会话面板 URL hash 为旧命名 `#history`（t210-t212「会话历史」时代），应为 `#session`，同源 `history-*` CSS 类名残留。登记 p139。

## 契约区

### 范围

- PanelTitleBar 面板切换按钮固定序「设置 用量 代理 会话」（刷新恒在首位）；当前面板按钮隐藏；设置面板不渲染刷新按钮
- popup 独立 TitleBar（用量面板）按钮顺序与 PanelTitleBar 对齐（统一「刷新 设置 用量 代理 会话」语义）
- 会话面板（SessionShell）header 布局调整，使面板按钮区贴窗口右上角
- 路由标识 `history` → `session` 全面改名：`use-route.ts` VALID_ROUTES、`App.tsx` case、`window-manager.ts` WINDOW_CONFIGS/PANEL_TITLES、`preload/route_api.ts`、`preload/index.ts`、`web/usageboard-web.ts`、`main/index.ts`
- `history-*` CSS 类名 → `session-*`（SessionShell 及关联组件/e2e 选择器）
- `Icon.tsx` 的 `chat_square` 恢复 t274 前手绘聊天气泡样式（引回 `assets/ui/message-chat-square.svg` 或内联等价 path）
- PanelTitleBar 的 Usage 切换按钮 icon 由 `dashboard` 改 `clock_forward`（时钟快进，lucide ClockArrowUp）
- SettingsView 移除左上角返回按钮（`aria-label="返回"` 的 ghost Button 及 `goBack` 关联导航；确认无其它调用方残留）
- 同步更新受影响测试（窗口路由、web 导航、session-panel e2e、route_api、usageboard-web、icon、PanelTitleBar、SettingsView）

### 非范围

- 会话历史数据/核心模块重命名（session-history IPC 模块、session-locator 等内部命名不动）
- t274 手绘→lucide 收口决策整体回退（仅 `chat_square` 例外恢复手绘；Agent `chart` / Settings `gear` 等保持 lucide）

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

- [ ] AC-001：任一非设置面板的 PanelTitleBar 渲染的切换按钮顺序为「设置 用量 代理 会话」（排除当前面板后），刷新按钮在首位；设置面板渲染的切换按钮为「用量 代理 会话」且无刷新按钮
- [ ] AC-002：popup（用量面板）标题栏切换按钮顺序与 PanelTitleBar 语义一致（排除当前面板后：设置 代理 会话），刷新在首位
- [ ] AC-003：会话面板窗口 header 内面板按钮区位于窗口右上角（非被 tab 导航挤占中部）
- [ ] AC-004：会话面板窗口 URL hash 为 `#session`（不再 `#history`）；`window.location.hash` 切到会话面板用 `#session`；`#history` 不再作为合法路由
- [ ] AC-005：代码库无残留 `history` 路由标识或 `history-*` CSS 类名（src 与 tests/e2e 中作为会话面板标识/类名的位点）；全量 `pnpm test` + `pnpm lint` 通过
- [ ] AC-006：PanelTitleBar 渲染的四面板切换按钮中，「用量面板」按钮使用 `clock_forward`（lucide ClockArrowUp）icon，不再使用 `dashboard`
- [ ] AC-007：`Icon name="chat_square"` 渲染 t274 前手绘聊天气泡 SVG（含原 `message-chat-square.svg` 特征 path），非 lucide MessageSquare；popup 主界面会话按钮、托盘会话入口同步生效
- [ ] AC-008：SettingsView 渲染结果不含 `aria-label="返回"` 按钮；返回导航（goBack）不再可达

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：渲染断言（按钮顺序/存在性）、路由断言（#session）、全量测试与 lint。

## 上下文区

- 来源：p139（2026-08-11 核实：t210-t212 命名残留 + 面板实现不一致）；p131（2026-08-11 核实：t274 afd34807 收口 icon 至 lucide）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- `ui.test.tsx`/PanelTitleBar 测试：按钮顺序 + 设置面板无刷新断言 + Usage 按钮 icon 为 clock_forward
- `popup` TitleBar 测试：按钮顺序断言
- `icon.test.tsx`：补 `chat_square` 渲染手绘 SVG 断言（含特征 path 或数据）
- `settings_view_general.test.tsx` 或 SettingsView 测试：断言无返回按钮
- `window_manager.test.ts`：`#history` → `#session` 断言更新
- `panel_navigation.spec.ts` / `session_panel.spec.ts` / `usageboard-web.test.ts` / `route_api.test.ts`：路由 + CSS 类名同步
- 回归：全量测试 + lint

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：路由改名波及 e2e 与 preload 选择逻辑，需全量同步；CSS 类名改名影响样式选择器，需逐一核对
- 回退：改动可整段回退；测试同步更新后回归守护

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无

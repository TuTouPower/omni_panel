# Task spec

## 背景

web 端（浏览器连 local-api）右上角面板互跳按钮、Usage 标题栏设置/代理面板按钮、设置-关于页外链卡片按钮均无法鼠标中键/Ctrl+Click 新开标签页。根因：web 端导航/外链语义实现为 `<button onClick>` + JS 改 hash（`window.location.hash = "setting"/"agent"/"history"`）或 `window.open`；浏览器仅对原生 `<a href>` 支持中键/Ctrl+Click 新开标签页。已确认同类位点 3 处（p137）。

## 契约区

### 范围

- web 端（`is_web()` 为真）面板互跳按钮渲染为原生 `<a href="#{route}">`：PanelTitleBar 的 Usage/Agent/Session/Settings 互跳图标（Usage→`#usage`、Agent→`#agent`、Session→`#history`、Settings→`#setting`）。
- web 端 popup-view/TitleBar 的设置与代理面板按钮渲染为 `<a href="#setting">` / `<a href="#agent">`。
- web 端设置-关于页外链卡片渲染为 `<a href target="_blank" rel="noopener noreferrer">`。
- 桌面端（非 web）行为不变：仍为 `<button onClick>` 调用 window.open 系列桥方法。
- 左键点击后目标路由切换行为与现状一致（`#setting`/`#agent`/`#history`/`#usage` 各自路由挂载不变）。

### 非范围

- 不改 `use_panel_navigation` / `usageboard-web` 的 open 桥方法（桌面端 window.open 路径与 web 端 `sessionHistory.open` 的 onFocus 分发保持原样）。
- 不处理桌面端按钮（桌面无浏览器中键语义）。
- 不引入通用可点击外链组件或对其它按钮做链接化改造。

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

- [ ] AC-001：web 端 Agent 面板互跳图标（Usage/Session/Settings 三个）均渲染为带 `href` 的原生链接，href 分别为 `#usage`、`#history`、`#setting`；左键点击后 hash 切换至对应路由且对应面板挂载。
- [ ] AC-002：web 端 Usage 面板标题栏的设置、代理面板按钮渲染为带 `href` 的原生链接（`#setting`、`#agent`），左键点击后 hash 切换至对应路由。
- [ ] AC-003：web 端设置-关于页各外链卡片渲染为带 `target="_blank" rel="noopener noreferrer"` 的原生链接，href 指向对应 `omnipanel.app` 页面；左键点击在新标签打开。
- [ ] AC-004：web 端所有链接的鼠标中键 / Ctrl+Click 可被浏览器按原语义处理（新开标签页），不触发 JS onClick 拦截。
- [ ] AC-005：桌面端（`data-web` 不存在）PanelTitleBar 互跳按钮、popup TitleBar 设置/代理按钮、about 外链卡片仍为按钮点击行为，中键无链接语义（与现状一致）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- AC-001/002/003/005：可用组件测试断言 web 分支渲染 `<a>` 的 href/target/rel，桌面分支仍为 `<button>`；web e2e 验证左键 hash 切换。
- AC-004：渲染断言（链接无 onClick 拦截、有 href）足以覆盖「浏览器原生处理中键」的静态前提；真实中键/Ctrl+Click 新开标签页为浏览器原生行为，需人工环境验证，标注 `[deploy]`。

## 上下文区

- 来源：p137（2026-08-11，task-bug 分析结论与 3 处已确认同类位点）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- AC-004 真实中键/Ctrl+Click 行为：浏览器原生，不在 jsdom/playwright 断言；以「渲染为 `<a href>` 且无 onClick 拦截」作为静态前提覆盖。
- 桌面端中键语义：桌面无浏览器标签页概念，不写中键测试。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- PanelTitleBar：组件测试在 `data-web` 存在/缺失两态断言互跳元素 tagName 为 A（web，断言 href/target/rel）或 BUTTON（桌面）；`data-web` 用 `document.documentElement.setAttribute/removeAttribute` 控制。
- popup TitleBar：复用现有 popup 视图测试工具，断言 web 态设置/代理按钮为 `<a>`（href/target/rel）、桌面态为 `<button>` 且 onClick 仍调用对应 open。
- about_section：断言外链卡片 web 态为 `<a>` 且 href/target/rel 正确；桌面态仍为 `<button>` 且 onClick 调用 `window.open`。
- web e2e：`panel_navigation.spec.ts` 互跳断言从 `getByRole("button")` 改为 `getByRole("link")`；补左键点击后 hash 断言（沿用现有 hash poll）。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- web 端 `sessionHistory.open("","","")` 在无具体会话时对 onFocus 订阅者的分发是否产生可见副作用：`UNVERIFIED-SPIKE`，执行期用最小对照（空 loc 分发为空）核实后删除标记。

### 风险与回退

- 风险：`<a>` 默认样式（下划线/蓝色）与现有图标按钮视觉不符；链接默认 navigate 与 `[-webkit-app-region:no-drag]` 窗口控制共存无冲突但需复查。
- 回退：改动限于渲染层与测试；若视觉/行为回归，回退渲染分支即可，桥方法与路由未动。

### 依赖与约束

- 无。`is_web()` 已存在（`data-web` attr），web/桌面分支已有先例。

### Finalization 时更新的 blueprint

- 无

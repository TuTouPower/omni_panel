# Task spec

## 背景

macOS 上面板窗口（setting/agent/session/dev）是 `frame: false` 无边框窗口：窗口控制在渲染层自绘并放在标题栏**右侧**（最小化/最大化/关闭），左上角画 24px logo + 「Omni Panel - X」。不符合 macOS 规范——系统窗口控制在左上角（close/minimize/zoom），绿点是 zoom/全屏而非「最大化」；应用也没有自己的菜单，⌘W/⌘M/⌃⌘F 缺失。

用户审核结论（2026-09-17）：去掉左上角 logo 与软件名，只留面板名（英文），macOS 采用原生交通灯 = 方案 **A1**（面板名靠左、紧贴交通灯）。静态预览已由用户在浏览器确认：`.scratch/macos_titlebar_preview.html`。

代码证据：`src/main/window/window-manager.ts:34-105`（全部 `frame:false`）、`src/renderer/components/ui/PanelTitleBar.tsx:47-112`（右侧自绘三连 + logo + 全名）、`src/main/index.ts:1054-1063`（WINDOW_MINIMIZE/MAXIMIZE/CLOSE IPC）；全仓无 `Menu.setApplicationMenu`（走 Electron 默认菜单）。

## 契约区

### 范围

- macOS：setting/agent/session/dev 窗口改用系统边框 + `titleBarStyle: "hidden"`，使原生交通灯可见；标题栏内容左侧预留交通灯区域，不与其重叠。
- 标题栏（全平台）：不再渲染 logo 与「Omni Panel - 」前缀，只显示面板名（Settings / Usage / Agent / Session / Dev，英文）。
- macOS：不渲染自绘 min/max/close；Windows/Linux 保持自绘三连。
- macOS：新增应用菜单，至少含 ⌘W（usage 面板=隐藏到托盘、其它窗口=关闭）、⌘M 最小化、⌃⌘F 全屏、⌘H 隐藏、⌘Q 退出。
- web 构建不渲染窗口控制（保持既有行为）。

### 非范围

- 用量托盘弹窗（popup / floating）的窗口 chrome：保持无边框、无交通灯，标题栏不留交通灯区域。
- 图标体系、强调色/主题体系。
- Windows / Linux 窗口控制的位置与形态。
- 双击标题栏的系统偏好行为（见未知契约清单）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：macOS 上 setting/agent/session/dev 窗口显示系统交通灯，标题栏内容不与其重叠。
- [ ] AC-002：所有面板标题栏不再出现 logo 与「Omni Panel - 」前缀，只显示面板名（Settings/Usage/Agent/Session/Dev）。
- [ ] AC-003：macOS 上不渲染自绘的最小化/最大化/关闭按钮；Windows/Linux 仍渲染这三个按钮。
- [ ] AC-004：macOS 应用菜单提供 ⌘W（usage 面板触发隐藏到托盘，其它窗口触发关闭）、⌘M 最小化、⌃⌘F 全屏、⌘H 隐藏、⌘Q 退出。
- [ ] AC-005：窗口系统标题仍为 `Omni Panel - <panel>`（Mission Control / 窗口菜单可读）。
- [ ] AC-006：web 构建不渲染窗口控制按钮（不回归）。
- [ ] AC-007：[deploy] macOS 打包版肉眼确认交通灯位置与悬停符号正常、面板名与交通灯对齐、菜单快捷键可用。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-001：不可自动测试（需真实 macOS 窗口）；替代：`window_manager` 单测断言 macOS 下面板窗口为系统边框 + `titleBarStyle: hidden`，渲染层单测断言标题栏左侧预留交通灯区域。
- AC-002 / AC-003 / AC-006：渲染层单测（注入 platform）断言文案与按钮可见性。
- AC-004：主进程菜单模板单测：断言 accelerator 与点击分流（usage 面板隐藏 vs 其它窗口关闭）。
- AC-005：`window_manager` 单测断言 `PANEL_TITLES`。
- AC-007：deploy 级人工验证（打包版肉眼）。

## 上下文区

- 来源：用户审核（2026-09-17）+ 静态预览 `.scratch/macos_titlebar_preview.html`（用户确认 A1）；无 pNNN。

### 有意不测

- 真实交通灯的点击 / ⌥-click 缩放 / 全屏动画 / Mission Control 行为：需真实窗口与人工操作，归 AC-007 deploy 验证。

### 测试策略

- 单测：`tests/unit/main/window_manager.test.ts`（chrome 配置与标题）、`tests/unit/renderer/components/PanelTitleBar.test.tsx`（标题文案 + 按 platform 决定按钮可见性）、新增菜单模板单测。
- 既有断言更新（标题文案/控制按钮相关）：`tests/smoke/renderer-smoke.test.tsx`、`tests/unit/renderer/views/{token_stats_header,popup_view,popup_view_height,settings_view_general}.test.tsx`、`tests/e2e/packaged/smoke.spec.ts`、`tests/e2e/web/*`。
- 黑盒：打包版肉眼 + 既有 e2e（运行前须用户许可，见 `docs/blueprint/testing.md` 干扰分级）。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- Electron `frame: true` + `titleBarStyle: "hidden"` 在 macOS 上交通灯的实际位置与内容区起始 x：UNVERIFIED-SPIKE，打包版实测；若与预留宽度不符则调整留白。
- `-webkit-app-region: drag` 区域双击是否触发系统 zoom/minimize 偏好：UNVERIFIED-SPIKE，实测后决定是否需要额外处理。

### 风险与回退

- 风险：交通灯与标题栏内容重叠/错位；⌘W 误关托盘弹窗（应隐藏而非销毁）；菜单与既有 IPC 语义冲突。
- 回退：窗口 chrome 配置、标题栏渲染、菜单三处互相独立，可单独 revert；菜单异常时临时 `Menu.setApplicationMenu(null)` 回退到 Electron 默认。

### 依赖与约束

- t494 同改 `PanelTitleBar.tsx`，必须串行：t494 depends_on t493。
- 仅 macOS 行为变化；Windows/Linux 输出必须保持不变（既有 e2e 覆盖）。

### Finalization 时更新的 blueprint

- `DESIGN.md`：`panel-titlebar` 条目——去掉 logo/品牌串，明确 macOS 左侧交通灯留白与只显示面板名。
- `docs/specs/window-management.md`：窗口 chrome（macOS 原生交通灯）与菜单快捷键。

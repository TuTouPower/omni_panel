# 会话窗口外壳（SessionShell）

需求：把会话历史窗口改为单壳双页签外壳，落地 frontend_demo（SessionGrid demo）设计系统基座，为工作台槽位模型、会话库、摘选托盘提供容器与视觉底座。

## 窗口形态

- route `history` 单窗口不变（window-manager 尺寸/生命周期不变），渲染根组件为 `SessionShell`（`App.tsx` `case "history"`）。
- 固定 52px 顶栏：左品牌（logo + OmniPanel）、中「工作台 / 会话库」居中页签、右「用量面板」「代理面板」跳转按钮。
- 两个页签面板**常驻挂载**，切换只改 `data-active` 的 CSS `display` 显隐（`.shell-pane[data-active="false"] { display: none }`），各页内部状态（已打开会话槽位、滚动位置）切回不丢。
- 工作台页签 = `WorkspaceView`（t224 槽位模型，见 `workspace.md`）；会话库页签空态占位（非报错、非空白）。

## 设计系统（demo 落地）

- 语义色 token 取 demo design.md §2 原值：canvas/panel/raised/inset 背景、subtle/strong 边框、primary/secondary/muted 文本、lime 强调、danger、diff add/del；作用域限定 `.session-shell`，不污染其它窗口。
- **暗色为默认**；`html[data-theme="light"] .session-shell` 覆盖为浅色 token。
- 旧 token 桥接：`.session-shell` 内部把 demo token 映射到旧变量名（`--win-bg/--text/--card-bg/--accent/--bg-hover/--border` 等），使会话历史视图既有样式直接继承 demo 视觉。
- agent 识别色 `--agent-{claude,grok,opencode,kimi,codex,cursor,aider}` 明暗两套。
- 字体：Noto Sans SC → PingFang SC / 微软雅黑 / 系统 sans-serif；display Space Grotesk → 系统回退；等宽 JetBrains Mono → Cascadia Code / Consolas / 系统 monospace。不新增字体资产。
- 6px 自定义滚动条、lime 选区色、0.625rem 圆角密度体系随 demo。

## 主题

- 会话窗口调用共享 `useTheme()`（`src/renderer/lib/theme.ts`），通过 `window.usageboard.config.get()` 读取全局 `config.theme`，并订阅 `event.onThemeChange` 同步已打开窗口；不读取或写入会话窗口独立主题键。
- 首帧主题由 preload 根据 renderer URL 的 `ou_theme` 参数设置；挂载后的全局 hook 负责配置读取、`system` 模式解析和运行时变更。
- 会话窗口不提供独立主题切换入口，主题跟随软件全局设置。

## 入口与导航

- 「用量面板」按钮 → `tray.open_panel()`；「代理面板」按钮 → `tokenStats.open()`；与旧工具栏跳转入口能力等价，窗口未开则打开/聚焦对应窗口。
- 窗口内不落地 demo 的拖文件导入与 ⌘K 命令面板入口（无占位）。

## 硬约束

- 设计系统只作用于会话窗口（`.session-shell` 作用域）；不改用量面板/代理面板/设置面板/托盘视觉与结构。
- 会话窗口主题跟随全局 `config.theme` 与主题事件；页签状态仅存 renderer 组件状态，不新增会话窗口独立主题存储或主进程状态。

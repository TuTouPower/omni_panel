# 会话窗口外壳（SessionShell）

需求：把会话历史窗口改为单壳双页签外壳，落地 frontend_demo（SessionGrid demo）设计系统基座，为后续工作台槽位模型、会话库、摘选托盘提供容器与视觉底座。窗口内工作台页签暂承载既有 6 栏会话视图。

## 窗口形态

- route `history` 单窗口不变（window-manager 尺寸/生命周期不变），渲染根组件由 `SessionHistoryView` 换为 `SessionShell`（`App.tsx` `case "history"`）。
- 固定 52px 顶栏：左品牌（logo + OmniPanel）、中「工作台 / 会话库」居中页签、右「用量面板」「代理面板」跳转按钮 + 明/暗主题切换。
- 两个页签面板**常驻挂载**，切换只改 `data-active` 的 CSS `display` 显隐（`.shell-pane[data-active="false"] { display: none }`），各页内部状态（已打开会话栏、滚动位置）切回不丢。
- 工作台页签 = 既有 `SessionHistoryView` 整棵挂载；会话库页签本 task 只做空态占位（非报错、非空白）。

## 设计系统（demo 落地）

- 语义色 token 取 demo design.md §2 原值：canvas/panel/raised/inset 背景、subtle/strong 边框、primary/secondary/muted 文本、lime 强调、danger、diff add/del；作用域限定 `.session-shell`，不污染其它窗口。
- **暗色为默认**；`html[data-theme="light"] .session-shell` 覆盖为浅色 token。
- 旧 token 桥接：`.session-shell` 内部把 demo token 映射到旧变量名（`--win-bg/--text/--card-bg/--accent/--bg-hover/--border` 等），使 `SessionHistoryView` 既有样式直接继承 demo 视觉，无需改其内部 CSS。
- 字体：Noto Sans SC → PingFang SC / 微软雅黑 / 系统 sans-serif；display Space Grotesk → 系统回退；等宽 JetBrains Mono → Cascadia Code / Consolas / 系统 monospace。不新增字体资产。
- 6px 自定义滚动条、lime 选区色、0.625rem 圆角密度体系随 demo。

## 主题

- `useSessionShellTheme`（`src/renderer/lib/session-shell/theme.ts`）独立于全局 `theme.ts`：默认暗色、持久化到 `localStorage omni_session_theme`、切换设 `html[data-theme]`，**不写全局 `config.theme`**（不与其它窗口全局主题互相干扰）。
- 持久化主题在 `useLayoutEffect` 同步应用（浏览器绘制前覆盖 preload 首帧按系统 `ou_theme` 写入的 `data-theme`），避免首帧闪烁。
- 重启后保持上次选择；全新安装默认暗色。

## 入口与导航

- 「用量面板」按钮 → `tray.open_panel()`；「代理面板」按钮 → `tokenStats.open()`；与旧工具栏跳转入口能力等价，窗口未开则打开/聚焦对应窗口。
- 窗口内不落地 demo 的拖文件导入与 ⌘K 命令面板入口（无占位）。

## 硬约束

- 设计系统只作用于会话窗口（`.session-shell` 作用域）；不改用量面板/代理面板/设置面板/托盘视觉与结构。
- 主题切换、页签状态仅存 renderer 侧（localStorage / 组件状态），不新增主进程状态。

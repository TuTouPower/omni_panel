# Task review t223（reviewer_focus: 代码）

- task：`t223_session_shell_design_base`
- spec：`docs/tasks/t223_session_shell_design_base/spec.md`
- diff_anchor：`f514bd7cdaa88ca2a9d58e8fddb6fc40ec26a865`
- target：`git diff f514bd7cdaa88ca2a9d58e8fddb6fc40ec26a865`
- round：1
- reviewed_at：2026-08-06 10:05 UTC+8

## Findings

### t223_code_f001 - 旧 token 桥接不完整：`--accent` / `--bg-hover` 未桥接，会话窗口残留旧主题颜色

- 严重度：minor
- 锚点：AC 4（「会话窗口整体应用 demo 视觉体系：…… lime 强调色……；窗口内不出现旧主题残留样式」）
- 位置：`src/renderer/styles/session-shell.css`（bridge 块，约 39-63 行）；触发于 `src/renderer/styles/session-history.css:107` 与 `:137`
- 问题：`.session-shell` 旧 token 桥接定义了 `--win-bg`、`--text`、`--border`（经 `--card-border` 链）、`--blue: var(--accent-lime)` 等，但**漏了** `--accent` 与 `--bg-hover` 两个 session-history 使用的 token。结果：
    - `.history-col-action`（栏头「全选/取消」动作链接）→ 落到回退值 `#2563eb`（非 demo 的蓝色），而非 lime；
    - `.history-msg-row:hover`（消息行 hover）→ 落到回退值 `#f2f2f2`（近白）。暗色为默认主题，hover 任意消息行会闪出亮灰块，视觉上即 AC4 明令禁止的「旧主题残留样式」。
    - 已用 ripgrep 确认项目内无其它 `--accent` / `--bg-hover` 定义，回退必然生效；`--border` 因 `:root` 层 `--border: var(--card-border)` + 桥接重定义 `--card-border` 可正确解析，无需处理。
- 建议：在 dark/light 两块 bridge 各补一行，如 `--accent: var(--accent-lime)`、`--bg-hover: var(--bg-raised)`（dark 下用 raised 做 hover 底，light 同理）。

### t223_code_f002 - 主题切换首帧闪烁：持久化主题与系统 nativeTheme 不一致时

- 严重度：minor
- 锚点：AC 2（「重启应用后会话窗口保持上次选择的主题」——最终保持，但启动首帧先显示系统主题再跳变）
- 位置：`src/renderer/lib/session-shell/theme.ts:22-26`（effect）与 `src/preload/index.ts:38-47`（首帧 `ou_theme`）
- 问题：preload 在首帧前按 `ou_theme`（= `nativeTheme.shouldUseDarkColors`，即系统主题）同步写 `html[data-theme]`；`useSessionShellTheme` 在 React effect 阶段才用持久化的会话主题覆盖。当持久化主题 ≠ 系统主题时（例如系统暗色 + 会话已存浅色），窗口先以系统主题渲染一帧再切换，产生可见闪烁。preload 注释明确其目的就是「avoid white flash」，此实现部分抵消了该机制。属可复现的 UX 缺陷，不影响功能正确性（AC2 的「切换立即生效」与「重启保持」最终均满足）。
- 建议：在 `session-shell.css` 或 `index.html` 的 inline script 里按 `localStorage.getItem("omni_session_theme")` 提前同步 `data-theme`（preload 已先于 bundle 执行，可在其 ou_theme 逻辑后追加读取），消除首帧跳变。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：2 条（均 minor）
- 未进表的提示：
    - 文件过大：无。session-shell.css 322 行 < 400；SessionShell.tsx 107 行；SessionShell.test.tsx 129 行 < 600；theme.ts 33 行。均未达阈值。
    - 复杂度：无函数达 CC≥15；SessionShell 分支结构简单。
    - 范围外观察：会话窗口内「用量/代理面板」跳转按钮出现两处（外壳顶栏 + 原 SessionHistoryView 工具栏），IPC 调用逐字重复。AC3 同时要求顶栏新入口与「原工具栏入口不回归」，属 spec 刻意保留，不进 finding；若后续 task 收敛，可合并为共享 handler。
    - 已验证（无 finding）：display:none 切换页签后子滚动容器 scrollTop 在 Chromium 中保留（Playwright 实测 `150 → 0（hidden）→ 150`），AC1 滚动位置保留成立；新增 11 测试 + 既有 session_history_view（18）/first_paint_theme（8）/route_values（6）全部通过；typecheck / eslint 干净；spec 上下文区「未知契约清单」无残留 `UNVERIFIED` 标记。
- 总体判断：单壳双页签、主题切换与持久化、跳转按钮、会话库空态、无命令面板/拖拽入口均已按 AC 实现，现有会话能力测试不回归；仅 2 处 minor（旧 token 桥接补全、首帧主题闪烁），不阻断。
- 系统性 follow-up：无

verdict: PASS

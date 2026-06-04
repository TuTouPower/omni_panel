# 代码清理检查

_Started 2026-06-04 13:55 UTC_

---

## User

请你检查，目前项目里所有用不到的死代码都删掉。
OmniUsage UI.html 这个是核心HTML。所有这个HTML用不到的代码文件 截图 uploads 都可以删掉。这个HTML里面用户怎么点击都不会显示的内容，也可以删掉。

## Assistant

_[tool: list_files]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: grep]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: grep]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: grep]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: grep]_

_[tool: update_todos]_

Now I have a full picture. Let me set up the plan and read the exact CSS blocks to remove.

_[tool: read_file]_

_[tool: grep]_

_[tool: delete_file]_

_[tool: str_replace_edit]_

All dead code confirmed. Executing — deletions first, plus the independent icons edit:Now the components.jsx edits:

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Now settings-panel.jsx and the CSS files:

_[tool: str_replace_edit]_

_[tool: update_todos]_

_[tool: done]_

_[tool: fork_verifier_agent]_

清理完成。`OmniUsage UI.html` 加载正常，无报错。删掉的内容：

**整套文件**
- `screenshots/`（65 张）和 `uploads/`（17 个）——核心 HTML 完全没引用
- `OmniUsage Settings.html` 和 `panel-app.jsx`——旧的独立设置窗口，设置已迁移进主 UI（app.jsx 内置 `SettingsPanel` 覆盖窗口）

**死代码（点击永远到不了的内容）**
- `components.jsx`：未被渲染的 `Bar` 组件；`UsageCard` 的无用 props（`badge`、`onEnable`）；`Tab` 里从未触发的 `icon` 分支；`TokenChart` 没用到的 `range` 参数
- `settings-panel.jsx`：`AccountsPage` 未使用的 `onAdd`
- `icons.jsx`：4 个没引用的图标（clock / warn / key / clipboard）
- `ma.css`：指向不存在的 `ma-states.jsx` 的遗留样式（`.ma-window`、`.avg-badge`、`.acct-toggle`）
- `omniusage.css`：未使用的 `.app-badge`、`.app-badge.sm`、`.aa-badge`、`.tray-win-tag`、`.window.hidden`、`@keyframes popIn`

保留的支撑文件（logo、各 css/js/jsx）都是主 HTML 实际加载的。


# 代理地址设置

_Started 2026-06-14 15:03 UTC_

---

## User

设置常规里面加一个代理地址的设置.

## Assistant

_[tool: list_files]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: grep]_

_[tool: grep]_

The user wants a proxy address setting in General settings. Let me add it cleanly to the 常规 section.

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Now let me verify it renders. Let me open the UI and navigate to the General settings.

_[tool: show_html]_

_[tool: show_html]_

Let me navigate to Settings → 常规 to verify the proxy setting.

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: read_file]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: screenshot]_

The proxy setting renders well. The toggle appears mid-transition in that capture — let me re-verify the on-state is consistent.

_[tool: eval_js]_

_[tool: grep]_

This is a clear restructure of the CPA detail panel. Let me rewrite `CpaDetailPage` — left = connection config (no scroll), right = 同步范围 (scrollable), and drop the discovered-accounts column.

_[tool: str_replace_edit]_

Now the CSS — remove the scrollbar from the left config column and add the `.cpa-scope` right column.

_[tool: str_replace_edit]_

Now let me verify by opening a CPA connection's edit panel.

_[tool: eval_js]_

The iframe still has the old build cached. Let me reload it.

_[tool: show_html]_

_[tool: eval_js]_

_[tool: screenshot]_

Layout matches the request. One small fix — the "移除数据源" button wraps. Let me keep those button labels on one line.

_[tool: str_replace_edit]_

Both changes are done. I added a **代理地址** (proxy) setting under a new 网络 group in 常规, and restructured the CPA edit panel: left column holds connection config (别名 / URL / 密钥 / 状态 / 刷新) with no scrollbar, right column now holds 同步范围 (scrollable), and the 已发现账号 column is removed.

_[tool: done]_

Done. Two changes:

1. **常规 → 网络**：新增「使用代理服务器」开关，开启后显示「代理地址」输入框（支持 HTTP/HTTPS/SOCKS5）。
2. **账号 → CPA 编辑面板**：左侧只保留连接配置（别名、URL、密钥、状态、刷新、保存/移除），去掉了滚动条；同步范围移到右侧并可在账号多时滚动；已发现账号列已移除。

## User

这个删了

## Assistant

_[tool: grep]_

_[tool: read_file]_

The gray bar near antigravity is the window-resize grip (`.win-resize`) — its vertical handle sits centered on the right edge, landing around that row. I'll remove it and give the 同步范围 toggles right-edge breathing room.

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: show_html]_

_[tool: eval_js]_

_[tool: screenshot]_

The gray resize bar is gone, the 移除数据源 button is on one line, and the 同步范围 toggles now have right-edge breathing room. Both fixes are in.

_[tool: done]_

搞定。删掉了那个灰色的窗口拖拽条，同步范围的开关也跟面板右边留出了间距。


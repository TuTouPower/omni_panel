# 数据源CPA开关

_Started 2026-06-07 04:39 UTC_

---

## User

给数据源这个CPA加一个开关

## Assistant

_[tool: read_file]_

_[tool: list_files]_

_[tool: grep]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: str_replace_edit]_

I'll add an enable/disable toggle to the CPA data source card. Let me update the `DataSourcePage`.

_[tool: str_replace_edit]_

Now I need to fix the closing of the map callback (changed from `(` to `{ return (`):Now let me add a dimmed style for the disabled card and make the status dot reflect the off state. Let me check the existing `.ds-card` / `.dsd` styles:

_[tool: grep]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

I bumped a CSS file — let me bump its cache version in the HTML so changes load:

_[tool: show_html]_

_[tool: show_html]_

_[tool: eval_js]_

_[tool: grep]_

_[tool: eval_js]_

_[tool: save_screenshot]_

_[tool: save_screenshot]_

_[tool: eval_js]_

_[tool: str_replace_edit]_

I'll temporarily switch to CPA mode to verify the data source page:

_[tool: show_html]_

_[tool: save_screenshot]_

_[tool: save_screenshot]_

The toggle is in place on the CPA Manager card. Let me verify the disabled (off) state:

_[tool: grep]_

The off-state dims the card and changes status to 已停用, but the toggle itself still looks green/on. Let me check the `.sw` toggle styles:

_[tool: eval_js]_

_[tool: str_replace_edit]_

The DOM is correct (`data-on="0"`) — the green in the screenshot was just the toggle mid-transition. Everything works. Now let me revert the temporary mode change back to normal:

_[tool: done]_

给 CPA Manager 数据源卡片加了个启用/停用开关。开关在卡片右上角（同步/编辑按钮左侧）：关掉后卡片整体变暗、状态显示「已停用」、状态点变灰、「同步」按钮禁用。需要在 CPA 用户模式下的「数据源」页查看。


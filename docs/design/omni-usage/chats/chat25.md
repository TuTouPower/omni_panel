# 余额统计重组

_Started 2026-06-04 14:25 UTC_

---

## User

DeepSeek只有余额统计，把两个用量统计条改成一个，52/100。代表余额52块钱，然后自己设定的余额上限是100。GLM加一条是MCP调用量的统计，95/1000。

## Assistant

_[tool: read_file]_

## User

我上面说的这两个，不要在后面显示百分比，就显示这个分数

## Assistant

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: grep]_

_[tool: grep]_

_[tool: grep]_

_[tool: str_replace_edit]_

Now I'll make the changes. Starting with the data:

_[tool: str_replace_edit]_

Now BarRow and UsageCard in components.jsx:

_[tool: str_replace_edit]_

Now wire the props through app.jsx:

_[tool: read_file]_

Now the CSS — fraction row layout and the two new fill colors:

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Let me bump the CSS cache version so the new styles load:

_[tool: done]_

_[tool: save_screenshot]_

_[tool: save_screenshot]_

Both changes render correctly:

- **DeepSeek** now shows a single **余额 52/100** bar (green) — no percentage, just the fraction.
- **GLM** has a third **MCP 95/1000** bar (teal) added below the usage rows.
- Both fraction metrics drop the reset-time column and display the raw `value/max` instead of a percentage.

The fraction format also flows through to account-detail views (GLM's per-account MCP, DeepSeek's account card).


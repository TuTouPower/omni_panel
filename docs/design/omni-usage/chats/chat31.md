# 应用设置界面优化

_Started 2026-06-06 07:33 UTC_

---

## User

去掉设置里的点击托盘图标设置，点左键点击永远都是打开主面板。设置里面的常规，加上窗口设置，可以设置主面板的打开方式，窗口是否始终置顶，浮动窗口的高度。设置里面的账号，设置这个界面，你不要有什么乱七八糟的密钥这种东西。数据源CPA设置, 你那些已经发现的账号也没有密钥这种东西

## Assistant

_[tool: read_file]_

_[tool: list_files]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: grep]_

_[tool: grep]_

_[tool: str_replace_edit]_

Now I'll make the edits. First, the JSX — remove key columns from account rows and discovered rows, rework the General page, and update state.Now the General page and state:

_[tool: str_replace_edit]_

Now CSS — make the account rows fill space correctly with the key column gone:

_[tool: str_replace_edit]_

_[tool: done]_

Now let me verify it renders cleanly.

_[tool: fork_verifier_agent]_

Done. Changes to the settings panel:

- **托盘图标设置已移除** — 左键托盘图标永远打开主面板，不再有「点击托盘图标」选项。
- **常规页新增「窗口」分组** — 主面板打开方式（跟随系统推荐 / 弹出面板 / 浮动窗口）、窗口始终置顶、浮动窗口高度（保持窗口大小 / 跟随内容变化）。
- **账号页去掉了密钥列** — 行内只剩服务商、备注名和开关/操作。
- **数据源 CPA 详情**的已发现账号也不再显示密钥。

## User

Verifier agent check completed

## Assistant

All checks passed. The settings panel is updated as requested.


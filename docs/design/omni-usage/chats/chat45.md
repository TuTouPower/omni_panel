# 主面板UI优化

_Started 2026-06-13 20:48 UTC_

---

## User

去除主面板上总览右边的竖线。还有你现在总览和其他的厂商标签怎么不在同一行，总览怎么往下挪了半行。还有，我希望鼠标可以在总览右边的那些标签上面滑动滑动选择claude，codex, GLM之类的.这个滑动，你需要注意，是滑动标签。就他每次滑动，应该是标签框儿跳一下，跳到下一个厂商.还有总览，还有那个总览的符号，为什么在有些情况下会变成灰色？它不是一直都应该是蓝色的吗?还有MiMo的话不要用什么凭证，失效就用登录失效。关于也就参考我发你的图，要有官网 文档 问卷反馈 检查更新 支持作者这些按钮。系统托盘里也加上问卷反馈、支持作者这两个按钮

## Assistant

_[tool: list_files]_

_[tool: view_image]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: show_html]_

Let me look at the icons file and render the current state to diagnose the alignment issue.

_[tool: show_html]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: update_todos]_

This is a clear diagnosis. The bug: the "Brave Search" tab label wraps to two lines, which (via `align-items: stretch` + `flex-end`) stretched every tab and pushed 总览 down. Let me make all the fixes now.

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Now the CSS — tab alignment fix and About styles:

_[tool: str_replace_edit]_

Now app.jsx — divider removal, always-blue icon, wheel handler, and authType:

_[tool: str_replace_edit]_

Now components.jsx — auth wording + Tab title:

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Now settings-panel.jsx — MiMo auth wording and About redesign:Now tray.jsx — add 问卷反馈 and 支持作者:

_[tool: str_replace_edit]_

Now bump cache-busting versions in the HTML:

_[tool: str_replace_edit]_

Now let me render and verify the main panel tab row and the tray:

_[tool: show_html]_

_[tool: eval_js]_

Tab row is aligned, divider gone, 总览 icon blue, tray has the two new buttons. Let me verify the wheel-scroll and the About/MiMo screens:

_[tool: eval_js]_

_[tool: eval_js]_

Wheel selection works perfectly. Now let me check the About page and MiMo wording in settings:

_[tool: screenshot]_

_[tool: str_replace_edit]_

The About buttons are wrapping their text vertically. Let me fix with `white-space: nowrap`:

_[tool: str_replace_edit]_

_[tool: show_html]_

_[tool: eval_js]_

_[tool: eval_js]_

MiMo now shows "登录失效". Let me confirm the About buttons render on one line:

_[tool: screenshot]_

The About page now matches the reference — 官网 / 文档 / 问卷反馈 / 检查更新 (primary, cloud) / 支持作者 (heart) — all on one line. Everything checks out. Let me finalize.

_[tool: update_todos]_

全部改好了。来龙去脉:

- **竖线** — 已去掉总览右边的分隔竖线。
- **总览下移半行** — 根因是 "Brave Search" 标签换成两行,把整排标签撑高、再加上底对齐把总览顶了下去。改成顶对齐 + 标签单行省略号,现在总览和厂商标签严丝合缝同一行。
- **滑动选标签** — 鼠标在标签栏上滚动,选中框会一格一格跳到下一个/上一个厂商(总览→Claude→Codex→GLM…),不是自由滚动。
- **总览符号** — 之前非选中态会变灰,现在恒为蓝色。
- **MiMo** — 网页登录类服务(MiMo/Kimi)失效现在显示"登录失效",密钥/本地类仍是"凭证失效"。
- **关于页** — 按你的参考图重做:Logo、名称、版本(version 1.4.2 · win32-x64)、简介,下面一排 官网 / 文档 / 问卷反馈 / 检查更新(蓝色主按钮·云图标)/ 支持作者(❤)。
- **系统托盘** — 加了"问卷反馈""支持作者"两项。

`done` 已把文件推到你的视图,后台校验也跑起来了。

## User

滑动选标签可以循环，滑动到最后一个的时候跳转到第一个总览

## Assistant

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: show_html]_

_[tool: eval_js]_

循环已生效:滑到最后一个 Brave Search 再往下就跳回总览,从总览往上则回到最后一个。

`done` 已更新视图。


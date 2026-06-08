# 账号添加样式设计

_Started 2026-06-07 19:46 UTC_

---

## User

你现在设置一下添加账号的样式，有这么几种。DeepSeek添加一个APIKey就可以了。MIMO的话，需要让用户粘贴cookie，或者让用户通过electron的webview网页登录. 还有的像claude和codex，支持扫描本地的授权文件。你在做每个账号的拿到的数据的账号的数据标签映射，要允许用户设计。就是代码里拿到的数据的标签是什么，允许用户搞一个额外的标签代替。

## Assistant

_[tool: list_files]_

I'll explore the existing project first to understand the design system and structure before building the add-account flows.

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

Now let me look at the icons, data model, and CSS to understand the visual vocabulary.

_[tool: read_file]_

Now let me read the settings-panel CSS to understand the dialog styling vocabulary.

_[tool: grep]_

Let me find the base dialog/field styles in omniusage.css.

_[tool: read_file]_

_[tool: show_html]_

I now have a full understanding of the design system. Let me take a quick look at the current add-account flow to anchor on the visuals.

_[tool: update_todos]_

_[tool: str_replace_edit]_

Let me build. First, the data layer — add MiMo, the auth-method map, mock scan results, and raw label datasets.

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Now the icons — new UI glyphs and the MiMo vendor mark.

_[tool: str_replace_edit]_

_[tool: write_file]_

Now the centerpiece — the routed add-account dialog with all three auth bodies and the label-mapping editor.

_[tool: write_file]_

Now the styles for the new dialog elements.

_[tool: str_replace_edit]_

Now wire the picker to the new routed dialog in settings-panel.jsx.

_[tool: str_replace_edit]_

Now link the new files in the HTML.

_[tool: show_html]_

Let me verify it renders and drive through the three methods.

_[tool: get_webview_logs]_

_[tool: save_screenshot]_

No errors. Let me drive the flows and capture each method.

_[tool: save_screenshot]_

_[tool: save_screenshot]_

The picker didn't open. Let me debug the click path.

_[tool: eval_js_user_view]_

_[tool: eval_js_user_view]_

_[tool: save_screenshot]_

Let me inject a visible debug readout to inspect my own iframe.

_[tool: save_screenshot]_

The picker works — MiMo shows with its new mark. State persists, so let me click through each method from here.

_[tool: save_screenshot]_

DeepSeek (API key) looks great, with the collapsible 数据标签映射. Now MiMo (session) — let me reopen and pick it, then expand the webview + mapping.

_[tool: str_replace_edit]_

MiMo session flow (tabs → webview login) works. Minor: "打开登录窗口" wraps. Let me fix that, then capture Claude's local-file scan.

_[tool: show_html]_

_[tool: save_screenshot]_

_[tool: show_to_user]_

Reload caused a timing miss. Let me drive Claude via the async user-view path with verification at each step.

_[tool: eval_js_user_view]_

_[tool: screenshot_user_view]_

Claude scan completed (2 found rows). Let me capture it.

_[tool: str_replace_edit]_

Claude's local scan looks excellent — valid credential pre-selected, expired one flagged red. Minor wrap fix on "手动选择文件", then I'll verify the label-mapping editor expanded.

_[tool: eval_js_user_view]_

_[tool: screenshot_user_view]_

_[tool: update_todos]_

The label-mapping editor (数据标签映射) expands perfectly: raw API label `five_hour_window` → editable display name "5 小时窗口". All three auth methods plus the mapping editor work. Let me finalize.

_[tool: snip]_

_[tool: done]_

_[tool: fork_verifier_agent]_

已按授权方式区分了「添加账号」的样式，并加上了**数据标签映射**编辑器。设置 → 账号 → 添加账号，根据所选服务自动切换为三种表单：

**三种接入方式**
- **API Key**（DeepSeek、GLM、Gemini、Tavily、MiniMax）— 账号名 + 密钥（带显隐）+ 可选接口地址，附各家密钥获取位置提示。
- **网页登录 / Cookie**（MiMo、Kimi）— 顶部分段切换：「网页登录」点击弹出模拟的 electron webview（浏览器外壳 + 登录卡 → 登录后显示"已捕获会话"绿条），或「粘贴 Cookie」文本域并标注需包含的 Cookie 字段。
- **扫描本地授权文件**（Claude、Codex、Antigravity）— 自动扫描 `~/.claude/...` 等路径，列出发现的凭证（有效项预选、过期项标红禁选），支持重新扫描 / 手动选择文件。

**数据标签映射（每种方式共用）**
折叠的「高级」区，把接口返回的**原始标签**（如 `five_hour_window`、`gemini-2.5-pro`）逐行映射为用户**自定义显示名称**，可逐项重置默认。

新增文件：`add-account.jsx` / `add-account.css`；并在 `settings-data.js`、`icons.jsx`（含 MiMo 标记）中扩展了数据与图标。

几点可按需调整：
- 各服务的**授权方式归属**目前是我按常见情况分配的，若与你后端实际不符可改 `VENDOR_AUTH`。
- 原始标签清单（`VENDOR_RAW_LABELS`）是示例数据，可替换为真实接口返回的字段。

## User

你把mimo账号也做一个放到设置里呀.数据标签映射不只是在添加账号的时候有，你在那个设置的账号里面，本来应该也可以设置这玩意儿.然后添加账号的时候.你这个添加账号的时候，那个数据标签映射你不应该在添加账号里面设置。你添加账号的时候还没有添加上的，你怎么知道有哪些标签

## Assistant

_[tool: str_replace_edit]_

Good points — all correct: the mapping belongs to an *existing* account (you only know the labels after data comes back), not the add flow. Let me (1) add a MiMo account to settings, (2) remove mapping from the add dialogs, and (3) make it editable per-account in the accounts list.

_[tool: str_replace_edit]_

Now refactor the add-account dialogs: drop the mapping section and add a standalone per-account mapping dialog.Now update the root dialog to drop the mapping state, and add the standalone `LabelMapDialog`.

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Now add the standalone `LabelMapDialog` — opened from an existing account row.

_[tool: read_file]_

Now wire it into the accounts list. Let me read the relevant section and add a tag button + dialog.

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Now styles for the dialog variant (meta line, list, empty state).

## User

继续

## Assistant

_[tool: str_replace_edit]_

Let me bump cache versions so the edits reload, then verify.

_[tool: show_to_user]_

_[tool: eval_js_user_view]_

_[tool: screenshot_user_view]_

MiMo is now in the list, tag buttons present, mapping dialog opens. Let me capture it.

_[tool: get_webview_logs]_

The per-account mapping dialog works exactly as intended — opened from the account row, showing the API's raw labels with editable display names. Let me confirm clean console and finish.

_[tool: done]_

_[tool: snip]_

_[tool: fork_verifier_agent]_

改好了，你说得对：

1. **MiMo 账号已加入设置** — 现在「设置 → 账号」列表里有了 MiMo（普通用户和 CPA 用户两种场景都加了）。

2. **数据标签映射移出添加流程** — 添加账号时还没拿到数据、不知道有哪些标签，所以三个添加对话框里都去掉了映射区。

3. **改到账号列表里设置** — 每个已存在的账号行上新增了一个标签图标按钮，点开是独立的「数据标签映射」对话框：顶部注明标签来自接口最近一次返回，逐行把原始标签（如 `five_hour_window`）映射成显示名称，可单行重置或一键全部恢复默认。


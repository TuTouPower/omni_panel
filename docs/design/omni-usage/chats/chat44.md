# 数据标签映射同步

_Started 2026-06-13 17:19 UTC_

---

## User

设置常规里面的其他加一个选项，同一数据源的数据标签映射同步，默认打开这个开关。然后 glm DeepSeek 是通过密钥拿到用量的，编辑弹窗要有密钥的填空。mimo 没有密钥，靠的是网页登录。

## Assistant

_[tool: read_file]_

_[tool: list_files]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: str_replace_edit]_

Now I understand the architecture. Let me make the changes. The `EditAccountDialog` needs to be auth-aware (key field for apikey vendors like GLM/DeepSeek, web-login for session vendors like MiMo), and the General page needs the new sync toggle.Now the General page toggle and the global sync flag wiring:

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Now bump the cache version so the changes load:

_[tool: show_html]_

_[tool: show_html]_

_[tool: multi_screenshot]_

Loads cleanly. Let me verify the new toggle and edit dialogs by navigating into settings:

_[tool: eval_js]_

The edit dialogs didn't open via that selector. Let me check and open directly:

_[tool: eval_js]_

MiMo dialog is correct (web login, no key). A MiMo dialog was already open. Let me close and verify GLM:

_[tool: eval_js]_

_[tool: save_screenshot]_

Both work correctly. Let me capture the GLM edit dialog and the new General toggle visually:

_[tool: save_screenshot]_

_[tool: delete_file]_

All three changes are working. Let me clean up the verification screenshots and finish:三处改动已完成：

1. **常规 → 其他**：新增「同一数据源的数据标签映射同步」开关，默认开启（同源多账号共用一套标签映射）。
2. **GLM / DeepSeek 编辑弹窗**：因走密钥认证，现含「API 密钥」填空（带显示/隐藏切换与本地加密说明）+ 接口地址。
3. **MiMo 编辑弹窗**：无密钥，改为「登录会话」区——显示已通过网页登录、来源 host 及「重新登录」按钮（点击展开登录窗口）。

编辑弹窗现按厂商认证方式自适应（密钥 / 网页登录 / 本地凭证），且数据标签映射区会跟随上面那个同步开关显示「该数据源共用」或「仅此账号」。

_[tool: done]_

已完成并确认无报错。

## User

账号里面所有的编辑都要加上一个开关，使用全局自动刷新间隔，你可以改一下我的描述。关闭开关后，可以设置这个账号独有的自动刷新间隔。再加上一个 brave search api 统计，这个是填 api key，默认手动才刷新，加一个提示，因为用量统计需要发送搜索 api 请求，所以默认手动才会刷新。

## User

继续

## User

继续

## Assistant

_[tool: save_screenshot]_

Brave card and accounts list look great. The edit dialogs didn't render in those steps — let me open them directly and capture:

_[tool: show_html]_

_[tool: show_html]_

_[tool: save_screenshot]_

_[tool: eval_js]_

The screenshot tool isn't capturing the dialog state, but let me confirm content directly via eval:

_[tool: eval_js]_

A stale dialog was open. Let me close everything and open Brave fresh to confirm its default state:

_[tool: eval_js]_

Brave defaults correctly (toggle off, 仅手动, note present). Let me confirm GLM defaults to global (toggle on) and the custom interval appears when toggled off:

_[tool: eval_js]_

All behavior confirmed. Let me grab a clean visual of the Brave edit dialog for the record:

_[tool: screenshot]_

_[tool: show_html]_

_[tool: eval_js]_

_[tool: save_screenshot]_

_[tool: delete_file]_

The functionality is fully verified via eval. Let me clean up the verification screenshots and finish:两项改动已完成：

**1. 账号编辑弹窗 — 刷新间隔开关（所有账号通用）**
- 新增「跟随全局自动刷新间隔」开关，默认开启，副文显示当前全局值（如「当前全局为『5 分钟』自动刷新」）。
- 关闭后展开「该账号刷新频率」下拉，可单独设为 1/5/15/30 分钟或仅手动。

**2. 新增 Brave Search**
- 出现在总览（橙色盾形图标，本月查询/今日查询用量条，标注「手动 · 1 小时前」）、账号列表与添加面板。
- 认证方式为 API 密钥，编辑/添加弹窗均有密钥填空。
- 默认仅手动刷新：编辑弹窗里开关默认关闭、频率为「仅手动」，并在添加和编辑处都给出提示——"用量统计需向 Brave Search API 发送一次搜索请求才能获取，会占用配额，因此默认仅手动刷新。"

预览截图工具此刻不太稳定，但我已逐项验证了交互状态（GLM 默认跟随全局、Brave 默认手动+提示、密钥字段、MiMo 仍走网页登录），均正确。

_[tool: done]_

已完成，无控制台报错。两项改动均已生效并验证。


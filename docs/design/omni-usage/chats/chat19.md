# 设置面板设计

_Started 2026-06-02 15:04 UTC_

---

## User

附件是参考图，请你根据这个修改设置面板，设置面板独立出来，成为一个完全独立的面板.

## Assistant

_[tool: list_files]_

_[tool: view_image]_

我先看看现有项目文件，理解当前 OmniUsage 的设计风格，再开始改造。

_[tool: read_file]_

_[tool: read_file]_

我看看现有的设置面板代码和样式。

_[tool: read_file]_

_[tool: read_file]_

现在看看样式文件和支持组件。

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: grep]_

_[tool: grep]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: update_todos]_

Now I have a thorough understanding of the design system. Let me lay out the plan.

_[tool: str_replace_edit]_

Starting with the vendor marks. I'll add gemini, kimi, and antigravity as simple geometric placeholders.

_[tool: str_replace_edit]_

_[tool: write_file]_

Now the data file:

_[tool: write_file]_

Now the stylesheet for the new pieces:

_[tool: write_file]_

Now the main component file:

_[tool: write_file]_

Now the standalone HTML and its mini root app:

_[tool: write_file]_

_[tool: update_todos]_

_[tool: show_html]_

_[tool: show_html]_

_[tool: get_webview_logs]_

Clean. Let me screenshot the four key states to verify they match the spec.

_[tool: save_screenshot]_

_[tool: view_image]_

_[tool: grep]_

Excellent — matches the spec. Now I need to test CPA mode. Let me check how tweaks persist so I can switch programmatically.

_[tool: grep]_

_[tool: str_replace_edit]_

I'll temporarily set the default mode to CPA to capture the other three states, then revert.

_[tool: show_html]_

_[tool: save_screenshot]_

_[tool: view_image]_

_[tool: save_screenshot]_

Now the data source and CPA detail pages:

_[tool: view_image]_

_[tool: show_html]_

Let me verify the nav highlight state — the active pill looks like it may be on the wrong item.

_[tool: save_screenshot]_

_[tool: eval_js]_

_[tool: view_image]_

Good — `数据源:true`, all others false. The highlight is correct; I misread the row alignment. Let me view the data source page render and then the CPA detail.

_[tool: str_replace_edit]_

The 同步/编辑 buttons are wrapping to two lines. Let me fix that, then capture the CPA detail page.

_[tool: show_html]_

_[tool: save_screenshot]_

_[tool: view_image]_

_[tool: eval_js]_

Matches the reference closely. Let me verify the sync interval value (spec wants 5 分钟) and check the footer buttons render.

_[tool: save_screenshot]_

Interval is correct (rendering just looked like "1"). Let me capture the add-account picker and the add-CPA dialog.

_[tool: save_screenshot]_

_[tool: view_image]_

_[tool: save_screenshot]_

The picker matches the spec. Now the add-CPA dialog:

_[tool: view_image]_

_[tool: str_replace_edit]_

The footer buttons are wrapping. Let me add nowrap (scoped to the dialog in my CSS file):

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Now revert the default mode to normal and polish the discovered-key spacing slightly.Now let me finalize — surface the file to the user and check it loads cleanly.

_[tool: done]_

_[tool: update_todos]_

_[tool: fork_verifier_agent]_

做好了 — **OmniUsage 设置.html** 现在是一个完全独立的设置面板。

按你的规范重建了账号与数据源结构：

- **侧边栏**：普通用户显示 常规/账号/外观/通知/数据与隐私/关于；切到 **CPA 用户**后才插入「数据源」。统一蓝色选中态，无紫色。
- **账号页**：单账号厂商（Claude、Kimi、Gemini）一整行显示（厂商 + 状态点 + 备注名 + 脱敏 key + 开关 + 编辑 + 删除）；多账号厂商（Codex、Antigravity 等）才用分组卡 + 账号子行。
- **CPA 账号**：弱标签「来自 CPA Manager」，操作为开关/编辑/**隐藏**（无删除）；直接添加的账号显示「直接添加」+ 删除。
- **数据源页**：仅 CPA Manager 一张卡（状态/URL/发现数/覆盖图标/上次同步 + 同步/编辑/更多），无 sub2api、无提示条。
- **数据源 > CPA Manager 详情**：左侧连接配置/状态/同步设置/同步范围 + 保存·移除；右侧可折叠的已发现账号。
- **弹窗**：添加账号（常用服务 + 高级方式 CPA Manager）、添加 CPA Manager（URL/密钥/同步范围 + 测试连接·保存并同步）。

右下 Tweaks 可切换「普通用户 / CPA 用户」、主题与强调色。

**一处取舍**：参考图②里 Gemini/Kimi 这类单账号厂商在 CPA 页是分组显示的，但你的文字规范多次强调"单账号必须一行、不许拆两行"——我按**文字规范**做了一行显示。如果你更想要参考图那种"CPA 页全部分组"的版本，告诉我即可切换。

后台核查代理正在运行，有问题我会再修。

## User

CPA数据源的编辑页面你没做

## User

CPA用户里面数据源的CPA的编辑，具体的编辑内容你没有做。我之前发的参考图里面有这个

## Assistant

_[tool: read_file]_

你说得对——「数据源」卡片里的 **编辑** 按钮我之前只是空操作，没有连到具体的编辑内容（CPA Manager 配置详情页）。我把它接上：点 **编辑** 直接进入参考图④那个 CPA Manager 编辑详情页（URL / 密钥 / 同步设置 / 同步范围 / 保存·移除）。

_[tool: read_file]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Now let me verify the 编辑 button reaches the detail page. I'll temporarily switch to CPA mode to test.

_[tool: show_html]_

_[tool: save_screenshot]_

_[tool: view_image]_

_[tool: str_replace_edit]_

编辑按钮现在能正确进入 CPA Manager 编辑详情页了，已发现账号的 key 也完整显示了。恢复默认用户类型。

_[tool: done]_

已修好。

「数据源」卡片上的 **编辑** 按钮之前是空操作，现在点它（或点卡片本身）都会进入参考图④的 **CPA Manager 编辑详情页**——左侧含连接配置（URL / API 密钥）、连接状态、同步设置（间隔 / 自动同步 / 失败通知）、同步范围（5 个服务商开关）、保存·移除数据源；右侧是可折叠的已发现账号。

切到右下 Tweaks 的「CPA 用户」即可看到完整流程。


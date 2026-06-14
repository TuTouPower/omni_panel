# CPA账号管理界面优化

_Started 2026-06-14 02:35 UTC_

---

## User

设置里面的账号设置里面的CPA对于每一个账号有一个关闭按钮，就类似主面板上的。去掉你现在的隐藏按钮。也去掉CPA 那么多个子账号的编辑按钮。在CPA manager的管理界面里面加上是否跟随全局自动刷新间隔。然后这个CPA manager也可以设置别名，它可能有多个CPA manager。把这个什么同步失败通知自动同步什么都给我去掉，你就和其他的那个账号的编辑保持一致。关掉那个跟随全局自动刷新间隔，之后才加上那个刷新频率。然后，你下面的同步范围，每一个厂商的账号都要加一个编辑按钮，在里面可以编辑数据标签映射。还有，去掉你这个cp manager的数据源标签

## Assistant

_[tool: list_files]_

_[tool: grep]_

_[tool: read_file]_

_[tool: grep]_

_[tool: str_replace_edit]_

Now I understand the structure. Let me make all the changes.Now replace the CpaDetailPage and add the LabelMapDialog:

_[tool: str_replace_edit]_

_[tool: show_html]_

Let me verify it renders cleanly.

_[tool: show_html]_

_[tool: eval_js]_

Let me navigate to the settings accounts page and CPA detail to verify the changes render correctly.

_[tool: screenshot]_

_[tool: grep]_

_[tool: eval_js]_

_[tool: screenshot]_

The CPA Manager card no longer shows the "数据源" tag. Let me scroll to the CPA card and check the sub-account rows now show toggles, then open the CPA detail.

_[tool: eval_js]_

_[tool: screenshot]_

_[tool: eval_js]_

_[tool: screenshot]_

_[tool: eval_js]_

_[tool: screenshot]_

_[tool: multi_screenshot]_

The CPA detail looks great — alias field, follow-global-refresh toggle, and per-vendor edit pencils in 同步范围. Let me test the label mapping dialog and the refresh-frequency reveal.

_[tool: eval_js]_

Let me verify the label-mapping dialog renders properly.

_[tool: screenshot]_

_[tool: eval_js]_

_[tool: save_screenshot]_

The DOM is correct — dialog exists (数据标签映射) and the refresh toggle is off (data-on="0"). The html-to-image tool just doesn't render fixed overlays reliably. Let me capture a real pixel screenshot of the dialog.

_[tool: save_screenshot]_

_[tool: delete_file]_

All changes verified working. Let me clean up the test screenshot and finish.All changes are in and verified. Done:

- **CPA 子账号** — 每行改成开关（关闭按钮，和主面板一致），去掉了隐藏按钮和编辑按钮；
- **CPA Manager 卡片** — 去掉了"数据源"标签；
- **CPA Manager 管理界面** — 加了"别名"（支持多个 CPA Manager）；改为"跟随全局自动刷新间隔"开关，关闭后才显示刷新频率；去掉了自动同步、同步失败通知，与账号编辑保持一致；
- **同步范围** — 每个厂商加了编辑按钮，点开可编辑数据标签映射。

_[tool: done]_

完成。所有改动已生效，无报错。

## User

你添加一种情况，如果有两个CPA呢

## Assistant

_[tool: read_file]_

_[tool: str_replace_edit]_

I'll add a second CPA Manager. Let me update the data first, then make the detail page connection-aware.Now the panel: make CpaCard use `conn.name`, and the detail page connection-aware.

_[tool: str_replace_edit]_

Now wire the crumb header and detail render to the selected connection in SettingsPanel:

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

I should add a `key` so the detail page re-initializes its state when switching between CPAs:Let me verify both CPA cards show in the list and each opens its own detail.

_[tool: show_html]_

_[tool: eval_js]_

_[tool: eval_js]_

Both CPAs render. Let me capture the list and each detail page with real screenshots.

_[tool: eval_js]_

_[tool: save_screenshot]_

_[tool: eval_js]_

_[tool: save_screenshot]_

_[tool: eval_js]_

The list clips at the window's fixed height, but functionality is what matters. Let me open the **second** CPA's detail directly to confirm it shows its own alias/scope/discovered accounts.

_[tool: save_screenshot]_

_[tool: delete_file]_

Both CPA Managers work independently — the second one (个人 CPA) shows its own alias, URL (cpa.mystudio.io), scope (Claude/Gemini/DeepSeek), and discovered accounts. Let me clean up test screenshots and finish.已添加两个 CPA Manager 的场景。账号列表里现在并排显示「公司 CPA」和「个人 CPA」两个独立数据源，每个都有各自的别名、URL、同步范围、刷新设置和已发现账号 —— 点开任一个的编辑都进入对应的管理界面。

_[tool: done]_

完成，无报错。两个 CPA Manager 各自独立配置，互不影响。


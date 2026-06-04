# 用量卡片刷新时间

_Started 2026-06-04 13:10 UTC_

---

## User

主面板里面的用量卡片 折叠状态下要显示几分钟前刷新的。你现在折叠状态下没有这个数据，展开才有

## Assistant

_[tool: read_file]_

_[tool: list_files]_

_[tool: grep]_

_[tool: read_file]_

_[tool: str_replace_edit]_

The fix is on line 94 — the relative time `rel-time` span is gated on `!collapsed`, so it disappears when the card is folded. I'll show it in the collapsed state too.

_[tool: grep]_

_[tool: grep]_

_[tool: show_html]_

The CSS handles it fine — `card-tools` has `margin-left: auto` so the rel-time sits just before the tools. Let me verify the collapsed state renders correctly.

_[tool: show_html]_

_[tool: eval_js]_

These are expanded. Let me collapse a card to verify the relative time now shows.

_[tool: save_screenshot]_

_[tool: save_screenshot]_

The collapsed Claude card now shows "8 分钟前" next to the account count badge, matching the expanded cards. The fix works.

折叠状态下的用量卡片现在会显示"X 分钟前"刷新时间（如 Claude 卡片的"8 分钟前"），与展开状态一致。

## User

平均和几个账号，如果用户选择了几个账号，折叠的时候这个标签就是几个账号，如果选择了平均，折叠的时候标签就是平均。你现在如果用户选择了平均的话，折叠的时候显示的还是几个账号

## Assistant

_[tool: str_replace_edit]_

Right — the collapsed badge should reflect the user's L2 selection (平均 vs N账号), not always show N账号. Let me fix that.

_[tool: show_html]_

_[tool: eval_js]_

_[tool: save_screenshot]_

_[tool: eval_js]_

Collapsed Claude now shows "平均". Now let me verify the other case — switch a card to account-detail then collapse.

_[tool: eval_js]_

_[tool: save_screenshot]_

Both cases work correctly: collapsed Claude (平均 selected) shows "平均", and collapsed Codex (账号 selected) shows "2账号". The badge now mirrors the user's L2 selection.

折叠标签现在跟随用户在展开时的选择：选了"平均"就显示"平均"，选了"N账号"就显示对应账号数。


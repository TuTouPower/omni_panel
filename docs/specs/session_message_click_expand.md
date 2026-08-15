# 用户消息底色与点击消息切换展开

## 背景

会话消息行原用裸蓝色「展开」按钮切换单行折叠，且用户/Agent 消息视觉无区分。改为用户消息 `primary-container` 底色突出，去掉展开按钮，统一点消息本体切换展开/收起。

## 范围

- `PaneMessageRow`：移除「展开」「收起」按钮；点击消息本体在完整内容与单行折叠间切换；仅超行消息可切换。
- 用户消息整行 `primary-container` 背景；Agent 无底。
- checkbox 只改选中；文本拖选不触发展开切换。
- 修订 `session-pane-display-adjust` AC9/AC10（并补 AC13 用户底色）。

## 非范围

- 不改 Markdown 渲染、消息数据链路、摘选/多选数据流。
- 不改默认单行折叠态。
- 不动消息 meta 行（角色/时间）内容。

## 验收标准

- [x] AC-001：消息行 DOM 中不再存在文案为「展开」或「收起」的按钮元素。
- [x] AC-002：点击超行消息本体切换折叠/完整内容；各消息独立。
- [x] AC-003：用户消息背景为 `primary-container`；Agent 无。
- [x] AC-004：点击 checkbox 只切换选中态，不改变展开/折叠。
- [x] AC-005：文本拖选后松开不触发展开/收起切换。
- [x] AC-006：不超单行消息点击无折叠变化。
- [x] AC-007：`session-pane-display-adjust` AC9/AC10 修订为点击本体语义。
- [x] AC-008：相关单测更新并通过。

## 实现要点

- `PaneMessageRow`：`on_body_click` 挂在消息本体；`has_text_selection` / `is_interactive_target` 隔离；`overflows` 仍由 `content_overflows` 测量（不依赖 expanded）。
- 用户 role：`rounded-md bg-[var(--color-primary-container)]`；selected 仅加 `selected` class，不再单独铺同色底。

## 测试覆盖

- `tests/unit/renderer/components/workspace/PaneMessageRow.test.tsx`（t408 组）。

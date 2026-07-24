# Task review t099（reviewer_focus: 测试）

- task：`t099_popup_width_cap_remove`
- spec：`docs\tasks\t099_popup_width_cap_remove\spec.md`
- diff_anchor：`3aabba4084c8d16d025a14b063b9979e0effe3b4`
- target：`git diff 3aabba4084c8d16d025a14b063b9979e0effe3b4`
- round：1
- reviewed_at：2026-07-24 12:50 UTC+8

## Findings

### t099_test_f001 - 未覆盖重启恢复和 popup 窗口上限解除

- 严重度：important
- 位置：`tests/unit/main/main_panel_controller.test.ts:172-182`
- 问题：新增用例只触发当前 floating 窗口的 `resize` 监听并断言写入配置。它没有以保存后的 `floatingBounds.width: 1200` 新建 controller 并断言恢复窗口宽度，也没有覆盖 `WINDOW_CONFIGS.usage.maxWidth` 移除后 popup 可超过 780px。若恢复路径重新使用 780px 上限，或 usage 配置重新加入 `maxWidth: 780`，此用例仍会通过，但 AC「重启后保留宽度」「popup 可超过 780px」和「maxWidth 不再限制 resize」会失败。
- 建议：补充 1200px 保存后重新创建 floating controller、断言恢复 `setBounds` 宽度为 1200 的用例；另为 usage 窗口配置或 BrowserWindow 创建参数补断言，确认无 `maxWidth` 并可接受超过 780px 宽度。

## 结论

- 本轮新发现：1 条
- 总体判断：新增测试可信地覆盖了保存 1200px 宽度，但 spec 的重启恢复、popup 和窗口配置三项行为未获测试证据。

verdict: FAIL

## Round 2 (2026-07-24 12:59 UTC+8)

## Findings

- 无。

## 结论

- 前轮 finding 复核：`t099_test_f001` 已修。`tests/unit/main/main_panel_controller.test.ts:185-196` 以 `floatingBounds.width: 1200` 创建新的 floating controller，并断言恢复调用保留 1200px 宽度；`:198-200` 断言 `WINDOW_CONFIGS.usage.maxWidth` 未配置。此前保存用例 `:173-183` 仍直接通过 resize 事件验证 1200px 写入配置，三项测试未见弱化断言或 mock 被测逻辑。
- 本轮新发现：0 条。
- 总体判断：测试覆盖 floating 宽度持久化、重启恢复和 usage 窗口无 maxWidth 限制；本轮无测试可信性、覆盖或危险模式问题。

verdict: PASS

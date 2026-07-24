# Task review t104（reviewer_focus: 测试）

- task：`t104_cpa_account_reset_bell`
- spec：`docs\tasks\t104_cpa_account_reset_bell/spec.md`
- diff_anchor：`d1b3925e8acb449e3c6d9206dc5249a77c5f9380`
- target：`git diff d1b3925e8acb449e3c6d9206dc5249a77c5f9380`
- round：1
- reviewed_at：2026-07-25 02:57 UTC+8

## Findings

### t104_test_f001 - 部分已监控时未覆盖全部账号写入

- 严重度：important
- 位置：`tests/unit/renderer/components/label_map_dialog.test.tsx:492`、`tests/unit/renderer/views/settings_view.test.tsx:553`
- 问题：组件测试只断言一账号已监控、另一账号未监控时 bell 为 `aria-pressed="false"`，随后点击测试和持久化测试均从完全未监控状态开始。若实现错误地在部分监控时仅保留原有账号或不向未监控账号写入，现有测试仍会通过，未覆盖验收标准「部分监控时为该 raw_label 所有 accountKey 写入监控」。
- 建议：以一条 accountKey 已含 `five_hour`、另一条未含为初始配置，点击 bell 后断言持久化值含两个 accountKey 的 `five_hour`；可在 SettingsView 回归测试或 E2E 测试完成。

### t104_test_f002 - 未验证无监控回调时不显示 bell

- 严重度：important
- 位置：`tests/unit/renderer/components/label_map_dialog.test.tsx:492-566`
- 问题：新增测试只覆盖传入 `on_toggle_watched` 的渲染路径。尽管既有用例多次不传该回调，它们没有断言 bell 缺席；因此若组件在未传回调时也渲染 bell，测试不会失败，未覆盖验收标准「仅在传入监控状态与回调时渲染」及无回调调用方界面不变。
- 建议：新增不传 `watched_metrics` 和 `on_toggle_watched` 的用例，待标签加载完成后断言 `queryByRole("button", { name: "监控该数据标签的即将重置" })` 为 `null`。

## 结论

- 本轮新发现：2 条
- 总体判断：新增单测和 E2E 覆盖了未监控添加、全部监控移除与持久化，但缺少部分监控添加和无回调不渲染两个验收路径。

verdict: FAIL

## Round 2 (2026-07-25 03:09 UTC+8)

### t104_test_f003 - 未覆盖只传回调、未传监控状态时 bell 必须缺席

- 严重度：important
- 位置：`tests/unit/renderer/components/label_map_dialog.test.tsx:492-510`
- 问题：Round 1 的无回调用例同时省略 `watched_metrics` 与 `on_toggle_watched`，只证明未传回调时不显示。验收标准要求同时传入监控状态和回调才渲染；若调用方只传回调、`watched_metrics` 为 `undefined`，当前测试仍会通过，即使 bell 被错误显示。该场景在 `CpaLabelMapDialog` 无任何已监控记录时可发生。
- 建议：新增只传 `on_toggle_watched`、省略 `watched_metrics` 的组件用例，标签加载后断言 bell 缺席。

### t104_test_f004 - 未验证 bell 的 title

- 严重度：important
- 位置：`tests/unit/renderer/components/label_map_dialog.test.tsx:513-546`、`tests/e2e/electron/cpa_label_map_watch.spec.ts:83-86`
- 问题：现有测试以 role/name 定位 bell，覆盖 `aria-label`，但没有断言 `title="监控该数据标签的即将重置"`。若 title 被删除或改错，全部测试仍可通过，未覆盖验收标准要求的鼠标可见提示。
- 建议：在组件测试中对已定位 bell 断言精确 `title` 属性。

### t104_test_f005 - 未覆盖每条 raw_label 均渲染 bell

- 严重度：important
- 位置：`tests/unit/renderer/components/label_map_dialog.test.tsx:513-586`、`tests/e2e/electron/cpa_label_map_watch.spec.ts:72-118`
- 问题：所有传入回调的新增测试和 E2E fixture 均只有一个聚合后的 `raw_label` 行。若回归导致只有首行渲染 bell，多账号切换与持久化断言仍会通过，未覆盖验收标准「每条 raw_label 行显示 bell」。
- 建议：组件 fixture 至少包含两个不同 raw_label，并断言每行各有一个 bell；同时保留其中一条由多账号聚合，以覆盖聚合语义。

## 结论

- 前轮 finding 复核：`t104_test_f001` 已修，新增 SettingsView 用例从部分已监控状态点击后精确断言两个 accountKey 均持久化；`t104_test_f002` 已修，新增无回调组件用例断言 bell 缺席。
- 本轮新发现：3 条
- 总体判断：前轮覆盖缺口已补齐，但监控状态缺席、title 及多 raw_label 行的验收路径仍未受测试保护。

verdict: FAIL

## Round 3 (2026-07-25 03:22 UTC+8)

## 结论

- 前轮 finding 复核：`t104_test_f003` 已修，新增仅传 `on_toggle_watched`、省略 `watched_metrics` 的用例并断言 bell 缺席；`t104_test_f004` 已修，双 raw_label bell 均精确断言 `title="监控该数据标签的即将重置"`；`t104_test_f005` 已修，`five_hour` 与 `seven_day` 两行 fixture 断言恰有两个 bell。
- 本轮新发现：0 条。
- 总体判断：测试覆盖组件渲染条件、每条 raw_label 的 bell 与 title、部分/全部监控三态及 SettingsView 持久化；未发现危险测试模式。

verdict: PASS

## Round 4 (2026-07-25 03:37 UTC+8)

## 结论

- 前轮 finding 复核：Round 3 对 `t104_test_f003`、`t104_test_f004`、`t104_test_f005` 的已修结论保持有效；最终 diff 未删除、反转或弱化对应断言。
- 本轮新发现：0 条。
- 总体判断：组件测试仍覆盖双 raw_label 的 bell/title、缺少任一渲染前提时 bell 缺席、部分监控状态与账号键回调；SettingsView 和 Electron E2E 仍覆盖 CPA 多账号的添加、全部监控移除及配置持久化。未发现危险测试模式或 Round 3 后导致覆盖下降的改动。

verdict: PASS

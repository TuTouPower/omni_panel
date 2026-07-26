# Task review t157（reviewer_focus: 测试）

- task：`t157_unify_account_auth_forms`
- spec：`docs\tasks\t157_unify_account_auth_forms/spec.md`
- diff_anchor：`057fb4ffe08c3e6d4af94777787fb3dc4626a32a`
- target：`git diff 057fb4ffe08c3e6d4af94777787fb3dc4626a32a`
- round：1
- reviewed_at：2026-07-27 05:23 UTC+8

## Findings

### t157_test_f001 - AC5 主面板"重新登录"行为变更缺少测试

- 严重度：important
- 位置：`src/renderer/views/PopupView.tsx:433-442`（改动点）；缺失对应测试 `tests/unit/renderer/views/popup_view.test.tsx`
- 问题：spec AC5 要求"主面板 KIMI 401 时点击'重新登录'能打开编辑弹窗并定位到认证区域"。当前 diff 将 `handle_re_login` 从调用 `window.usageboard.auth.cookieLogin` 改为 `window.usageboard.settings.open({ provider })`，但在 `tests/unit/renderer/views/popup_view.test.tsx` 及其 mirror/height 变体中均未找到验证该行为的测试。现有测试仅 mock 了 `settings.open` 并断言"主面板账号编辑不打开设置"，与重新登录入口无关；`cookieLogin` 虽在 mock 中存在，也没有任何测试断言它是否被调用或不再被调用。
- 建议：在 `popup_view.test.tsx` 中新增测试：构造 provider 卡片或账号行出现"重新登录"入口的场景，点击后断言 `window.usageboard.settings.open` 被调用且参数为 `{ provider: "kimi" }`（或对应 provider），并断言不再调用 `window.usageboard.auth.cookieLogin`。

## 结论

- 前轮 finding 复核（Round 2 才写）：N/A
- 本轮新发现：1 条
- 总体判断：新增单元测试对 `DeviceLoginSection` 与 `SettingsForm` 的 `oauth_device` 编辑路径覆盖较完整，KIMI/Grok 共用同一组件的行为在组件层得到验证；`SettingsView` 中 Grok 编辑入口的回归测试也补上了 auth 元数据。但主面板"重新登录"按钮的行为变更（AC5）是用户可见的关键路径，当前没有任何测试覆盖，构成 AC 缺口。另，AC4 中 `web_login` / `session` 的添加/编辑一致性在本轮 diff 中没有新增对应测试，不过现有 `SettingsForm cookie login` 测试覆盖了编辑侧行为，如添加侧已有测试则不构成强制 finding，此处仅在结论提示。

verdict: FAIL

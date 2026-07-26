# Task review t157（reviewer_focus: 测试）

- task：`t157_unify_account_auth_forms`
- spec：`docs\tasks\157_unify_account_auth_forms/spec.md`
- diff_anchor：`057fb4ffe08c3e6d4af94777787fb3dc4626a32a`
- target：`git diff 057fb4ffe08c3e6d4af94777787fb3dc4626a32a`
- round: 2
- reviewed_at：2026-07-27 06:04 UTC+8

## Round 2 (2026-07-27 06:04 UTC+8)

### 前轮 finding 复核

- `t157_test_f001`（AC5 主面板"重新登录"行为变更缺少测试）：**已修**。
  新增测试位于 `tests/unit/renderer/views/popup_view.test.tsx:331-363`，构造 KIMI 401 失败快照，点击"重新登录"后断言 `window.usageboard.settings.open` 被调用且参数为 `{ provider: "kimi" }`，同时 `window.usageboard.auth.cookieLogin` 未被调用。该测试覆盖了 AC5 的行为变更。

## Findings

### t157_test_f002 - DeviceLoginSection 登出成功/失败回归测试未补回

- 严重度：important
- 位置：
    - 新增测试：`tests/unit/renderer/components/device_login_section.test.tsx:130-138`（仅断言按钮存在）
    - 删除测试：`tests/unit/renderer/components/grok-login-section.test.tsx` 原 "clicking logout calls logout API and updates status" / "shows logout failure and keeps the logged-in state"
    - 源码：`src/renderer/components/DeviceLoginSection.tsx:96-121`
- 问题： refactor 将 `GrokLoginSection` 替换为 `DeviceLoginSection`，源码仍保留完整的 `handle_logout` 逻辑及登出失败错误展示（`DeviceLoginSection.tsx:96-121`）。但旧的 `grok-login-section.test.tsx` 中覆盖"点击退出登录调用 API 并回到未登录状态"以及"退出登录失败保持已登录状态"的两条回归测试被删除后，新文件 `device_login_section.test.tsx` 仅在第 130-138 行断言"显示退出登录按钮"，未点击按钮，也未覆盖失败路径。用户可见的登出行为在重构后失去测试守护。
- 建议：在 `device_login_section.test.tsx` 中补充：
    1. 已登录时点击"退出登录"，断言 `logout(instance_id)` 被调用，且按钮最终变回 "Kimi/Grok 登录"；
    2. 模拟 `logout` reject，断言仍显示"退出登录"并展示错误信息。

### t157_test_f003 - SettingsForm 编辑路径 web_login / session 认证区域缺少测试

- 严重度：important
- 位置：
    - 源码：`src/renderer/components/SettingsForm.tsx:386-422`
    - 缺失测试：`tests/unit/renderer/components/settings_form.test.tsx`（无 `authMethod="web_login"` / `authMethod="session"` 的编辑场景）
- 问题：AC4 要求"添加账号与编辑账号中，`oauth_device` / `web_login` / `session` 的认证区域结构、文案、交互保持一致"。当前 diff 在 `SettingsForm` 中按 `authMethod` 渲染 `WebLoginSection`（第 386-413 行）和 `SessionSection`（第 414-422 行），但 `settings_form.test.tsx` 的编辑侧测试仍只覆盖旧的 `onCookieLogin` 路径（"SettingsForm cookie login" describe），未对 `authMethod="web_login"` 或 `authMethod="session"` 的新编辑路径进行渲染与交互验证。添加侧 `WebLoginForm` 测试存在，但 `SessionSection` 在添加/编辑两侧均无测试。因此编辑路径的 web_login/session 区域行为没有测试覆盖，AC4 在编辑侧不完整。
- 建议：在 `settings_form.test.tsx` 中补充：
    1. `authMethod="web_login"` 时渲染 `WebLoginSection`、隐藏默认 secret 输入、点击"网页登录"后通过 `perform_save` 保存 cookie；
    2. `authMethod="session"` 时渲染 `SessionSection`、隐藏默认 secret 输入、textarea 输入能回写到保存值；
    3. 为 `SessionSection` 单独添加基础渲染/输入测试。

## 结论

- 前轮 finding 复核：`t157_test_f001` 已修。
- 本轮新发现：2 条。
- 总体判断：Round 1 的 AC5 测试缺口已补上，但重构删除的 Grok 登出回归测试未在 `DeviceLoginSection` 中补回，且 `SettingsForm` 新增的 web_login / session 编辑路径缺少对应测试，AC4 编辑侧覆盖不完整。

verdict: FAIL

# Task spec

## 背景

t108 建立了 descriptor 驱动的表单骨架后，需要实现 `oauth_device` 与 `web_login` 两种 method 的具体表单。

- grok：现有 `GrokLoginSection.tsx` 已实现设备码登录，但只在「编辑账号」弹窗里可用，添加账号时走 `ApiKeyForm` 让用户粘 `OAUTH_TOKEN`，完全错误。需抽成 `OAuthDeviceForm` 复用。
- opencode_go：现有 `SessionForm` 把「粘贴 Cookie」作为主路径，「网页登录」只是辅助按钮。用户要求主路径直接触发 `session.login`，不再展示 cookie 输入框。

## 范围

- 新建 `src/renderer/components/forms/OAuthDeviceForm.tsx`：
    - 复用 `GrokLoginSection` 的设备码逻辑（`login_start` / `login_poll`）。
    - 添加账号场景：用户点「开始登录」→ 显示设备码与验证链接 → 轮询成功后自动保存 `OAUTH_TOKEN` 到 secrets。
- 新建 `src/renderer/components/forms/WebLoginForm.tsx`：
    - 主路径只有一个「网页登录」按钮，点击调 `window.usageboard.session.login`，成功后自动保存 `SESSION_COOKIE`。
    - 不展示 cookie 输入框，不展示「复制脚本」。
- 改 `AddAccountDialog.tsx`：t108 的占位组件替换为上述两个表单。
- 单测：`tests/unit/renderer/components/forms/oauth_device_form.test.tsx` + `web_login_form.test.tsx`。

## 非范围

- 不改 `SettingsView.tsx` 的 source 查找与 `duplicate` 传参（t110 处理）。
- 不实现 `CpaMgmtForm`（t110 处理）。

## 验收标准

- [ ] grok 添加账号时显示设备码登录流程，不再显示 API key 输入框。
- [ ] opencode_go 添加账号时主路径为网页登录，不再显示 cookie 输入框。
- [ ] 单测覆盖两个表单的渲染与保存逻辑。
- [ ] `pnpm test` 全绿；`pnpm typecheck` 通过。

## 依赖与约束

- 依赖 t108 的 `resolve_auth_method` 与表单骨架。
- 后续 t110 依赖本 task 的表单组件完成接线。

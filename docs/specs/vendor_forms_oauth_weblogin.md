# vendor_forms_oauth_weblogin

## 背景

t108 建立了 descriptor 驱动的表单骨架后，需要实现 `oauth_device` 与 `web_login` 两种 method 的具体表单。

- grok：原有 `GrokLoginSection.tsx` 已实现设备码登录，但只在「编辑账号」弹窗里可用，添加账号时走 `ApiKeyForm` 让用户粘贴 `OAUTH_TOKEN`。需抽成 `OAuthDeviceForm` 复用设备码逻辑。
- opencode_go：原有 `SessionForm` 把「粘贴 Cookie」作为主路径、「网页登录」只是辅助按钮。本 spec 把主路径改为直接触发 `session.login`，不展示 cookie 输入框。

## 范围

- 新建 `src/renderer/components/forms/OAuthDeviceForm.tsx`：
    - 复用 `GrokLoginSection`（现 `DeviceLoginSection`）的设备码逻辑（`login_start` / `login_poll`）。
    - 添加账号场景：用户点「开始登录」→ 显示设备码与验证链接 → 轮询成功后自动保存 `OAUTH_TOKEN` 到 secrets。
- 新建 `src/renderer/components/forms/WebLoginForm.tsx`：
    - 主路径只有一个「网页登录」按钮，点击调 `window.usageboard.session.login`，成功后自动保存 `SESSION_COOKIE`。
    - 不展示 cookie 输入框，不展示「复制脚本」。
- 改 `AddAccountDialog.tsx`：t108 的占位组件替换为上述两个表单。
- 单测覆盖两个表单的渲染与保存逻辑。

## 非范围

- 不改 `SettingsView.tsx` 的 source 查找与 `duplicate` 传参（t110 处理）。
- 不实现 `CpaMgmtForm`（t110 处理）。

## 验收标准

- [x] grok 添加账号时显示设备码登录流程，不再显示 API key 输入框。
- [x] opencode_go 添加账号时主路径为网页登录，不再显示 cookie 输入框。
- [x] 单测覆盖两个表单的渲染与保存逻辑。
- [x] `pnpm test` 全绿；`pnpm typecheck` 通过。

> 状态（后续演进）：t278 起 `WebLoginForm` 除「网页登录」外还提供手动粘贴 Cookie 保存（`provider !== kimi_web` 显示手动「添加账号」按钮；web 侧降级指引见 `web_cookie_login_anon_poll_parity.md`）。上方范围/验收中的「不展示 cookie 输入框」为 t109 当时口径，主路径仍为网页登录。

## 依赖与约束

- 依赖 t108 的 `resolve_auth_method` 与表单骨架。
- 后续 `SettingsView` 接线与 `CpaMgmtForm` 在本 spec 的表单组件之上完成（已由 `fix_add_account_wiring` 落地，见「非范围」）。

## 实现要点

- 设备码状态机抽为共享 hook `src/renderer/hooks/use-device-login.ts`（`useDeviceLogin`，t118 由 `use_grok_device_login` 抽出）：`start` 入口检查 `active_ref` 防并发轮询覆盖 cancel 句柄，cleanup 调 `login_cancel` 取消后台轮询。
- 主进程侧取消句柄集中在 `src/main/core/auth/device_code_oauth_manager.ts` 的 `active_login_cancels`（`cancel_device_login`），按 instance 维护并支持 logout 时取消进行中的登录。
- 登录成功后 `DeviceLoginSection` 用 `result.token` + `secret_name` 组装 secrets（含 `OAUTH_REFRESH_TOKEN` / `OAUTH_EXPIRES_AT`），经 `on_save` 落盘。
- 添加账号表单按 descriptor 分发：`add_account/form_registry.tsx` 依 `resolve_auth_method` 把 `oauth_device` 渲染为 `OAuthDeviceForm`、`web_login` 渲染为 `WebLoginForm`，均带 `key={vendor_id}`（切换服务即卸载重挂）。
- 添加账号子组件拆入 `src/renderer/components/add_account/`（registry 与参数类型）与 `src/renderer/components/forms/`（表单本体），主文件不再内联各厂商表单。

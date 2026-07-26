# Task spec

## 背景

当前添加账号与编辑账号使用两套不同的表单实现，导致认证方式（auth.method）相同的服务在两种场景下呈现完全不同的界面与操作路径：

- 添加账号：`AddAccountDialog` 按 manifest 声明的 `auth.method` 渲染对应表单（`OAuthDeviceForm` / `WebLoginForm` / `ApiKeyForm` 等），OAuth 设备码服务（KIMI、Grok）支持一键登录。
- 编辑账号：`AccountDialog` 固定使用 `SettingsForm`，仅按 manifest `parameters` 渲染输入框。KIMI 的 `OAUTH_TOKEN` / `API_KEY` 只能手动填写，无 OAuth 重新登录入口；Grok 虽通过 `GrokLoginSection` 特殊处理，但属于个案补丁。

KIMI OAuth token 过期后，用户在编辑界面无法触发重新登录流程，只能删除账号后重新添加，体验割裂且易误操作。

## 范围

- 统一 `AddAccountDialog` 与 `AccountDialog` 的认证区域：两者按同一套规则渲染 `AuthSection`。
- 新增通用 `DeviceLoginSection`，替代 `OAuthDeviceForm` 与 `GrokLoginSection`，同时支持添加（临时 instanceId）与编辑（真实 instanceId）场景。
- `SettingsForm` 移除 Grok 特殊 case，改为按 `auth.method` 分发到对应登录组件。
- 主面板"重新登录"按钮不再调用 `cookieLogin`，改为打开编辑弹窗，由用户在编辑界面完成重新授权。
- 编辑 KIMI 账号时可完成 OAuth 设备码重新登录，无需删除账号。

## 非范围

- 不改动 connector manifest 声明方式。
- 不改动 `oauth_device` / `web_login` / `session` 等认证协议本身。
- 不处理 `apikey` / `local_cli` / `cpa_mgmt` 的编辑界面（它们本来就只有输入框，与添加界面一致）。
- 不改动主面板卡片布局。

## 验收标准

- [ ] 添加 KIMI 账号时，OAuth 设备码登录流程可正常完成。
- [ ] 编辑 KIMI 账号时，显示"重新登录"按钮，可完成 OAuth 设备码重新登录并保存新 token。
- [ ] 编辑 Grok 账号时，OAuth 登录区域与 KIMI 行为一致（同一组件渲染）。
- [ ] 添加账号与编辑账号中，`oauth_device` / `web_login` / `session` 的认证区域结构、文案、交互保持一致。
- [ ] 主面板 KIMI 401 时点击"重新登录"能打开编辑弹窗并定位到认证区域。
- [ ] 现有 `apikey` / `session` / `cpa_mgmt` 等编辑界面不出现回归。

## 依赖与约束

- 依赖 `auth-flow-registry.ts` 的 `resolve_auth_method` / `resolve_auth_descriptor`。
- 依赖 preload 中 `window.usageboard.kimi` / `window.usageboard.grok` 在 setting 路由暴露完整 OAuth API。
- 需保持 `SettingsForm` 现有 secret 加密保存逻辑（`config:getSecrets` 回填、`config.save` 更新）不变。

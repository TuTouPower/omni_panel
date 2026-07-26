# Task plan

## 步骤与验证

1. **抽象 `DeviceLoginSection`**：提取 `OAuthDeviceForm` 的登录流程与 `GrokLoginSection` 的状态管理，做成按 `vendor`（grok/kimi）与 `instance_id` 参数化的通用组件。 → 验证：单元测试覆盖添加/编辑两种调用路径。
2. **改造 `OAuthDeviceForm`**：内部复用 `DeviceLoginSection`，保留添加账号的保存逻辑（`on_save` 创建新账号）。 → 验证：现有 KIMI/Grok 添加账号流程回归通过。
3. **改造 `SettingsForm`**：
    - 根据 `resolve_auth_method(connector)` 在表单顶部渲染 `AuthSection`；
    - `oauth_device` 时渲染 `DeviceLoginSection`（edit 模式复用真实 `instanceId`，登录成功后只更新 secrets，不创建账号）；
    - `session` / `web_login` 保持现有"网页登录"按钮逻辑，但入口文案与添加界面统一；
    - 移除 `GrokLoginSection` 特殊 case。 → 验证：编辑 KIMI 显示"重新登录"，编辑 Grok 无 `GrokLoginSection` 回归。
4. **改造 `AccountDialog` / `AddAccountDialog`**：统一两者对 `AuthSection` 的调用方式；`AccountDialog` edit 模式把 `auth.method` 传入 `SettingsForm` 或让 `SettingsForm` 自行解析。 → 验证：添加/编辑同一 vendor 时认证区域结构一致。
5. **修改主面板"重新登录"行为**：`handle_re_login` 改为打开编辑弹窗（`window.usageboard.settings.open({ provider })`），不再直接调用 `cookieLogin`。 → 验证：KIMI 401 时点"重新登录"打开编辑弹窗。
6. **补充测试**：
    - 单元测试：`DeviceLoginSection` 在 add/edit 两种模式下的状态机与保存行为；
    - E2E：编辑 KIMI 账号触发 OAuth 重新登录（可 mock IPC 或走 contract live）。 → 验证：对应测试通过。

## 风险与回退

- 风险：edit 模式下 OAuth 登录成功后 secrets 更新逻辑与添加逻辑混用，可能导致旧 instance 被覆盖或新 instance 误创建。
- 回退：保持 `OAuthDeviceForm` 原行为为 add-only；`DeviceLoginSection` 只在 `SettingsForm` 的 edit 路径中使用，add 路径仍走 `OAuthDeviceForm` 包装层。

## Finalization 时更新的 blueprint

- `docs/blueprint/conventions.md`：添加/编辑账号统一使用 `AuthSection` + `SettingsSection` 的组件结构。
- `docs/blueprint/architecture.md`：如新增 `DeviceLoginSection`，在 renderer 组件分层中登记。

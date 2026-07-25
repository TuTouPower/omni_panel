# Task plan

## 步骤与验证

1. 新建 `OAuthDeviceForm.tsx`，抽离 `GrokLoginSection` 的设备码逻辑 → 验证：`tests/unit/renderer/components/forms/oauth_device_form.test.tsx` 红→绿。
2. 新建 `WebLoginForm.tsx`，主路径仅网页登录按钮 → 验证：`tests/unit/renderer/components/forms/web_login_form.test.tsx` 红→绿。
3. 改 `AddAccountDialog.tsx` 替换占位组件 → 验证：`pnpm test` 全绿 + `pnpm typecheck`。
4. 手动验证：真实 Electron 添加 grok 与 opencode_go 账号 → 验证：设备码流程与网页登录流程各跑一次成功。

## 风险与回退

- 风险：`GrokLoginSection` 与 `OAuthDeviceForm` 逻辑重复，未来需维护两处。 → 回退：t110 完成后把 `GrokLoginSection` 改为复用 `OAuthDeviceForm`，消除重复。

## Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：「渲染层」小节补一句「grok 与 opencode_go 的添加账号表单分别由 `OAuthDeviceForm` 与 `WebLoginForm` 实现」。

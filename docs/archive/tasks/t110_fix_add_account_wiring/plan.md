# Task plan

## 步骤与验证

1. 改 `SettingsView.tsx` source 查找与 `duplicate` 传参 → 验证：`tests/unit/renderer/views/settings_view.test.tsx` 红→绿（cpa 不再匹配 deepseek、displayName 正确）。
2. 新建 `CpaMgmtForm.tsx` 与 `ExaServiceKeyForm.tsx` → 验证：`tests/unit/renderer/components/forms/cpa_mgmt_form.test.tsx` + `exa_service_key_form.test.tsx` 红→绿。
3. 改 `AddAccountDialog.tsx` 接线新表单 → 验证：`tests/unit/renderer/components/add_account_dialog.test.tsx` 红→绿。
4. 补 E2E `tests/e2e/electron/add_account.spec.ts` → 验证：Playwright 四个厂商添加流程通过。
5. `pnpm test` 全绿 + `pnpm typecheck` 通过 → 验证：CI 命令。

## 风险与回退

- 风险：E2E 测试在 CI 环境无真实浏览器登录，grok 设备码与 opencode_go 网页登录无法自动化。 → 回退：E2E 仅覆盖「表单渲染正确 + 保存参数正确」，真实登录流程手动验证。

## Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：「渲染层」小节补一句「添加账号的 source 查找按 manifest id 精确匹配，不再用 supportedProviders 推导」。

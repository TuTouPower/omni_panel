# Task spec

## 背景

t121 test_f006 遗留：`tests/unit/renderer/components/add_account_dialog.test.tsx` 的 grok catalog 测试仅断言「开始登录」按钮存在 + `on_save.secrets` 端到端含 `OAUTH_TOKEN`。前者只区分 OAuthDeviceForm 与 ApiKeyForm，后者验证的是 save 出口而非表单渲染层。

reviewer 担忧：若未来实现把 secret_name 误写（如 `GROK_TOKEN`）但 on_save 仍硬编码 `OAUTH_TOKEN`，测试会通过但表单内部未正确绑定 secret_name。当前不构成 bug（实现正确），但表单层断言增益有限、缺失。

## 范围

在 `OAuthDeviceForm` 渲染层补一个断言，验证表单内部绑定的 `secret_name` 与 catalog entry 传入的 `auth.secret_name` 一致：

- 看现有 `OAuthDeviceForm` 实现（`src/renderer/components/forms/OAuthDeviceForm.tsx`），确认 secret_name 如何体现在 DOM（input `name` / `aria-label` / data 属性 / 提示文案）。
- 在 `add_account_dialog.test.tsx` 的 grok catalog 测试中补断言：表单渲染的 secret_name 标识与 `OAUTH_TOKEN` 一致。
- 若 OAuthDeviceForm 当前 DOM 无 secret_name 痕迹（纯 prop 传递不渲染），在表单上加一个 `data-secret-name` 或 aria 属性暴露（最小改动），再断言。

## 非范围

- 不改 OAuthDeviceForm 的登录流程、轮询、token 写入逻辑。
- 不改 secret_name 的契约（仍由 manifest auth descriptor 驱动）。
- 不补 kimi / 其他表单的同类断言（仅 grok，作为代表；若 reviewer 认为需要扩展再议）。

## 验收标准

- [ ] grok catalog 测试断言表单渲染层 `secret_name === "OAUTH_TOKEN"`（非仅 on_save 出口）。
- [ ] 若为暴露 secret_name 加了 DOM 属性，该属性不影响现有 UI 表现（人工/快照确认）。
- [ ] `pnpm test` 全绿。

## 依赖与约束

- 测试增强；不改产品行为是硬约束。
- 若实现层需要加 `data-*` 属性，须确认不与既有 DOM 约定冲突。

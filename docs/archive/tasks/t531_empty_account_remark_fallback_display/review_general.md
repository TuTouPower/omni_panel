# Task t531 独立 Review 报告 (General)

reviewed_scope: b4fabd55a65db395

## 审查范围

审查 `git -C '/Users/karson/kar/code/omni_panel_t531' diff 1ca9764ef72877b68aea4ccbea7ceb0d1c9c43a6` 的实际变更内容，覆盖代码、测试、配置与文档：

- `src/renderer/components/AddAccountDialog.tsx`
- `src/renderer/components/forms/CpaMgmtForm.tsx`
- `src/renderer/components/forms/ExaServiceKeyForm.tsx`
- `src/renderer/components/forms/GrokBotPkceForm.tsx`
- `src/renderer/components/forms/OAuthDeviceForm.tsx`
- `src/renderer/components/forms/WebLoginForm.tsx`
- `src/renderer/hooks/use_connector_catalog.ts`
- `src/renderer/views/SettingsView.tsx`
- `src/renderer/views/settings-view/sections/accounts_list.tsx`
- `src/renderer/views/settings-view/sections/accounts_section.tsx`
- `tests/unit/renderer/components/AddAccountDialog.test.tsx`
- `tests/unit/renderer/components/account_row.test.tsx`
- `tests/unit/renderer/components/forms/grok_bot_pkce_form.test.tsx`
- `tests/unit/renderer/components/forms/web_login_form.test.tsx`
- `tests/unit/renderer/hooks/use_connector_catalog.test.ts`
- `docs/tasks/t531_empty_account_remark_fallback_display/task.md`

## 契约区验收核对

- AC-001：在添加账号时（包含 API Key、Session、OAuth、WebLogin、CPA 等各类表单），若用户未输入备注（留空或纯空白），调用保存时传递的 `account_name` 为空字符串，插件配置中不包含或不设置厂商名称作为 `displayName`。
    - 核对通过。`AddAccountDialog` 及各专用表单（`CpaMgmtForm`、`ExaServiceKeyForm`、`GrokBotPkceForm`、`OAuthDeviceForm`、`WebLoginForm`）均对输入进行 `trim()` 处理，未填或空白时不回退厂商名，向保存接口传递空字符串 `""`。在 `SettingsView.tsx` 的 `savePluginSettings` 中，`displayName` 仅在 `display_name?.trim()` 为真时设置，空白时不写入；在 `use_connector_catalog.ts` 中 `pluginName` 规范化为 `undefined`。
- AC-002：在添加账号时，若用户输入了自定义备注（如 "工作账号"），保存时传递并持久化该备注（trim 后）。
    - 核对通过。所有保存路径均通过 `.trim()` 保留有效备注并持久化写入 `config.plugins`。
- AC-003：本地 CLI 授权扫描到邮箱且用户未输入备注时，继续保留自动将邮箱预填到备注输入框的能力；以预填邮箱保存时 `account_name` 记录该邮箱。
    - 核对通过。`form_registry.tsx` 中扫描到凭据时预填 `account_name` 逻辑完整保留，且在 `AddAccountDialog.test.tsx` 中增加了端到端断言。
- AC-004：在展示层（设置页账号列表 `accounts_list.tsx`、`AccountRow.tsx`、`CpaCard.tsx` 等），若账号备注（`displayName`）未设置或为空，动态回退展示厂商名称（如展示厂商名 `DeepSeek`、`OpenAI`、`CPA`），不展示空白、`undefined` 或重复的厂商名（如避免出现 `DeepSeek · DeepSeek`）。
    - 核对通过。`AccountRow.tsx` 在 `account_label` 为空时不再渲染中点与空白，仅展示厂商名；`CpaCard.tsx` 在 `note` 为空或等于 `"CPA"` 时不再重复渲染；`accounts_list.tsx` 与 `accounts_section.tsx` 在删除确认框、面包屑标题等位置均动态回退至厂商名或 `"CPA"`。

## 独立验证结论

- `pnpm typecheck`：通过（零类型错误）。
- `pnpm lint`：通过（零 warning 零 error）。
- `pnpm format:check`：通过（Prettier 格式化一致）。
- `pnpm build`：通过（Electron main/preload/renderer 与 Web 产物构建无报错）。
- `pnpm test`：通过（336 个测试文件、4132 个用例全部通过）。

## Findings 清单

Round 1 零 finding。

verdict: PASS

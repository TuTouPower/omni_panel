# Task review t157（reviewer_focus: 代码）

- task：`t157_unify_account_auth_forms`
- spec：`docs/tasks/t157_unify_account_auth_forms/spec.md`
- diff_anchor：`057fb4ffe08c3e6d4af94777787fb3dc4626a32a`
- target：`git diff 057fb4ffe08c3e6d4af94777787fb3dc4626a32a`
- round：1
- reviewed_at：2026-07-27 05:21 UTC+8

## Findings

### t157_code_f001 - package.json make 脚本被顺手改成 ensure_sqlite_abi 包装，超出任务范围

- 严重度：important
- 位置：`package.json:17-23`
- 问题：本 task spec 的范围/非范围、AC、依赖与约束均未涉及构建脚本或 sqlite ABI 处理。改动把 6 条 `make*` 脚本从 `pnpm build && electron-builder ...` 改成前后各包一层 `node scripts/ensure_sqlite_abi.mjs`，属于 YAGNI 顺手改进。该脚本若失败会直接阻断打包流程，扩大本 task 的 blast radius；且与「统一账号认证表单」目标无关。
- 建议：回滚 package.json 改动；如构建确实需要 ensure_sqlite_abi，应单独建 task 并在 spec 中说明理由。

### t157_code_f002 - AC4 仅实现 oauth_device 的统一，web_login / session 添加/编辑仍不一致

- 严重度：important
- 位置：`src/renderer/components/AddAccountDialog.tsx:315-348`、`src/renderer/components/SettingsForm.tsx:392-426`、`src/renderer/components/forms/WebLoginForm.tsx:78-98`、`src/renderer/components/add_account/SessionForm.tsx:35-51`
- 问题：spec 验收标准第 4 条要求「添加账号与编辑账号中，`oauth_device` / `web_login` / `session` 的认证区域结构、文案、交互保持一致」。当前实现只统一了 `oauth_device`（`DeviceLoginSection` 同时用于 `OAuthDeviceForm` 与 `SettingsForm`）。
    - `web_login`：添加走 `WebLoginForm`，有独立「网页登录授权」区域、按钮文案「网页登录」、提示文案「点击后会在系统浏览器打开登录页，完成后自动保存 Cookie」；编辑仍在 `SESSION_COOKIE` 参数行内渲染「网页登录」按钮，结构和文案不同。
    - `session`：添加走 `SessionForm`，展示「Cookie 字符串」多行输入框；编辑仍走 `SESSION_COOKIE` 的 `SecretInput` + 「网页登录」按钮，交互路径不同。
- 建议：按 AC4 把 `web_login` / `session` 也抽象成共用组件（或在 `SettingsForm` 中按 `authMethod` 渲染与添加流程对应的 `WebLoginSection` / `SessionSection`），确保添加/编辑的认证区域一致。

### t157_code_f003 - SettingsForm 中 DeviceLoginSection 的保存编排与 handle_submit 重复

- 严重度：important
- 位置：`src/renderer/components/SettingsForm.tsx:324-362`（`onSecrets` 回调）对比 `src/renderer/components/SettingsForm.tsx:186-287`（`handle_submit`）
- 问题：`onSecrets` 内部完整复刻了 `setSaving(true)` / `setSaveError(null)` / `onSave(...)` / `setSaved(true)` + 1.5s 超时 / `setSaving(false)` 的状态编排，与 `handle_submit` 中 `onSave` 后的成功/失败/清理逻辑高度重复。后续任何保存后行为改动（例如刷新 secrets 的方式、超时时间、错误提示）都需要改两处，违背 DRY。
- 建议：把「调用 onSave + 更新 saved/saveError/saving + 可选的 secrets 重载/connector.refresh」抽取为 `SettingsForm` 内部共享的 `perform_save` 辅助函数，`handle_submit` 与 `onSecrets` 都调用它。

### t157_code_f004 - GrokLoginSection.tsx 源码不再被任何业务代码引用，成为死代码

- 严重度：minor
- 位置：`src/renderer/components/GrokLoginSection.tsx:1-124`
- 问题：spec 要求 `DeviceLoginSection` 替代 `GrokLoginSection`。`SettingsForm` 已移除 `GrokLoginSection` 的导入和特殊 case，但 `src/renderer/components/GrokLoginSection.tsx` 源文件仍留在仓库中；`grep` 显示只有 `tests/unit/renderer/components/grok-login-section.test.tsx` 和文档/归档引用它，没有业务源码再使用它。
- 建议：删除 `GrokLoginSection.tsx` 源文件，并同步移除/迁移其专属测试（测试层问题由 test reviewer 另行判定）。

### t157_code_f005 - SettingsForm 对所有 oauth_device 都隐藏 secret 参数，但 DeviceLoginSection 只渲染 grok/kimi

- 严重度：minor
- 位置：`src/renderer/components/SettingsForm.tsx:289-293`、`src/renderer/components/SettingsForm.tsx:317-364`
- 问题：`visible_parameters` 在 `authMethod === "oauth_device"` 时过滤掉所有 `type === "secret"` 的参数；但 `DeviceLoginSection` 的渲染条件是 `authMethod === "oauth_device" && providerId && (providerId === "grok" || providerId === "kimi")`。若未来出现其他 `oauth_device` vendor（或当前 manifest 声明了非 grok/kimi 的 oauth_device），secret 输入框会被隐藏，同时没有替代 UI 可编辑该 secret。
- 建议：把 secret 过滤条件与 DeviceLoginSection 渲染条件对齐，或把 `DeviceLoginSection` 的分发判断提取成可扩展的 helper。

### t157_code_f006 - OAuthDeviceForm.handle_secrets 的 try/catch 只 rethrow，无意义

- 严重度：minor
- 位置：`src/renderer/components/forms/OAuthDeviceForm.tsx:21-40`
- 问题：
    ```tsx
    try {
        await on_save({ ... });
    } catch (save_error) {
        throw save_error;
    }
    ```
    catch 块没有转换错误、没有补充上下文，直接 `throw save_error`，与去掉 try/catch 完全等价。属于死代码/无效包装。
- 建议：移除无意义的 try/catch，直接 `await on_save(...)`；需要错误转换时再做处理。

### t157_code_f007 - SettingsForm.onSecrets 在保存前未重置 saved 状态

- 严重度：minor
- 位置：`src/renderer/components/SettingsForm.tsx:324-362`
- 问题：`onSecrets` 开始保存时调用 `setSaving(true); setSaveError(null);`，但没有像 `handle_submit`（`src/renderer/components/SettingsForm.tsx:221-223`）那样调用 `setSaved(false)`。虽然按钮文本优先级让 "保存中..." 覆盖了 "已保存"，但状态机不一致，可能导致后续边界行为（例如连续触发保存时 `saved` 状态的语义不清）。
- 建议：在 `onSecrets` 保存开始时加入 `setSaved(false)`，与 `handle_submit` 保持一致。

## 结论

- 前轮 finding 复核（Round 2 才写）：N/A
- 本轮新发现：7 条（3 important，4 minor）
- 总体判断：核心目标（oauth_device 统一、KIMI 编辑重新登录、主面板重登录打开编辑弹窗）的方向正确，但存在范围外改动、AC4 未完整覆盖以及 SettingsForm 内保存逻辑重复等重要问题，需修复后再审。

verdict: FAIL

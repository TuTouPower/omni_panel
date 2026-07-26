# Task review t157（reviewer_focus: 代码）

- task：`t157_unify_account_auth_forms`
- spec：`docs/tasks/t157_unify_account_auth_forms/spec.md`
- diff_anchor：`057fb4ffe08c3e6d4af94777787fb3dc4626a32a`
- target：`git diff 057fb4ffe08c3e6d4af94777787fb3dc4626a32a`
- round：2
- reviewed_at：2026-07-27 06:06 UTC+8

## Findings

### t157_code_f008 - SettingsForm 中 web_login / session 的编辑区域与添加流程不一致，违反 AC4

- 严重度：important
- 位置：`src/renderer/components/SettingsForm.tsx:311-422`
- 问题：AC4 要求添加与编辑的 `web_login` / `session` 认证区域结构、文案、交互保持一致。当前实现：
    - 编辑侧通过 `session_meta` 查表决定是否渲染 `WebLoginSection`（`web_login_props` IIFE，第 313-327 行）。
    - 添加侧 `AddAccountDialog` 对 `web_login` 使用 manifest 的 `auth_descriptor.login_url` 驱动 `WebLoginForm`，对 `session` 使用 `SessionForm`（textarea）。
      这导致两类不一致：
    1. 若某 `web_login` provider 的 `login_url` 声明在 manifest 中但不在 `session_meta` 里，编辑会回退为普通 `SecretInput`，而添加仍是网页登录按钮。
    2. 对 `session` provider（如 `mimo`）且存在于 `session_meta`，添加显示 Cookie 字符串文本域，编辑却显示「网页登录授权」按钮，结构和交互均不同。
- 建议：编辑侧与添加侧使用同一来源的元数据。`web_login` 应读取 manifest `auth_descriptor.login_url`（与 `WebLoginForm` 一致），`session` 应固定渲染 `SessionSection`（与 `SessionForm` 一致），不要通过 `session_meta` 把两种 auth method 混为一谈。

### t157_code_f009 - config-store.ts 进行大范围重构并改变备份恢复行为，超出任务范围

- 严重度：important
- 位置：`src/main/core/config/config-store.ts:101-340`
- 问题：本 task 的范围是统一账号认证表单，未涉及配置加载/备份恢复逻辑。当前 diff 对 `config-store.ts` 做了大量重构：提取 `parse_config` / `try_load_backup`，并在从 `.bak` / `.before_restore` 恢复时把备份内容写回主配置文件（`try_load_backup` 中传入 `configPath` 时调用 `writeJsonAtomic`）。这改变了原行为：原实现仅在内存中使用备份，保留损坏的主文件供排查；新实现会直接覆盖主文件，丢失损坏现场。该改动既不在 spec 范围内，也未在文档中说明理由，扩大了本 task 的 blast radius。
- 建议：回滚 `config-store.ts` 中与本 task 无关的加载/恢复重构；如确实有配置恢复需求，单独建 task 并在 spec 中说明行为变更。

### t157_code_f010 - package.json 新增 prebuild 脚本超出任务范围

- 严重度：minor
- 位置：`package.json:12`
- 问题：spec 未涉及构建脚本或 sqlite ABI 处理。新增的 `"prebuild": "node scripts/ensure_sqlite_abi.mjs electron"` 会在每次 `pnpm build` 前自动执行，虽然比 Round 1 直接改 `make*` 脚本更轻量，但仍属于 YAGNI 的顺手改进，扩大了任务范围。
- 建议：回滚该 prebuild 脚本；如构建确实需要 ensure_sqlite_abi，应单独建 task 并在 spec 中说明。

### t157_code_f011 - WebLoginSection 对 saved 但 cookie 为空的情况处理与原行为不一致

- 严重度：minor
- 位置：`src/renderer/components/WebLoginSection.tsx:36-47`
- 问题：`handle_login` 在 `result.saved === true` 但 `result.cookie` 为空/undefined 时，会构造空 secrets 对象并调用 `onSecrets`，而原 `WebLoginForm` 会在该情况下报 "未捕获到 Cookie..."（原代码 `if (!result.saved || !result.cookie)`）。这可能导致无意义的保存/刷新调用，且用户看不到明确的未捕获提示。
- 建议：恢复对 `!result.cookie` 的判断，空 cookie 时直接设置错误提示并返回，不要调用 `onSecrets`。

### t157_code_f012 - WebLoginSection 保存后额外调用 config.get() 与 DeviceLoginSection 不一致

- 严重度：minor
- 位置：`src/renderer/components/SettingsForm.tsx:386-412`（WebLoginSection 的 onSecrets）对比 `src/renderer/components/SettingsForm.tsx:361-385`（DeviceLoginSection 的 onSecrets）
- 问题：两个认证区域的保存回调结构相同（`perform_save` + 重载 secrets），但 WebLoginSection 回调中多了一句 `void window.usageboard.config.get();`（第 403 行），而 DeviceLoginSection 没有。该调用结果被忽略，目的不明，造成两个组件的保存后行为不一致。
- 建议：如果 `config.get()` 确有必要，说明原因并在两个回调中统一执行；如果只是为了刷新缓存，应在 `perform_save` 或 IPC 层统一处理，不要单独放在 WebLoginSection 回调里。

## 结论

- 前轮 finding 复核（Round 2）：
    - t157_code_f001（package.json make 脚本被改）：已修。`make*` 脚本已恢复为 `pnpm build && electron-builder ...`，不再直接包 ensure_sqlite_abi。
    - t157_code_f002（AC4 web_login/session 未统一）：部分修复。`oauth_device` 已完全统一；`web_login` / `session` 虽已抽出共用组件，但编辑侧按 `session_meta` 分发，与添加侧按 manifest `auth_descriptor` 分发不一致，见本轮 f008。
    - t157_code_f003（SettingsForm 保存编排重复）：已修。`handle_submit` 与认证区域回调都复用 `perform_save`。
    - t157_code_f004（GrokLoginSection 死代码）：已修。`GrokLoginSection.tsx` 源文件已删除。
    - t157_code_f005（oauth_device secret 过滤与 DeviceLoginSection 渲染条件不对齐）：已修。`has_dedicated_auth_section` 与 `supports_oauth_device_section` 条件一致，非 grok/kimi 的 oauth_device 不会隐藏 secret 输入。
    - t157_code_f006（OAuthDeviceForm 无意义 try/catch）：已修。新 `handle_secrets` 已移除 try/catch。
    - t157_code_f007（onSecrets 未重置 saved）：已修。认证区域回调通过 `perform_save` 统一设置 `setSaved(false)`。
- 本轮新发现：5 条（2 important，3 minor）
- 总体判断：Round 1 的核心代码问题已修复，但出现新的范围外改动（config-store、prebuild）以及 AC4 在 web_login/session 上仍未完全落地，需继续修复。

verdict: FAIL

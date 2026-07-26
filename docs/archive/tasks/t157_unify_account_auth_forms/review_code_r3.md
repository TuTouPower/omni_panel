# Task review t157（reviewer_focus: 代码）

- task：`t157_unify_account_auth_forms`
- spec：`docs/tasks/t157_unify_account_auth_forms/spec.md`
- diff_anchor：`057fb4ffe08c3e6d4af94777787fb3dc4626a32a`
- target：`git diff 057fb4ffe08c3e6d4af94777787fb3dc4626a32a`
- round：3
- reviewed_at：2026-07-27 06:28 UTC+8

## Findings

### t157_code_f013 - config-store.ts 备份恢复重构仍超出任务范围并改变恢复行为

- 严重度：important
- 位置：`src/main/core/config/config-store.ts:101-340`
- 问题：本 task 范围是统一账号认证表单，未涉及配置加载/备份恢复逻辑。当前 diff 仍包含对 `config-store.ts` 的大范围重构：提取 `parse_config` / `try_load_backup`，并在从 `.bak` / `.before_restore` 恢复时把备份内容写回主配置文件（`try_load_backup` 中传入 `configPath` 时调用 `writeJsonAtomic`）。这改变了原行为：原实现仅在内存中使用备份，保留损坏的主文件供排查；新实现会直接覆盖主文件，丢失损坏现场。该改动既不在 spec 范围内，也未在文档中说明理由，扩大了本 task 的 blast radius。
- 建议：回滚 `config-store.ts` 中与本 task 无关的加载/恢复重构；如确实有配置恢复需求，单独建 task 并在 spec 中说明行为变更。

### t157_code_f014 - package.json prebuild 脚本仍超出任务范围

- 严重度：minor
- 位置：`package.json:12`
- 问题：spec 未涉及构建脚本或 sqlite ABI 处理。新增的 `"prebuild": "node scripts/ensure_sqlite_abi.mjs electron"` 会在每次 `pnpm build` 前自动执行，属于 YAGNI 的顺手改进，扩大了任务范围。
- 建议：回滚该 prebuild 脚本；如构建确实需要 ensure_sqlite_abi，应单独建 task 并在 spec 中说明。

## 结论

- 前轮 finding 复核（Round 3）：
    - t157_code_f008（SettingsForm 编辑侧按 `session_meta` 分发 web_login/session）：已修。编辑侧现通过 `authMethod` / `authDescriptor` 驱动 `WebLoginSection` / `SessionSection`，与添加侧元数据来源一致（`SettingsForm.tsx:316-376`）。
    - t157_code_f009（config-store.ts 范围外重构）：未修。当前 diff 仍包含该改动，作为本轮 f013 继续报告。
    - t157_code_f010（package.json prebuild 范围外）：未修。当前 diff 仍包含该改动，作为本轮 f014 继续报告。
    - t157_code_f011（WebLoginSection saved 但 cookie 为空仍调用 onSecrets）：已修。`WebLoginSection.tsx:33-37` 现在先判断 `!result.saved || !result.cookie`，空 cookie 时直接返回错误，不再调用 `onSecrets`。
    - t157_code_f012（WebLoginSection 保存回调多调用 config.get()）：已修。`SettingsForm.tsx:341-365` 的 WebLoginSection 回调与 DeviceLoginSection 回调结构一致，均调用 `config.getSecrets`，不再额外调用 `config.get()`。
- 本轮新发现：2 条（f013/f014 均为前轮遗留问题持续未修）
- 总体判断：本 task 核心代码问题（AC1-AC5 的实现层统一）已修复，但两个范围外改动（config-store、prebuild）仍未移除，导致 diff 不聚焦。

verdict: FAIL

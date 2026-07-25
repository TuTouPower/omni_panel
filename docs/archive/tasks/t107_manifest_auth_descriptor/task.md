---
tid: t107
slug: manifest_auth_descriptor
diff_anchor: "89dec60eb78a2df0175a6df0b431e54f1d9f6f7a"
branch: "t107_manifest_auth_descriptor"
---

# Task t107_manifest_auth_descriptor

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

只记有追溯价值的进展、踩坑、中途决策、偏离 plan、关键验证；不写命令流水账。

- 2026-07-25 start。当前分支 `t107_manifest_auth_descriptor`，diff_anchor `89dec60`。
- 实现：
    - 新增 `src/shared/schemas/auth.ts` 定义 `authMethodSchema` / `authDescriptorSchema` / `AuthMethod` / `AuthDescriptor`。
    - `src/shared/schemas/manifest.ts` 在 `manifest_schema` 中引入 `auth: authDescriptorSchema.optional()`。
    - `src/shared/schemas/plugin-metadata.ts` 在 `pluginMetadataSchema` 中引入 `auth` 并 re-export 类型。
    - `src/main/ipc/connector-ipc.ts` `metadata_from_definition` 透传 `definition.manifest.auth`。
    - 四个 connector `manifest.json` 补 `auth` 块：grok `oauth_device`、exa `apikey` + `extra_fields`、cpa `cpa_mgmt` + `require_endpoint`、opencode_go `web_login` + `login_url`。
- 测试：新增 `tests/unit/schemas/plugin-metadata.test.ts` 覆盖 auth descriptor zod 校验；`tests/unit/ipc/connector-ipc.test.ts` 新增四个厂商 auth descriptor 断言。
- 回归：`pnpm test` 159 files / 1654 tests 通过；`pnpm typecheck` 通过；改动文件 ESLint 通过。
- 文档：`docs/blueprint/architecture.md` 「跨模块契约」补认证方式描述符说明。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 解决不了；满轮后进 blocked，在「遗留」与口头报告中列出
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

### Round 1 零 finding

Round 1 零 finding，未进处置表。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t107` 查，不在此记。

### 验收标准勾选

- [x] `plugin-metadata.ts` schema 支持 `auth` 块，缺 `secret_name` 或 method 枚举外值时 zod 校验失败。
- [x] 四个目标 connector 的 manifest.json 均含正确 `auth` 块，`pnpm typecheck` 通过。
- [x] `connector-ipc.test.ts` 断言四个厂商的 `PluginMetadata.auth` 与 manifest 一致。
- [x] `pnpm test` 全绿。

### Reviewer verdict

- Round 1 code：PASS
- Round 1 test：PASS
- Round 2 code：N/A
- Round 2 test：N/A

### 遗留

- 无

### 结果摘要

- manifest auth descriptor 已落地：新增 schema、透传 IPC、补四个 connector manifest；测试覆盖 zod 校验与 IPC 透传；架构文档已同步。

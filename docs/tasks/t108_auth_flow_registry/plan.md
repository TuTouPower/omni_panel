# Task plan

## 步骤与验证

1. 新建 `src/renderer/lib/auth-flow-registry.ts`，实现 `resolve_auth_method` → 验证：`tests/unit/renderer/lib/auth-flow-registry.test.ts` 红→绿。
2. 改 `AddAccountDialog.tsx` 删除 `VENDOR_AUTH_MAP` 与相关 meta，改为 descriptor 驱动 → 验证：`tests/unit/renderer/components/add_account_dialog.test.tsx` 红→绿。
3. `pnpm test` 全绿 + `pnpm typecheck` 通过 → 验证：CI 命令。

## 风险与回退

- 风险：现有测试大量依赖 `VENDOR_AUTH_MAP` 的厂商列表，改动后需同步更新测试。 → 回退：保留旧测试文件备份，逐步替换断言；若冲突过大，先只改 `AddAccountDialog` 内部实现，测试文件在 t110 统一更新。

## Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：「渲染层」小节补一句「添加账号表单由 manifest `auth` 块驱动，不再硬编码厂商映射」。

# p019 t175 归档 spec.md 未过 prettier，pnpm check format:check 红（2026-08-01）

- 来源：t180 顺手发现（commit 242343ad 引入）
- 内容：`docs/archive/tasks/t175_connector_ctx_status_migrate/spec.md` 存在 prettier 格式问题（`pnpm check` 的 `format:check` 全仓检查报警），t180 拆分执行时首次暴露。归档文件由 `finish` 移动，格式问题随 t175 归档带入。需 prettier --write 后单独 commit（属维护，不混入 task 执行 commit）。
- 处理：已验证不存在（2026-08-02 复核：`prettier --check docs/archive/tasks/t175_connector_ctx_status_migrate/spec.md` 通过，格式问题已消失，无需处理）

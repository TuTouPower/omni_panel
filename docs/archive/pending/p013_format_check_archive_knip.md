# p013 门禁基线红：format:check archive 文档 + knip 未用文件（2026-07-31）

- 来源：t172 顺手发现
- 内容：`pnpm format:check` 全局失败，约 30 个 `docs/archive/tasks/*/` 文档/脚本未过 prettier；`pnpm deadcode`（knip）报 3 个未用文件（`src/renderer/components/add_account/AuthPlaceholder.tsx`、`src/renderer/hooks/useGrokDeviceLogin.ts`、`src/renderer/hooks/useKimiDeviceLogin.ts`）。两者主仓同样报，为存量基线非本次引入。
- 处理：手动修复（2026-07-31）——archive 文档跑 prettier --write；3 个未用文件 git rm；`pnpm format:check` / `pnpm deadcode` 均转绿。

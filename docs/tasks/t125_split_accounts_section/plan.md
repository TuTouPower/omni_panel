# Task plan

## 步骤与验证

1. 读 `accounts_section.tsx`，确认 `AccountsList` 精确边界（line 211-436）及其用到的 interface。→ 验证：明确 `AccountsDialogState`、`AccountsRenameTarget` 是否被 `AccountsList` 的 props 类型引用。
2. 新建 `accounts_list.tsx`：剪切 `AccountsList` 组件；移入其专属 imports（`VendorCard`、`CpaCard`、`VendorId`、`UsageProvider`、`connection_status`/`map_status`/`snapshot_items` 等）；对共用 interface 从 `accounts_section` import 或随组件迁入（按引用方向选无循环依赖方案）。→ 验证：新文件可独立编译。
3. `accounts_section.tsx`：删除 `AccountsList` 定义，改为 `import { AccountsList } from "./accounts_list";`，清理不再使用的 imports，保留 `AccountsSection` 与其余 interface 导出。→ 验证：`wc -l` < 400；无未用 import。
4. 跑 typecheck。→ 验证：通过，无循环依赖报错。
5. 跑 `pnpm test`。→ 验证：全绿，无新增失败。

## 风险与回退

- 风险：interface 在「保留导出」与「随组件迁移」之间选择不当，产生循环 import（accounts_section ↔ accounts_list）。
- 缓解：共用 interface（`AccountsDialogState`、`AccountsRenameTarget`、`AccountsLabelMapDialogState`）保留在 `accounts_section.tsx` 导出，`accounts_list.tsx` 单向 import 之；`AccountsSection` 也 import `AccountsList`，方向均为 `accounts_section → accounts_list` 加 `accounts_list → accounts_section`（仅类型）。若形成类型级循环，改将 interface 移到 `accounts_list.tsx` 或独立 types 文件。
- 回退：改动限 2 个文件（新建 1、改 1），`git checkout -- <file>` 回退。

## Finalization 时更新的 blueprint

- 无（文件拆分，不改架构约定）。

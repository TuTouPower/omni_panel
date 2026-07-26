# Task spec

## 背景

t122 code_f003。`src/renderer/views/settings-view/sections/accounts_section.tsx` 436 行，超 conventions 的实现源码 400 行 minor 阈值。文件内含两个组件：`AccountsSection`（line 31-209，负责「已添加」头部 + CPA 编辑分支）与内部私有组件 `AccountsList`（line 211-436，负责直连分组 + CPA 卡片列表渲染）。

## 范围

- 把内部组件 `AccountsList`（约 line 211-436）抽到同目录独立文件 `accounts_list.tsx`（snake_case 文件名，与 sections 目录现有命名一致；组件名保持 `AccountsList` PascalCase）。
- 同步迁移 `AccountsList` 依赖的类型（`AccountsDialogState`、`AccountsRenameTarget` 等 interface 若被两文件共用则保留在 `accounts_section.tsx` 导出或迁入共享处，按实际引用确定）。
- `accounts_section.tsx` 改为从新文件 import `AccountsList`。

## 非范围

- 不改 `AccountsList` 的 props、渲染逻辑、事件处理。
- 不动 `AccountsSection` 主体与 CPA 编辑分支。
- 不调整其他 sections 文件。

## 验收标准

- [ ] `accounts_section.tsx` 行数 < 400。
- [ ] `AccountsList` 位于 `src/renderer/views/settings-view/sections/accounts_list.tsx`，props 与行为不变。
- [ ] 共用的 interface（`AccountsDialogState` 等）在两文件间无重复定义、无循环依赖。
- [ ] typecheck 通过。
- [ ] `pnpm test` 全绿。
- [ ] 行为零变化（账号列表渲染、CPA 卡片、各类回调不变）。

## 依赖与约束

- 无前置 task 依赖；与 t124 改动文件不同，可独立进行。
- 拆分纯搬运，不改逻辑。

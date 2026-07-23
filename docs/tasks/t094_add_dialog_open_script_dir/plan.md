# Task plan

## 步骤与验证

1. 红：加用例（弹窗存在"打开脚本目录"按钮；点击调用 `usageboard.shell.openConnectorsDir()`）→ 验证：相关 vitest 用例失败。
2. 主进程：新增 IPC `shell:openConnectorsDir`（mkdir -p + `shell.openPath(getUserConnectorsDir())`）；preload 暴露 → 验证：IPC 单测绿。
3. `AddAccountDialog.tsx` 加按钮并接线 → 验证：弹窗用例转绿。
4. 全量回归：`pnpm test` / `pnpm typecheck` / `pnpm lint` → 验证：全绿。

## 风险与回退

- 风险：IPC 通道命名/注册位置与既有 shell 类通道不一致；`shell.openPath` 在打包环境路径解析差异。
- 回退：改动为新增通道 + 按钮，`git checkout` 还原。

## Finalization 时更新的 blueprint

- 无（新增单一 IPC 通道，无架构变化）。

# p208 会话库「并排打开」应清空工作台再打开所选

- 现象：期望勾选多个会话点「并排打开」后工作台只剩所选会话；实际经 `sessionHistory.open` 追加装槽，旧槽保留，槽满时新选会话被 toast 拒绝。复现：工作台已有会话 → 会话库勾选 2+ → 并排打开 → 旧槽仍在。
- 影响：会话库 SelectionDock「并排打开」；与 demo /「最近会话」替换语义不一致。范围仅会话库并排打开（单独打开、TokenStats 批量打开历史不在本次）。
- 根因：产品缺陷——`SessionLibrary` `on_open_all`（~632–637）只循环 `sessionHistory.open`，未调用工作台 `clear_all`；`SessionShell` 已有 `clear_workspace_ref` 未下传。已扫无已确认同类位点（检索轴：`sessionHistory.open` 循环 / `on_open_all` / `clear_all`；单独打开与 TokenStats `onOpenSelected` 本次排除）。对照正确范式：`WorkspaceView.confirm_recent`、demo `Library.openInWorkspace`。
- 测试缺口：现有单测只断言 `open` 调用次数与切页签，不断言清空/替换。应补：工作台有旧槽时并排打开后仅含所选（先 clear 再 open）。
- 线索：`.scratch/p208_library_side_by_side_replace_workspace.md`
- 处理：未开

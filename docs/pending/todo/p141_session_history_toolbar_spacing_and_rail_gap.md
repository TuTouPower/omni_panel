# p141 会话历史工作台工具栏右侧留白、会话 panel 与上方空一行

- 现象：会话历史窗口工作台（默认「工作台」页签）顶部工具栏「最近会话 / 清空 / 视图 ▾」右侧有大段空白；下方会话 panel 与工具栏之间空了一行。
- 影响：会话历史工作台布局不紧凑；工具栏右侧未占满，六宫格与会话 rail 与顶栏存在多余空隙。
- 根因：产品缺陷（布局）。WorkspaceView 顶部工具栏 `.history-toolbar` 为内容行宽（`px-3 py-2`，actions 非 flex-1 无 justify-end），右侧天然留白；工具栏内部按钮（h-8）与 py-2 + border-b 组合使行高约 2 行内容，而下方 `.history-workspace-body` 顶格，rail 折叠按钮 `.history-rail-toggle` 仅 h-34px，与工具栏不同高 → 视觉上 grid/rail 顶部与工具栏产生空隙。已确认同类位点：仅会话历史工作台（WorkspaceView.tsx / WorkspaceToolbar.tsx / SessionRail.tsx 同布局，一处）。已扫丢弃：会话库（SessionLibrary）工具栏自带完整筛选区非空布局、Usage/Agent/Settings 面板标题栏为 PanelTitleBar 单行无此问题。
- 测试缺口：无布局尺寸/对齐单测覆盖 workbench 工具栏行高与 rail 对齐；补测以 e2e 或快照断言 toolbar 与 body 顶部间距、rail 顶部对齐，或用布局工具测 toolbar actions 是否 flex-1 占满。
- 线索：`.scratch/session_history_panel_layout.md`
- 处理：未开

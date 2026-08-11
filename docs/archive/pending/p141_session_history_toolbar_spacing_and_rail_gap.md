# p141 会话历史工作台工具栏右侧留白、会话 panel 与上方空一行

- 现象：会话历史窗口工作台（默认「工作台」页签）顶部工具栏「最近会话 / 清空 / 视图 ▾」右侧有大段空白；下方会话 panel 与工具栏之间观感空了一行。
- 影响：会话历史工作台布局不紧凑；工具栏右侧未占满，六宫格与会话 rail 与顶栏存在多余空隙。
- 根因：产品缺陷（布局，低严重度）。已用实渲染几何验证（1280×800，连接真实 `--cli serve` 实例，见 `.scratch/p141/measure_out.json`）：
    - 右侧留白 = flex 缺占满：`.history-toolbar` 为 `display:flex` + `justify-content:normal`（flex-start），唯一子节点 `.history-toolbar-actions` 无 `flex-1`（flex-grow:0 / shrink-0），仅占内容宽 198.8px；1280px 宽下右侧留白 ~1070px（83%）。全仓唯一页面级工具栏左侧孤行。
    - 「空一行」无结构性间隙（实测 `.history-workspace-body` top=94 与 toolbar bottom=94 齐平，grid/cell 顶 95 仅含 grid `p-px`）；观感空行来自工具栏内部：`py-2`(8px) + h-8 按钮(32px) + border-b(1px) → 工具栏高 49px，按钮底(85)距工具栏底(94) 9px 空白，且工具栏与 body 同色（均 `--color-surface`），空白带与下方背景融合成"空行"。rail 折叠按钮 `.history-rail-toggle` 仅 h-34px，比工具栏矮 15px，rail 顶部控制条与工具栏高度不齐。
    - 已确认同类位点：仅会话历史工作台一处（WorkspaceToolbar.tsx `.history-toolbar`/`.history-toolbar-actions`；WorkspaceView.tsx body 顶格；SessionRail.tsx toggle h-34px，三者同布局）。
    - 已扫丢弃（逐处判定）：会话库 `.library-toolbar` 搜索 Input 带 `flex-1` 占满、`flex-wrap` 自适应，无留白；SessionPane `.conversation-head` 标题文本 `flex-1` + actions 靠右，满宽（同 py-2 纵向样式但为卡片头设计）；SessionPreview `.preview-head` 同理满宽；SessionShell `.history-topbar` 页签 `ml-auto mr-auto` 居中为 t252 有意设计；SessionPicker/RecentSessions 弹窗标题 `justify-between` 满宽；Usage/Agent/Settings 面板顶部为 PanelTitleBar（justify-between）内部为表格/表单行无此模式；demo（public/frontend_demo）工具栏左/中/右三区占满、rail 自带标题行，机制不同且为设计参照不改。
- 测试缺口：现有 WorkspaceView/SessionRail 单测只测行为（槽位/选择/折叠），样式测试仅 session_typography 覆盖字号，e2e 只测功能路径——均无工具栏占满/对齐几何断言；jsdom 无布局引擎测不了 computed 尺寸。补测方向：修复 task 内 (a) 单测沿用 session_typography 的 DOM class 断言，断言修复后形态（actions 含 `flex-1` 或 header 含 justify 类、toolbar py 收紧、rail-toggle 与 toolbar 同高）；(b) web e2e 加几何断言：toolbar 高度、`body/grid top == toolbar bottom`（无结构间隙）、`rail-toggle top == toolbar bottom` 且高度与 toolbar 对齐，挡住回归。
- 线索：`.scratch/session_history_panel_layout.md`、`.scratch/p141/layout_measure.mjs`（测量脚本）、`.scratch/p141/measure_out.json`（实测数据）、`.scratch/p141/shot_empty.png`、`.scratch/p141/shot_loaded.png`（截图）
- 关联：与 t315_session_panel_bg_unify（根背景/卡片背景色 + gap-px 卡片间距）不重叠——t315 改颜色 token 与卡片间距，p141 改工具栏 flex 占满与纵向对齐，机制与修复面独立；仅同处 WorkspaceView/SessionShell 组件区域，并行执行注意 merge 冲突；互不前置（t315 后同色背景不变，空行观感仍在）。
- 处理：t318

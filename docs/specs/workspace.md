# 会话工作台（WorkspaceView）

需求：把会话窗口工作台页签从 6 栏平铺模型替换为 demo 对齐的 8 槽位模型——左侧槽位 rail、布局 1/2/3/4/6/8 切换、会话选择/最近会话弹窗、超位 toast 拒绝。单个会话面板（消息渲染/实时推送/分页/选择/复制）能力沿用 `HistoryColumn`（t211 决策 8/11/13/17），不回归。

## 槽位模型

- 固定 8 槽，槽位顺序即网格顺序。状态存 `src/renderer/lib/workspace/slots.ts` 纯函数（不可变 `SlotsState`，index=槽位号）。
- 操作：`try_assign_slot`（目标槽空才接受）/ `try_add_slot`（首个空槽，满则拒绝=超位）/ `remove_slot` / `move_slot`（拖拽换位，交换两槽）/ `clear_slots` / `find_slot_by_loc`（同 loc 查重）。
- 槽位元数据 `SlotSession`：loc + title（fallback session_id）+ agent（友好名）+ model + cwd（directory）+ calls + tokens（四维和）+ opened_at，由 `session_meta` 从 `TokenStatsSession` 派生；异步 `refresh_slot_meta` 回填 title/model/cwd/calls/tokens（基于 ref 计算走 apply_slots）。取数走 `tokenStats.getSessions`（完整 DTO，不读 session-history 的 SessionRow 映射）。
- 组件内槽位用「state + 同步 ref」双维护：所有写操作先同步 `slots_ref` 再 set state，保证 `onFocus`/最近会话等批量打开循环读到最新槽位（t211 同款 React 批处理 stale 坑）。

## 布局

- 工具条三区：左「最近会话」「清空」+「视图」下拉（显示时间戳/紧凑模式，全局下发所有 pane），中布局切换器（1/2/3/4/6/8），右「复制 N 条」+ 计数。
- `effective_columns(layout, width)`：受布局档位上限约束，容器宽度不足（`MIN_COLUMN_WIDTH=375`）降档到能容纳的列数；组件层 `cols = min(effective_columns, 占用数)` 写入 `.slot-grid` 的 `--cols`，CSS `repeat(var(--cols), minmax(0,1fr))` 排列。实际降档效果由真实窗口宽度决定（`[deploy]`）。
- 全空空态：无占用槽位时显示引导（去会话库 / 打开最近会话入口）。

## 会话面板（SessionPane，t225）

- 头部：agent 识别色条 + provider logo 徽标（`claude_code`→`claude`、`kimi_code`→`kimi`、`grok`→`grok`、`opencode`→`opencode_go`；未知 source 使用 `overview` 兜底，复用 `VendorMark` 主题资源）+ 标题 + meta 行（source · model · cwd · 轮数 · tokens · 日期）；hover 浮现大纲/全选可见/清空选择/聚焦/关闭操作。
- 消息区：Markdown 渲染（react-markdown@10 + remark-gfm@4，**无 rehype-raw**，会话 HTML 不当 HTML 执行）；相邻消息时间差超 10 分钟插分隔线；滚离底部超 120px 显示「回到底部」（点击回底，新消息在底部自动跟随）；加载骨架屏。
- 大纲抽屉：pane 右侧滑出，每条消息一行（角色序号 U/A + 摘要 + 时间），点击滚动定位。
- 聚焦模式：单面板铺满工作区（`.slot-grid.focused`），再次点击或 Esc 退出恢复原布局；关闭聚焦槽位/清空/替换时清聚焦索引。
- 脚部：槽位号 + user/assistant 消息计数。
- 快捷键：`1-8` 聚焦对应槽位、`[`/`]` 循环切换（无聚焦首入循环聚焦第一占用槽）、`Esc` 逐层退出（大纲 → 聚焦 → 普通态）。

## 打开与超位

- 入口重接：renderer 侧 `onFocus(loc)` 事件与 URL `loc` query 均走 `open_session` 装入槽位；已开则滚动聚焦该槽，槽满 toast「槽位已满（最多 8 个）」拒绝，不替换任何已有槽位。
- 会话选择弹窗（picker）：点空槽位或「添加会话」打开；按标题/路径/ID 搜索、agent 筛选页签（带计数）、已打开会话标「已打开」；点行装入目标槽位。同 loc 已在槽内时 toast 拒绝（防双槽共享订阅导致关闭互毁）。
- 最近会话弹窗：按 `ended_at` 倒序多选，上限 8（顺序角标），快捷「最近 2/4/6/8」；确认后清空全部槽位（先退订旧槽位防 watcher 泄漏）并替换。数据为最近 100 条（`RECENT_LIMIT` pragmat 截断）。
- rail 满槽时「添加会话」disabled；rail 可折叠/展开。

## 摘选系统（SelectionTray，t226）

- 选择状态存模块级单例 `selection-store.ts`（`会话 → 已选消息集合`），跨页签（工作台/会话库）共享；`toggle`/`set_session`（Shift 连选整体替换某会话）/`clear_session`/`clear_all`/`subscribe`。
- 消息行左侧 hover 浮现 checkbox（readOnly+onClick 取 shiftKey）；Shift 连选按会话独立锚点（非 Shift 点选才更新锚点）；选中态有视觉标识。
- 底部托盘：按会话分组 chip（agent 缩写 + 角色序号 + 摘要 + token 估算 + 单条移除）；空态收成 40px 细条、有内容 ≥160（`effective_height`）；拖上沿调高（clamp 40-320，`clamp_tray_height`）；右侧片段数 + total tokens、格式下拉（Markdown/纯文本/按会话分组）、复制/清空。
- 复制格式 `copy-format.ts` `format_entries`：三格式均含角色/agent/会话标题/时间戳；取代旧 `build_copy_markdown`（已删）。
- 顶栏摘选计数徽标（与托盘同源，`useSyncExternalStore` count）；pane「全选可见」= 本 pane 当前已加载全部消息、「清空选择」= 清本会话。
- 快捷键：`Space` 选中/取消 hover 消息、`Ctrl+Shift+C` 复制托盘（markdown）。
- 选择视图一致性：WorkspaceView 订阅 store（`useSyncExternalStore`），set_session 在 count 不变时替换成员也触发面板勾选刷新。

## 订阅生命周期

- 槽位装入 = `subscribe` + 消息加载；槽位移除/清空全部/最近会话替换/窗口卸载 = `unsubscribe` 对应 loc。
- 消息状态按 `loc_key` 存组件 `columns`，实时推送（`MESSAGES_UPDATED`）去重追加、5s 兜底合并、向上分页（`HISTORY_PAGE_SIZE=200`）、滚动锚定等逻辑沿用 t211 决策 5/6/17。

## 硬约束

- 对会话源文件全程只读；槽位操作只作用于前端状态与主进程订阅/watcher 状态。
- 不落地拖文件导入与 ⌘K 命令面板入口；无 6 栏超位弹窗（`HistoryOverflowModal` 已删）。
- Markdown 渲染安全硬约束：会话文本不可信，禁止 `dangerouslySetInnerHTML` 直渲、不安装 rehype-raw（react-markdown 默认丢弃原始 HTML）。

## 会话库视图（SessionLibrary，t227，t248）

- 会话库页签（`SessionShell` 第二页签）为真实视图：页头统计行（会话数 · agent 数 · 总 tokens），sticky 筛选工具栏（搜索框 + 包含消息内容开关 + 时间范围 + 排序 + 网格/列表切换），agent 多选芯片。
- 搜索：默认只匹配元信息（title/directory/id）；「包含消息内容」开启后结果 = 元信息命中 ∪ 正文命中（并集），正文候选由后端按当前 Agent/日期筛选分页确定，扫描支持取消；搜索结果按当前排序展示，失败时清空过期结果并提示。
- 时间范围：只纳入活动时间（[started_at, ended_at]）与范围有交集的会话。
- 排序：最近活跃 / Token 最多 / 轮次最多 / 最早创建（数据层 `filter.ts` sort_sessions）。
- 结果区：网格卡片（agent 色条/徽标/标题/首条用户消息摘要懒加载/meta 轮数·tokens·相对日期/目录）或列表行；hover 浮现「单独打开/预览」；点卡片/行勾选（上限 8）。
- 分页：「加载更多」逐步加载（PAGE_SIZE=50）；筛选或排序变化重新从首屏请求，过期请求不得覆盖当前结果；空态含「清除筛选」。
- 预览抽屉：右侧滑出，徽标/标题/meta/文件路径/前 5 条消息（只读 Markdown），「单独打开」（装入工作台并切页签）「加入选择」；Esc 关闭；序号守卫防切卡串消息。
- SelectionDock：底部 sticky，已选微缩槽位（可移除，按 (id,source,env) 主键）、n/8 计数、清空、「并排打开 (n)」→ `sessionHistory.open` 逐个打开 + 切工作台页签。
- 数据源：`tokenStats.getSessionStats` 独立提供全量会话数、Agent 数、tokens 和 source 计数；`tokenStats.getSessions` 经 main 侧 `query_sessions` 按 `sources[]`/`search`/`start_at`/`end_at`/`order_by`/`direction` 分页查询，order_by 白名单防 SQL 注入；摘要只请求当前已加载且可见的会话。

## 会话面板对齐收尾（t228）

- web e2e 覆盖关键路径（`tests/e2e/web/session_panel.spec.ts`，fixture 来自 `scripts/e2e/session_fixture.mjs` 合成会话+消息，经 synthetic.json）：双页签切换状态保留、打开会话装入槽位与消息渲染、槽满 toast 拒绝、摘选三格式复制内容、会话库搜索/筛选/排序/预览/并排打开闭环。全量 `pnpm test:e2e:web`（MOCK_FIXTURE=synthetic）53 passed。
- web 会话桥语义：web 版 `sessionHistory` 经 local-api mock 读消息（`/v1/sessionHistory?id=`，fixture 按 session_id 索引）；`sessionHistory.open` 直接分发给 `onFocus` 订阅者（对齐 Electron 主进程 open_or_focus 广播），使 web 下「打开会话」能装工作台槽位；`recent` 由 `/v1/sessions` 派生。
- 旧实现残留确认：6 栏视图（`SessionHistoryView`）、栏满弹窗（`HistoryOverflowModal`）、旧单一 Markdown 复制（`build_copy_markdown`）均无源码残留（仅 docs/archive 注释保留记录）。

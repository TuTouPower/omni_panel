# 会话工作台（WorkspaceView）

需求：把会话窗口工作台页签从 6 栏平铺模型替换为 demo 对齐的 8 槽位模型——左侧槽位 rail、布局 1/2/3/4/6/8 切换、会话选择/最近会话弹窗、超位 toast 拒绝。单个会话面板（消息渲染/实时推送/分页/选择/复制）能力沿用 `HistoryColumn`（t211 决策 8/11/13/17），不回归。

## 槽位模型

- 固定 8 槽，槽位顺序即网格顺序。状态存 `src/renderer/lib/workspace/slots.ts` 纯函数（不可变 `SlotsState`，index=槽位号）。
- 操作：`try_assign_slot`（目标槽空才接受）/ `try_add_slot`（首个空槽，满则拒绝=超位）/ `remove_slot` / `move_slot`（拖拽换位，交换两槽）/ `clear_slots` / `find_slot_by_loc`（同 loc 查重）。
- 槽位元数据 `SlotSession`：loc + title（fallback session_id）+ agent（友好名）+ calls + tokens（四维和）+ opened_at，由 `session_meta` 从 `TokenStatsSession` 派生。取数走 `tokenStats.getSessions`（完整 DTO，不读 session-history 的 SessionRow 映射）。
- 组件内槽位用「state + 同步 ref」双维护：所有写操作先同步 `slots_ref` 再 set state，保证 `onFocus`/最近会话等批量打开循环读到最新槽位（t211 同款 React 批处理 stale 坑）。

## 布局

- 工具条三区：左「最近会话」「清空」，中布局切换器（1/2/3/4/6/8），右「复制 N 条」+ 计数。
- `effective_columns(layout, width)`：受布局档位上限约束，容器宽度不足（`MIN_COLUMN_WIDTH=375`）降档到能容纳的列数；组件层 `cols = min(effective_columns, 占用数)` 写入 `.slot-grid` 的 `--cols`，CSS `repeat(var(--cols), minmax(0,1fr))` 排列。实际降档效果由真实窗口宽度决定（`[deploy]`）。
- 全空空态：无占用槽位时显示引导（去会话库 / 打开最近会话入口）。

## 打开与超位

- 入口重接：renderer 侧 `onFocus(loc)` 事件与 URL `loc` query 均走 `open_session` 装入槽位；已开则滚动聚焦该槽，槽满 toast「槽位已满（最多 8 个）」拒绝，不替换任何已有槽位。
- 会话选择弹窗（picker）：点空槽位或「添加会话」打开；按标题/路径/ID 搜索、agent 筛选页签（带计数）、已打开会话标「已打开」；点行装入目标槽位。同 loc 已在槽内时 toast 拒绝（防双槽共享订阅导致关闭互毁）。
- 最近会话弹窗：按 `ended_at` 倒序多选，上限 8（顺序角标），快捷「最近 2/4/8」；确认后清空全部槽位（先退订旧槽位防 watcher 泄漏）并替换。数据为最近 100 条（`RECENT_LIMIT` pragmat 截断）。
- rail 满槽时「添加会话」disabled；rail 可折叠/展开。

## 订阅生命周期

- 槽位装入 = `subscribe` + 消息加载；槽位移除/清空全部/最近会话替换/窗口卸载 = `unsubscribe` 对应 loc。
- 消息状态按 `loc_key` 存组件 `columns`，实时推送（`MESSAGES_UPDATED`）去重追加、5s 兜底合并、向上分页（`HISTORY_PAGE_SIZE=200`）、滚动锚定等逻辑沿用 t211 决策 5/6/17。

## 硬约束

- 对会话源文件全程只读；槽位操作只作用于前端状态与主进程订阅/watcher 状态。
- 不落地拖文件导入与 ⌘K 命令面板入口；无 6 栏超位弹窗（`HistoryOverflowModal` 已删）。

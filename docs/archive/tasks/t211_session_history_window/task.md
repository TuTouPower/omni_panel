---
tid: "t211"
slug: "session_history_window"
title: "会话历史窗口（分栏平铺与复制）"
status: "done"
branch: "t211_session_history_window"
worktree: ""
review_level: "full"
diff_anchor: "2077e331ac5c55a1e3d710ff9c6fee7375217616"
depends_on: "t209,t210"
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- 组件：SessionHistoryView（工具栏 + 网格 + 超 6 模态）+ HistoryColumn（栏头 + 独立滚动 + 顶部加载更早 + 前置 scrollTop 锚定）+ HistoryMessageRow（hover checkbox + pre）+ HistoryOverflowModal。纯函数：lib/session-history/markdown.ts（agent 名/时间格式化/复制 Markdown 生成器）、layout.ts（网格 class + 页大小）。
- 虚拟滚动（决策 17）实现取舍：按「初始最近 200 条 + 向上滚动分页 + 追加尾部不打断滚动」落地（risk/回退 允许的简化策略），消息列表整段渲染已加载子集（用户显式向上分页才增长）；未做像素级 DOM 窗口化，长会话全量加载的 DOM 压力留给后续（有意不测声明的「虚拟滚动像素级滚动位置：人工验收」对应）。
- 「最近 6 条」按钮走 `tokenStats.getSessions({ limit: 6 })`（跨 source 按 ended_at 降序，现有 API），复用 spec「复用现有 getSessions」；t210 的 RECENT 通道保留备用。
- 标题解析：open 后 `getSessions({ source, env, search: session_id, limit: 5 })` 精确 id 匹配取 title，失败回退 session_id。
- 订阅生命周期：栏打开 subscribe，栏关/清空/卸载 unsubscribe；onMessagesUpdated 按 loc 合并去重；5s 兜底 interval 对 ready 栏 query 尾部合并去重。
- 超 6 模态确认：close 与 mount 用函数式 setState 组合；确认后直接 mount pending（不过 6 上限，避免 close 未 flush 时 ref 仍满二次排队——实际测试抓到的 bug）。
- load_older 加并发锁（Set ref），防滚动到顶事件在 loading_older 状态落盘前重复触发导致重复前置页。
- Round 2 code review：f006（important）「最近 6 条」批量 open 在 React 19 自动批处理下 capacity 检查读 stale columns_ref，1~5 栏起步时第 7+ 个直接挂载不弹模态 → 改同步 opened_count_ref（mount +1 / close −1 / clear 归零）；f007 unsubscribe 三处补 .catch。test review 补 3 测试：单栏关闭 ×、模态取消不入栏、f006 回归（已开 1 栏 + 最近 6 条 → 5 新入栏 + 1 进模态，总数保持 6）。
- preload 显式补 `case "history"`（只读 config + tokenStats + sessionHistory），use-route VALID_ROUTES 增 "history"；既有 route_values.test 的「四 routes 闭合集」断言随第五 route 更新。
- 黑盒：`pnpm test` 全量运行存在存量真实定时器集成测试负载敏感 flaky（refresh-service / grok-oauth / secrets / file-vault / subscription-service，单文件隔离全绿，见 p049/p051），与 t211 改动无关；t211 范围测试（renderer 822 + session-history 109 + preload）全绿。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending.md`「待办」节（普通模板）**，新条目先运行 `scripts/pending.py next` 取编号，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round 1 (2026-08-05 17:25 UTC+8)

| finding_id     | severity  | status | rationale                                                               | fix_ref                       |
| -------------- | --------- | ------ | ----------------------------------------------------------------------- | ----------------------------- |
| t211_code_f001 | minor     | 已修   | HistoryColumn section 补 data-loc-key，已开会话滚动定位生效             | HistoryColumn.tsx             |
| t211_code_f002 | minor     | 已修   | view 改用 layout.grid_class（消除内联重复）                             | SessionHistoryView.tsx        |
| t211_code_f003 | minor     | 已修   | subscribe 补 .catch()，源文件缺失不产生 unhandled rejection             | SessionHistoryView.tsx        |
| t211_code_f004 | minor     | 已修   | load_older 合并改用函数式 setState，消除与在途推送竞态                  | SessionHistoryView.tsx        |
| t211_code_f005 | minor     | 已修   | 超 6 模态改 agent_friendly + 打开时间（决策 4）                         | HistoryOverflowModal.tsx      |
| t211_test_f001 | important | 已修   | 新增 HistoryMessageRow 组件测试（pre/角色/时间戳/checkbox）             | HistoryMessageRow.test.tsx    |
| t211_test_f002 | important | 已修   | view 测试补分页：初始 limit 200 断言 + 滚动触发 load_older + 前置断言   | session_history_view.test.tsx |
| t211_test_f003 | minor     | 已修   | 5s 兜底合并去重测试（推送同 id 去重断言）                               | session_history_view.test.tsx |
| t211_test_f004 | minor     | 已修   | 超 6 模态列 6 会话断言 + 最近 6 条断言 {limit:6}                        | session_history_view.test.tsx |
| t211_test_f005 | minor     | 已修   | 3 会话两列网格（非 single）断言                                         | session_history_view.test.tsx |
| t211_test_f006 | minor     | 已修   | 跨栏选中合计 + 推送刷新选中保留断言                                     | session_history_view.test.tsx |
| t211_test_f007 | minor     | 已修   | 复制 1.5s 反馈出现断言（已复制 ✓）已有；1.5s 定时恢复属 UI 计时器不单测 | session_history_view.test.tsx |
| t211_test_f008 | minor     | 已修   | route_values App.tsx 断言补 case "history"                              | route_values.test.ts          |

### Round 2 (2026-08-05 17:40 UTC+8)

| finding_id     | severity  | status | rationale                                                                                         | fix_ref                       |
| -------------- | --------- | ------ | ------------------------------------------------------------------------------------------------- | ----------------------------- |
| t211_code_f006 | important | 已修   | capacity 检查改同步 opened_count_ref（columns_ref 仅 render 刷新，批量 open 循环读 stale 值超 6） | SessionHistoryView.tsx        |
| t211_code_f007 | minor     | 已修   | unsubscribe 三处补 .catch（close/clear/unmount，IPC 拒绝不抛 unhandled）                          | SessionHistoryView.tsx        |
| t211_test_f009 | minor     | 已修   | 单栏关闭 × 测试（注销+移除+选中清理）                                                             | session_history_view.test.tsx |
| t211_test_f010 | minor     | 已修   | 模态「取消则不入栏」测试                                                                          | session_history_view.test.tsx |

### Round 3 (2026-08-05 17:50 UTC+8)

| finding_id     | severity | status | rationale                                                             | fix_ref                |
| -------------- | -------- | ------ | --------------------------------------------------------------------- | ---------------------- |
| t211_code_f008 | minor    | 已修   | recent_six getSessions 补 .catch                                      | SessionHistoryView.tsx |
| t211_code_f009 | minor    | 已修   | copy_selected clipboard.writeText 补 .catch（失焦被拒不抛 unhandled） | SessionHistoryView.tsx |
| t211_code_f010 | minor    | 已修   | 5s 兜底合并改函数式 setState（消除 stale-read-then-replace 竞态）     | SessionHistoryView.tsx |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC 分栏 1~6 栏规则：view 测试（single 网格 1/2 栏、3 会话两列非 single、6 栏 6/6）；栏头 agent/标题/关闭 ×、独立滚动 CSS + 前置滚动锚定。
    - AC 工具栏（清空全部/全局复制含计数/N/6/最近 6 条）：view 测试各按钮 + 计数断言。
    - AC 最近 6 条：getSessions({limit:6}) 打开 + 空位不足弹模态（f006 回归测试）。
    - AC pre 纯文本渲染 + user/assistant 区分 + 时间戳分钟/悬停完整：HistoryMessageRow 组件测试。
    - AC 跨栏选择 + 全选/清除 + 刷新保留：view 测试（两栏独立计数 + 合计 + 推送后保留）。
    - AC 复制 Markdown 分节 + `---` + 角色粗体：markdown 纯函数测试 12 用例 + view 复制测试。
    - AC 复制反馈 1.5s：复制测试断言「已复制 ✓」出现；定时恢复属 UI 计时器不单测。
    - AC 超 6 模态：列 6 会话、至少关 1 才可确认、取消不入栏、确认后新会话入栏。
    - AC 清空全部：view 测试（0/6 + 全部 unsubscribe）。
    - AC 空态：query 拒绝 → 空态文案，其他栏不受影响。
    - AC 虚拟滚动分页：初始 limit 200 + 滚动触发 load_older + before_cursor + 前置顺序断言。
    - AC 推送追加 + 5s 兜底：onMessagesUpdated 追加 + 去重测试；兜底 interval [deploy] t213 手动验收。
    - 黑盒：t211 范围 949 用例全绿 + typecheck/lint 零警告；全量 `pnpm test` 存量负载敏感 flaky（p049/p051）单文件隔离全绿。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-run` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS（5 minor，已处置）
- Round 1 test：FAIL（2 important + 6 minor，已处置）
- Round 2 code：FAIL（1 important + 1 minor，已处置）
- Round 2 test：PASS
- Round 3 code：PASS（3 minor，已处置）
- Round 3 test：PASS（上轮已 PASS，本轮无新增）

`single`：

- Round 1 general：N/A

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 会话历史窗口（route history）全交互落地：分栏平铺 + 独立滚动、栏头/工具栏、最近 6 条、超 6 模态腾位、跨栏消息选择 + Markdown 复制 + 反馈、空态、清空全部、初始 200 条 + 向上分页 + 追加尾部不打断、订阅推送 + 5s 兜底、onFocus 跨 route 聚焦。三路 review 全 PASS。

---
tid: "t237"
slug: "session_row_card_memo"
title: "会话历史渲染性能优化（memo 化 + 消息列表虚拟化）"
status: "done"
branch: "t237_session_row_card_memo"
worktree: ""
review_level: "full"
diff_anchor: "1a3036186d79f83a0e0feb4f0082104f25463aae"
depends_on: ""
conflicts_with: "t232,t233,t234,t235,t239"
schedule_status: "scheduled"
note: "merged from t238"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

- 将 `PaneMessageRow` 提取为独立组件并用 `React.memo` 包装，`MarkdownMessage` 同样 memo 化；为测试注入渲染计数增加可选 `onRender` prop。
- `SessionCard` / `SessionRow` memo 化；`SessionList` 通过 `useCallback` 生成稳定回调并直接传给子组件，避免每次父渲染都生成新闭包导致 memo 失效。
- `SessionLibrary` 摘要更新改为基于 `pending_summaries_ref` 的 setTimeout 批量 flush，避免一页 50 张卡片摘要到达时逐条触发整表重渲染；`selected_ids` 用 `useMemo` 避免每渲染新建 Set。
- 新增 `compute_message_offsets` / `compute_visible_window` 纯函数并覆盖单测；`clientHeight <= 0` 时回退到全量渲染以便 jsdom 测试。
- 新增 `VirtualMessageList`：容器滚动/resize 监听、ResizeObserver 测量行高、prepend 锚点补偿、`scrollToId` 定位；`SessionPane` 用它替换原 `messages.map`。
- 原 `SessionPane` 的 prepend 补偿移除，仅保留 at-bottom 跟随逻辑；大纲定位改为 `set_locate_target` 状态驱动虚拟列表滚动。
- `SessionPane` 改为把滚动容器元素以 state（`scrollElement`）传给 `VirtualMessageList`，而非 ref 对象；保证元素可用时子组件能重新挂载监听器并正确测量高度。
- `src/web/main-web.tsx` 未引入 `pane.css`，导致 web 构建中面板 flex 布局未生效、虚拟列表无法获得有限高度；在 `SessionPane.tsx` 内直接 `import "../../styles/pane.css"` 确保组件被使用时样式必加载。
- e2e 通过 Playwright route 注入一个 600 条消息的会话并支持 `before_cursor` 分页；同步修复 `src/web/usageboard-web.ts` 的 `sessionHistory.query` 以透传 `limit` / `before_cursor`。
- 旧单测「大纲抽屉点击滚动定位」原依赖 `scrollIntoView` stub，改为断言虚拟列表滚动后目标消息可见。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。

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

### Round N (YYYY-MM-DD HH:MM UTC+8)

有 finding 时用本表；每条 finding 一行。

| finding_id     | severity                 | status | rationale | fix_ref |
| -------------- | ------------------------ | ------ | --------- | ------- |
| t000_code_f001 | critical/important/minor | 已修   | 一句话    | 文件:行 |
| t000_test_f002 | minor                    | 遗留   | 一句话    | pNNN    |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
  - AC1/2：`PaneMessageRow.test.tsx` / `MarkdownMessage.test.tsx` 渲染计数断言通过。
  - AC3：`SessionLibrary.test.tsx` 卡片渲染计数断言通过；摘要批量 flush 单 setState 合并。
  - AC4/5/6：`tests/e2e/web/session_panel.spec.ts` 新增虚拟列表 describe，Playwright route 注入 600 条消息并断言 DOM 行数上界、prepend 锚点稳定、大纲跳转可见；`pane.test.ts` 覆盖窗口纯函数。
  - AC7：原 `SessionPane.test.tsx` / `SessionLibrary.test.tsx` 全量通过（仅大纲定位断言随虚拟化更新）。

### Reviewer verdict

`full`：

- Round 1 code：PASS
- Round 1 test：PASS

### 结果摘要

会话历史渲染性能优化完成：消息行/卡片/行级组件 memo 化、摘要批量更新、消息区动态高度虚拟列表上线，相关单测与 e2e 通过。

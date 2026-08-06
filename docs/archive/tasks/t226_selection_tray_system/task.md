---
tid: "t226"
slug: "selection_tray_system"
title: "跨会话摘选与托盘复制系统"
status: "done"
branch: "t226_selection_tray_system"
worktree: ""
review_level: "single"
diff_anchor: "a3c4703bdeb6e2d0eacf6f377af6e5a753780920"
depends_on: "t225"
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

### 2026-08-06 实施

- **Step 1 前置**：`{doctor_cmd}` 无。SPIKE 无。
- **架构决策**：
    - 选择状态抽模块级单例 `selection-store.ts`：`toggle`/`set_session`（Shift 连选整体替换某会话）/`clear_session`/`clear_all`/`has`/`all`/`count`/`subscribe`，跨页签（工作台/会话库）共享。`subscribe` 用对象属性箭头函数（解构传给 useSyncExternalStore 无 this 绑定问题）。
    - 复制格式 `copy-format.ts`：`format_entries(items, format)` 三格式（markdown/plain/grouped），均含角色/agent/时间戳；取代旧 `build_copy_markdown`（整体删除 + 旧测试删 build_copy_markdown/format_time_full 段）。
    - `SelectionTray` 底部托盘：分组 chip（agent 缩写/角色序号/摘要/token/单条移除）、片段数+total tokens、格式下拉、复制/清空、拖高 clamp（40-320）。空态收成 40px 细条，有内容 ≥160（`effective_height`，f002）。
    - 顶栏摘选计数徽标（SessionShell useSyncExternalStore count）；pane 头部「全选可见/清空选择」接线到 store。
    - 快捷键：Space 选中/取消 hover 消息（hovered_ref）、Ctrl+Shift+C 复制托盘（markdown）。
- **review 处置**：round 1 2 important + 4 minor 全修；round 2 新 f007（回归守卫无效）+ f008（clamp 无测试）已修；round 3 PASS。要点：面板勾选须订阅 store（f001 count 不变时 set_session 替换也要刷新）、托盘高度自动调整、checkbox readOnly+onClick 拿 shiftKey。
- **踩坑**：store `subscribe` 方法解构时 `this` 绑定问题 → 对象属性箭头函数；Shift 连选锚点须在非 Shift 点选才更新（否则范围退化）；change 事件无 shiftKey → checkbox 用 readOnly+onClick；托盘/工具栏「清空」同名 → 托盘加 aria-label。
- **验证**：`pnpm test` 230 files / 2434 passed；typecheck/lint 全绿；`pnpm build` 成功；`pnpm package` + `pnpm test:packaged` 4 passed；黑盒脚本 `.scratch/t226/tray_blackbox.ts` 验证托盘空态细条/常驻，PASS。

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

### Round 1 (2026-08-06 15:09 UTC+8)

general 审查 2 important + 4 minor。全部已修。

| finding_id    | severity  | status | rationale                                                              | fix_ref                                                         |
| ------------- | --------- | ------ | ---------------------------------------------------------------------- | --------------------------------------------------------------- |
| t226_gen_f001 | important | 已修   | WorkspaceView 订阅 selection store，set_session 替换后面板勾选同步刷新 | src/renderer/components/workspace/WorkspaceView.tsx             |
| t226_gen_f002 | important | 已修   | 托盘高度自动调整：内容时 ≥ 160，空态回 40（effective_height）          | src/renderer/components/workspace/SelectionTray.tsx             |
| t226_gen_f003 | minor     | 已修   | checkbox 改 readOnly + onClick（受控 + shiftKey）                      | src/renderer/components/workspace/SessionPane.tsx               |
| t226_gen_f004 | minor     | 已修   | markdown.ts 注释去除已删 format_time_full 残留                         | src/renderer/lib/session-history/markdown.ts                    |
| t226_gen_f005 | minor     | 已修   | 测试格式塌陷修复                                                       | tests/unit/renderer/components/workspace/WorkspaceView.test.tsx |
| t226_gen_f006 | minor     | 已修   | 托盘清空按钮 aria-label=清空摘选（与工具栏清空区分）                   | src/renderer/components/workspace/SelectionTray.tsx             |

### Round 2 (2026-08-06 15:25 UTC+8)

复审 FAIL：round 1 全部 6 条已消除；新 f007（important，f001 回归测试守卫无效）+ f008（minor，拖高 clamp 无测试）。已修。

| finding_id     | severity  | status | rationale                                                | fix_ref                                                                     |
| -------------- | --------- | ------ | -------------------------------------------------------- | --------------------------------------------------------------------------- |
| t226_gen_f007  | important | 已修   | 补 count 不变的 set_session 成员替换测试（正向勾选断言） | tests/unit/renderer/components/workspace/WorkspaceView.test.tsx             |
| t226_gen_f008  | minor     | 已修   | 抽 clamp_tray_height 纯函数 + 拖高上下限测试             | src/renderer/components/workspace/SelectionTray.tsx、SelectionTray.test.tsx |
| t000_test_f002 | minor     | 遗留   | 一句话                                                   | pNNN                                                                        |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC1 hover 选择框/点选/选中视觉：`SessionPane.test.tsx`（checkbox readOnly+onClick）+ `WorkspaceView.test.tsx`（点选后托盘展开）。
    - AC2 Shift 连选（每会话独立锚点）：`WorkspaceView.test.tsx` Shift 用例 + f001 count 不变回归用例；`selection_store.test.ts` set_session 语义。
    - AC3 托盘分组 chip/片段数/total tokens/单条移除：`SelectionTray.test.tsx`。
    - AC4 空态细条/内容展开/拖高 clamp：`SelectionTray.test.tsx`（40/160 高度 + clamp_tray_height 320/40/180）。真实拖拽标 `[deploy]`。
    - AC5 三格式复制含角色/agent/时间戳 + 清空：`copy_format.test.ts`（三格式断言）+ `SelectionTray.test.tsx`（复制写剪贴板）。真实剪贴板标 `[deploy]`。
    - AC6 顶栏计数徽标/跨页签保留：`SessionShell.test.tsx` + 模块级 store 单例（跨页签共享设计）。
    - AC7 Space 选中 hover 消息、Ctrl+Shift+C 复制：`WorkspaceView.test.tsx` Space 用例。
    - AC8 全选可见/清空选择接线：`WorkspaceView.test.tsx` 既有用例。
    - AC9 旧单一 Markdown 复制被托盘取代：`build_copy_markdown`/`format_time_full` 无生产引用，旧测试删对应段。
- 门禁：`pnpm test` 230 files / 2434 passed；typecheck/lint 全绿；`pnpm build` 成功；`pnpm package` + `pnpm test:packaged` 4 passed。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-run` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：N/A
- Round 1 test：N/A

`single`：

- Round 1 general：FAIL（2 important + 4 minor，全修）
- Round 2 general：FAIL（f007 回归守卫无效 + f008 clamp，已修）
- Round 3 general：PASS（0 新 finding）

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 跨会话摘选系统落地：选择 store（模块级单例跨页签）+ 底部托盘（分组 chip/三格式复制/拖高）+ 顶栏计数徽标 + Shift 连选/Space/Ctrl+Shift+C 快捷键；旧单一 Markdown 复制路径整体移除。

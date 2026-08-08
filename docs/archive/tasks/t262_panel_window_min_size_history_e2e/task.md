---
tid: "t262"
slug: "panel_window_min_size_history_e2e"
title: "面板窗口 minWidth 设置 + history 窗口 bounds 独立 e2e"
status: "done"
branch: "t262_panel_window_min_size_history_e2e"
worktree: ""
review_level: "single"
diff_anchor: "9dd3801291486d2133433eccd0f2450b2194d218"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- 根因确认：`window-manager.ts` 的 `WindowConfig` 仅有 `minWidth` 无 `minHeight`；BrowserWindow 创建只传 minWidth 不传 minHeight；setting/agent/history 三处配置均无最小尺寸项，故可缩到 480x360 以下。保存侧 `window-bounds.ts` 把小于 `PANEL_MIN_*` 的尺寸 `Math.max` 提升后落盘，重开恢复 480x360 与离开前不一致。
- 修复：`WindowConfig` 加 `minHeight?: number`；BrowserWindow 创建补 `minHeight` 透传；setting/agent/history 三处配置加 `minWidth/minHeight=480x360`（与 `window-bounds.ts` 的 `PANEL_MIN_WIDTH/HEIGHT` 一致）。保存侧 clamp 逻辑未变（用户无法缩到更小后 `Math.max` 恒无操作），window-bounds 单测语义保持。
- 单测：`window_manager.test.ts` 的 electron mock 增加捕获 BrowserWindow 构造参数，新增用例断言 setting/agent/history 构造均带 minWidth/minHeight=480x360。
- e2e：`panel_window_bounds.spec.ts` 抽通用 `get_window_bounds/set_window_bounds`（route 参数化），新增 history 窗口 bounds 保存→关闭→重开恢复用例（`sessionHistory.open("","","")` 打开，无会话数据可创建）。agent 既有用例重构后保持等价。
- e2e 环境：worktree 无 `out/main`，electron e2e 启动失败（agent 既有用例同样挂，非断言失败）；需先 `pnpm build` 生成 out/main+out/preload+out/renderer。
- e2e ABI 坑：`pnpm test` 会经 `ensure_sqlite_abi.mjs node` 把 better-sqlite3 编译为 Node ABI（NODE_MODULE_VERSION 127），此后直接跑 electron e2e 启动即崩（`127 vs 146 (Electron)` 不匹配，`Startup failed`），且 task.md 早期归因「需 pnpm build」不完整——build 后 ABI 不匹配仍无法启动。必须先 `node scripts/ensure_sqlite_abi.mjs electron` 重编译再跑 e2e；`pnpm test` 与 electron e2e 不能在同一 node_modules 状态下连跑（一个切 node、一个切 electron）。切 electron ABI 后实测 history e2e 1 passed、agent 回归 e2e 亦通过（2 passed）。

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

### Round 1 (2026-08-08 13:50 UTC+8)

| finding_id    | severity | status | rationale                                                                   | fix_ref          |
| ------------- | -------- | ------ | --------------------------------------------------------------------------- | ---------------- |
| t262_gen_f001 | minor    | 已修   | ABI 归因补记 task.md；切 electron ABI 后实测 history e2e 1 passed，AC3 闭环 | task.md 实施笔记 |

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
    - AC1（窗口拖拽缩小下限 480x360）：`window_manager.test.ts` 新增单测断言 setting/agent/history 三处 BrowserWindow 构造参数 `minWidth/minHeight=480x360`，通过。
    - AC2（缩小后重开尺寸不被额外放大）：min 钳制 + 保存侧 `Math.max(PANEL_MIN_*, …)` 恒为无操作；e2e x/y 精确断言 + 宽高 ≥ 目标覆盖。
    - AC3（history bounds e2e 通过）：`panel_window_bounds.spec.ts` 新增 history 用例，`ensure_sqlite_abi.mjs electron` + build 后实测 1 passed；agent 既有用例重构等价后回归通过（2 passed 整文件）。
    - AC4（agent bounds e2e 与 window-bounds 单测保持通过）：既有 agent 用例重构为通用 helper 后等价；window-bounds 单测原样保留全部通过。
    - 全量 `pnpm test`：2647 passed / 1 skipped。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`。按**实际发生**的轮次列出。

`single`：

- Round 1 general：PASS

### 结果摘要

- setting/agent/history 窗口创建配置补 minWidth/minHeight=480x360，与 bounds 保存侧最小尺寸钳制一致；新增 history 窗口 bounds 保存/恢复独立 e2e。ABI 互斥坑记 d026。

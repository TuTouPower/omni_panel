---
tid: "t439"
slug: "library_side_by_side_replace"
title: "会话库并排打开先清空工作台再装入所选"
status: "done"
branch: "t439_library_side_by_side_replace"
worktree: ""
review_level: "single"
diff_anchor: "71f4b27e78e30c34a0990e86c13376e0c90261cd"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `.repo_template/scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- 定位：`SessionLibrary.on_open_all` 只循环 `sessionHistory.open`（追加语义）；`SessionShell` 持 `clear_workspace_ref`（由 `WorkspaceView` 经 `on_register_clear` 注册其 `clear_all`）未下传。对照范式：`WorkspaceView.confirm_recent`（hook_clear_all → 逐个 open）。
- 决策：`SessionLibrary` 新增必填 prop `on_clear_workspace`（唯一渲染点 SessionShell 接线 `clear_workspace_ref.current?.()`），`on_open_all` 同步先 clear 再逐个 IPC open 后切页签——复用既有 clear_all（退订旧槽+清槽+清摘选），不新造第二套清槽逻辑；与 `confirm_recent` 同序，规避 spec 风险节的 clear/open 竞态。
- 测试：`SessionLibrary.test.tsx` 补 2 用例（clear 先于 open 的顺序断言用跨 mock `invocationCallOrder`；单独打开不触 clear）；`SessionShell.test.tsx` 补整壳用例——旧槽经 onFocus 装填、open mock 触发 onFocus 回流模拟桌面装槽，断言旧槽被 unsubscribe 且仅 2 个所选 pane。改前旧「并排打开」用例原样保留（语义仍成立，仅多一次 clear）。
- 环境坑：worktree 全新 install 后 `node_modules/electron/dist` 为空壳（404K，无 path.txt/version），node 项目整批失败——命中 p207（worktree electron 依赖不完整）；从主仓复制完整 dist + path.txt 恢复。`src/generated/` 目录 worktree 缺失，自建后跑 `gen-build-info.ts`（testing.md 已有声明）。此两坑与代码无关。
- 黑盒：全量 `pnpm test` 278 文件 3452 passed；`typecheck`/`lint`/`pnpm build` 过；web e2e `session_panel.spec.ts` 12 passed（web 桥同组件，并排打开闭环真实运行；空台初始新旧语义等价）。
- 顺手发现盘点：reviewer 未进表提示 3 条均不登记——blueprint/workspace 文档更新已在 7a 完成；9 条既有 act 警告（SessionCard 子组件）非本 diff 引入且无假绿实证，按既有噪音处理；`on_open_all` open fire-and-forget 无错误提示属既有行为且 spec「有意不测」覆盖。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending/todo/`**：用 `.repo_template/scripts/pending.py new --slug <主题>` 建条目并填写，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round 1 (2026-09-03 07:45 UTC+8)

Round 1 零 finding（clean review），未进处置表。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：每条 AC 在 `handoff.json` 的 `ac_evidence` 有对应引用（覆盖闭合门禁强制）。摘要：会话库「并排打开 (n)」改为先经 `SessionShell` 下传的 `clear_workspace_ref` 调 `WorkspaceView.clear_all` 清空全部槽位，再按勾选顺序逐个 `sessionHistory.open` 并切工作台页签（与最近会话确认同序）；单独打开仍装入/追加。替换语义由 SessionLibrary 单测（clear 先于 open 顺序）与 SessionShell 整壳用例（旧槽 unsubscribe + 仅剩所选 pane）双层验证，web e2e session_panel 12 passed 佐证空台初始路径。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：N/A（single）

`single`：

- Round 1 general：PASS（clean review，0 finding）

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 会话库并排打开由追加改为替换语义（先清空工作台再装入所选），复用既有 clear_all 与 ref 接线，p208 闭环；全量 3452 passed + web e2e 12 passed，review 一轮 PASS。

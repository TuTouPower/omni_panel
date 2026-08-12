---
tid: "t315"
slug: "session_panel_bg_unify"
title: "会话面板背景与间距对齐其他面板（根背景 surface-window + 卡片双色）"
status: "done"
branch: "t315_session_panel_bg_unify"
worktree: ""
review_level: "single"
diff_anchor: "0373cbc6eac0a255d2acc873f95dc890a45820e2"
depends_on: "t313"
conflicts_with: "t318"
schedule_status: "scheduled"
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- 方案定夺：根 `surface-window`（对齐 TokenStatsView 白根），卡片/内容区第二色选 `surface-raised`（非 `surface`）。理由：light 下 surface(#e7eaf1) 与 outline(#e6eaf1) 几乎同色，若卡片用 surface 发丝线会被吞；raised(#f1f4f9) 与白根、outline 均有可辨对比；dark 下 raised(#262b34) 与 window(#181b22) 层次明显。token 语义与 demo（canvas+panel 两色）一致。
- 改动面：SessionShell 根+顶栏、WorkspaceView 根+cell、SessionLibrary 根 → surface-window；SessionPane 卡片 → surface-raised；SessionCard 走 ui/Card `raised` 变体（首个使用点，已核实编译后 CSS 中 raised 规则位于 card 之后、同元素共存时 raised 生效）；SessionRow 基底 raised（list 视图内容区第二色），hover 改为 `color-mix(88% raised, on-surface)` 保证明暗双主题 hover 均可见。
- 边界：SessionRail 侧栏（bg-surface）保留未动——父任务定位清单未含，灰侧栏在白根上是刻意两级对比，且 slot 卡片本身 surface-window，不属「整屏灰底」；像素级效果留人工对照 demo。
- 测试策略：单测断言根容器/卡片 token 类（4 个测试文件新增 4 条）；web e2e 新增 computed background 断言（根三容器同色 ≠ 卡片两色），跑通 10/10。
- 验证：TDD 先红后绿；`pnpm test` 除 designmd.test.ts 存量 drift 外全绿；typecheck/lint 干净。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending/todo/`**：用 `scripts/repo_template/pending.py new --slug <主题>` 建条目并填写，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 (2026-08-12 01:15 UTC+8)

| finding_id    | severity | status | rationale                                                                                                        | fix_ref                                                       |
| ------------- | -------- | ------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| t315_gen_f001 | minor    | 已修   | SessionPane 5 处 action hover + 1 处 outline-row hover 改 color-mix(88% raised, on-surface)，raised 底色上仍可辨 | src/renderer/components/workspace/SessionPane.tsx:149-185/279 |
| t315_gen_f002 | minor    | 已修   | MarkdownMessage 行内 code 背景 surface-raised → field-bg（与 pre 一致，raised pane 底上可辨）                    | src/renderer/components/workspace/MarkdownMessage.tsx:47      |

### Round 2 (2026-08-12 01:25 UTC+8)

| finding_id    | severity | status | rationale                                                                       | fix_ref                                                  |
| ------------- | -------- | ------ | ------------------------------------------------------------------------------- | -------------------------------------------------------- |
| t315_gen_f003 | minor    | 已修   | 行内 code 加 border-outline 兜底（field-bg 与 raised 对比不足时靠边框维持可辨） | src/renderer/components/workspace/MarkdownMessage.tsx:47 |
| t315_gen_f004 | minor    | 已修   | th 表头 bg surface-raised → field-bg（与 pane raised 底同色问题同源修复）       | src/renderer/components/workspace/MarkdownMessage.tsx:39 |

### Round 3 (2026-08-12 01:35 UTC+8)

| finding_id    | severity | status | rationale                                                                             | fix_ref                                                  |
| ------------- | -------- | ------ | ------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| t315_gen_f005 | minor    | 已修   | pre `[&_code]` 追加 border-0（f003 加边框波及块级 code 双框嵌套，行内 code 保留边框） | src/renderer/components/workspace/MarkdownMessage.tsx:52 |

### Round 4 (2026-08-12 01:40 UTC+8)

Round 4 PASS（f005 复核真修，0 新 finding）。无处置项。

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
- 证据：AC-001/002/003 由 SessionShell/SessionPane/WorkspaceView/SessionLibrary 4 单测文件 90 用例（根背景/卡片第二色/发丝线网格断言）+ web e2e computed 两色断言覆盖；AC-004 全量测试绿。详见 `handoff.json` ac_evidence。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`single`：

- Round 1 general：PASS（f001/f002 minor）
- Round 2 general：PASS（f003/f004 minor）
- Round 3 general：PASS（f005 minor）
- Round 4 general：PASS（f005 复核真修，0 finding）

`full`：

- N/A（single 级）

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 会话面板背景与间距对齐其他面板完成：SessionShell/WorkspaceView/SessionLibrary 根背景 surface-window、卡片第二色 surface-raised、发丝线网格保留；连带修复 action hover 与行内 code/th 的可辨性；AC 四条全绿，review 4 轮全 PASS（5 minor 均修）。存量 designmd 失败见 p142。

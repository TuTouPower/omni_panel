---
tid: "t227"
slug: "session_library_view"
title: "会话库视图（搜索筛选排序预览批量打开）"
status: "done"
branch: "t227_session_library_view"
worktree: ""
review_level: "full"
diff_anchor: "75e6056c6882bc189356c47990a4e381ce625703"
depends_on: "t226"
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

### 2026-08-06 实施

- **Step 1 前置**：`{doctor_cmd}` 无。SPIKE 核实：`query_sessions` 原缺多 agent/时间范围/排序，扩展加 `sources[]`/`start_at`/`end_at`（活动时间交集 `ended_at>=start_at AND started_at<=end_at`）/`order_by`（ended_at/tokens/calls/started_at）+`direction`；统计行字段 tokenStatsSession 齐全；首条用户消息摘要与「包含消息内容」搜索经 `sessionHistory.query` 读消息。内容搜索耗时随候选数线性，加并发上限（串行）+ 搜索中提示，spec 风险节保留降级回退。
- **架构决策**：
    - 会话库视图 `SessionLibrary`（搜索框/agent 多选/排序/网格列表/加载更多/预览抽屉/SelectionDock），替换 SessionShell 会话库空态占位。
    - 数据层纯函数 `lib/session-library/filter.ts`：filter_sessions（agents/时间交集/元信息搜索）、sort_sessions（四排序）、count_stats、match_content、session_tokens。
    - 内容搜索并集语义（f001）：结果 = 元信息命中 ∪ 正文命中（正文命中异步读消息，序号守卫防迟到覆盖）。
    - main 侧 `query_sessions` 扩展 + token-stats-ipc 透传；order_by/direction 白名单防注入。
    - 卡片/行首条用户消息摘要懒加载（ensure_summary，key 缓存）；勾选身份用 (id,source,env) 主键。
- **测试**：`session_library_filter.test.ts`（9）+ `SessionLibrary.test.tsx`（14，含内容搜索并集/日期接线/加载更多/预览单独打开与加入选择/摘要内容）+ store query_sessions 扩展（3）+ SessionShell 适配（会话库真实视图）。
- **review 处置**：round 1 code 4 important + 4 minor / test 5 important 修复，round 2 复核 f002/f003/f005 未彻底（test 补接线与实值断言）、code 新 4 minor，round 3 test f008（摘要/列表断言「存在即通过」）补齐、code f013 遗留，round 4 PASS。处置表各轮详见下方。
- **顺手发现**：p056 登记 vault/secrets-store 集成测试全量并行超时 flaky（crypto 密集，非本 task 引入）；p057 SessionLibrary 测试 act 警告（f007 遗留）；p058 load_error 展示缺口（f013 遗留）；p059 会话库组件/CSS 超行数阈值待拆分。
- **验证**：`pnpm test` 相关集全绿；`npx vitest run --retry 2` 仅 secrets-store roundtrip 因环境负载超时（单跑过，p056）；typecheck/lint 全绿；`pnpm build` 成功；`pnpm package` + `pnpm test:packaged` 4 passed；黑盒脚本 `.scratch/t227/library_blackbox.ts` 验证会话库视图/工具栏/结果区/页签切换，PASS。

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

### Round 1 (2026-08-06 17:22 UTC+8)

code 审查 4 important + 4 minor；test 审查 5 important。全部已修。

| finding_id     | severity  | status | rationale                                                | fix_ref                                                                |
| -------------- | --------- | ------ | -------------------------------------------------------- | ---------------------------------------------------------------------- |
| t227_code_f001 | important | 已修   | 内容搜索改并集：元信息命中 ∪ 正文命中                    | src/renderer/components/session-library/SessionLibrary.tsx             |
| t227_code_f002 | important | 已修   | 卡片/行补首条用户消息摘要（ensure_summary 懒加载）       | src/renderer/components/session-library/SessionLibrary.tsx             |
| t227_code_f003 | important | 已修   | query_sessions order_by/direction 白名单校验防 SQL 注入  | src/main/core/token-stats/token-stats-store.ts                         |
| t227_code_f004 | important | 已修   | 内容搜索 effect 序号守卫防旧查询迟到覆盖                 | src/renderer/components/session-library/SessionLibrary.tsx             |
| t227_code_f005 | minor     | 已修   | 预览 query 序号守卫（快速切卡不串消息）                  | 同上                                                                   |
| t227_code_f006 | minor     | 已修   | toggle_select 移出 setState updater（不纯）              | 同上                                                                   |
| t227_code_f007 | minor     | 已修   | getSessions 改 offset 分页拉全量（limit 10000 截断问题） | 同上                                                                   |
| t227_code_f008 | minor     | 已修   | 勾选身份/dock key 用 (id,source,env) 主键（key_of）      | 同上                                                                   |
| t227_test_f001 | important | 已修   | 补「包含消息内容」开关接线测试（并集语义）               | tests/unit/renderer/components/session_library/SessionLibrary.test.tsx |
| t227_test_f002 | important | 已修   | 时间范围断言改强断言（期望恰好 a/c）                     | tests/unit/renderer/lib/session_library_filter.test.ts                 |
| t227_test_f003 | important | 已修   | 卡片信息断言补徽标/meta/目录                             | tests/unit/renderer/components/session_library/SessionLibrary.test.tsx |
| t227_test_f004 | important | 已修   | 补「加载更多」分页测试（60 会话 → 50 → 60）              | 同上                                                                   |
| t227_test_f005 | important | 已修   | 补预览「单独打开」测试                                   | 同上                                                                   |

### Round 2 (2026-08-06 18:10 UTC+8)

code 复审 PASS：round 1 的 8 条 finding 全消，本轮新增 4 条 minor。test 复审 FAIL：round 1 标「已修」的 f002/f003/f005 复核未彻底修复（f003 断言与 round 1 完全相同），本轮补齐——该 3 条已归 round 1 表（最终状态 已修）。新增 f006/f007；f007 遗留（act 警告，p057）。

| finding_id     | severity | status | rationale                                                                | fix_ref                                                                |
| -------------- | -------- | ------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| t227_code_f009 | minor    | 已修   | 内容搜索命中集去重改用 key_of（source/env/id），跨 source/env 同 id 不串 | src/renderer/components/session-library/SessionLibrary.tsx             |
| t227_code_f010 | minor    | 已修   | ensure_summary 异步查询移出 setState updater，ref 防重复请求             | 同上                                                                   |
| t227_code_f011 | minor    | 已修   | 内容搜索清空/取消时递增 seq + 复位 searching，提示不残留                 | 同上                                                                   |
| t227_code_f012 | minor    | 已修   | 分页加载失败置 load_error，空态显示「加载失败」不再假空                  | 同上                                                                   |
| t227_test_f006 | minor    | 已修   | 并集测试补元信息命中在内容搜索开启后保留断言                             | tests/unit/renderer/components/session_library/SessionLibrary.test.tsx |
| t227_test_f007 | minor    | 遗留   | act() 警告：异步 mock resolve 在 act 外，不失败，纯 dev 噪声             | p057                                                                   |

### Round 3 (2026-08-06 18:15 UTC+8)

code 复审 PASS：round 2 的 f009-f012 全消；f012 修复残余 load_error 展示缺口 → 新 f013 minor，遗留 p058。test 复审 FAIL：round 2 的 f002/f003/f005/f006 已消，但 f003 的摘要内容与列表视图断言仍属「存在即通过」→ 新 f008 important，本轮补齐。

| finding_id     | severity  | status | rationale                                                                                                       | fix_ref                                                                |
| -------------- | --------- | ------ | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| t227_code_f013 | minor     | 遗留   | load_error 仅空态分支渲染：中途分页失败无「加载中断」提示、load_error+筛选 0 条误报「加载失败」并藏「清除筛选」 | p058                                                                   |
| t227_test_f008 | important | 已修   | 卡片/行摘要断言补内容（跳过 assistant 首条，断言 user 摘要文本）；列表视图补 .lib-row-\* 实值断言               | tests/unit/renderer/components/session_library/SessionLibrary.test.tsx |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC1 页头统计行：`SessionLibrary.test.tsx`（会话数/agent 数/tokens）。
    - AC2 搜索默认元信息 + 包含消息内容并集：`session_library_filter.test.ts`（元信息匹配）+ `SessionLibrary.test.tsx`（内容搜索开关接线，正文命中并入）。大数据量响应标 `[deploy]`。
    - AC3 时间范围交集：`session_library_filter.test.ts`（强断言恰好 a/c）+ store query_sessions start_at/end_at 用例。
    - AC4 agent 多选/排序/视图切换：`SessionLibrary.test.tsx`。
    - AC5 卡片信息（色条/徽标/标题/首条用户摘要/meta/目录）：`SessionLibrary.test.tsx`（实值断言 + 摘要内容断言，列表视图 `.lib-row-*` 等价）+ ensure_summary 懒加载。
    - AC6 勾选上限 8：`SessionLibrary.test.tsx`（8/8）。
    - AC7 预览抽屉前 5 条/单独打开/加入选择/Esc：`SessionLibrary.test.tsx`（前 5 条 + 单独打开 + 加入选择勾选/取消）。
    - AC8 SelectionDock 并排打开写入工作台 + 切页签：`SessionLibrary.test.tsx`。
    - AC9 加载更多/空态清除筛选：`SessionLibrary.test.tsx`（60→50→60 分页 + 空态）。
    - AC10 工作台超位拒绝：t224 WorkspaceView 超位逻辑（跨层集成，t224 已测）。
- 门禁：`pnpm test` 相关集全绿（SessionLibrary 14 + filter 9 + store 查询扩展 + SessionShell）；typecheck/lint 全绿；`pnpm build` 成功；`pnpm package` 重建后 `pnpm test:packaged` 4 passed + 黑盒脚本 `.scratch/t227/library_blackbox.ts` PASS（round 2 重跑）。全量 `pnpm test` 集成 flaky（vault/secrets）p056 登记，单跑全绿；本 task 改动零交集。review 4 轮收敛，overall=PASS。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-run` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：FAIL（4 important + 4 minor，全修）
- Round 1 test：FAIL（5 important，全修）
- Round 2 code：PASS（新增 4 minor，全修）
- Round 2 test：FAIL（round 1 标「已修」的 f002/f003/f005 复核未彻底修复，本轮补齐）
- Round 3 code：PASS（f012 残余 → f013 minor 遗留 p058）
- Round 3 test：FAIL（f003 摘要/列表断言仍「存在即通过」→ f008 important，本轮已修）
- Round 4 test：PASS（f008 已消；0 新 finding）

`single`：

- Round 1 general：N/A

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 会话库视图落地：搜索（元信息/内容并集/时间范围交集）、agent 多选、四排序、网格/列表、加载更多、预览抽屉、SelectionDock 批量打开；main 侧 query_sessions 扩展（sources/时间范围/排序，白名单防注入）。

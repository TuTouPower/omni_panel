---
tid: "t198"
slug: "grok_token_stats_display"
title: "grok token-stats 面板展示（source/agent 筛选与图表）"
status: "done"
branch: "t198_grok_token_stats_display"
worktree: ""
review_level: "single"
diff_anchor: "b7e772318eccd12eb1c25a6d7bb50730dc727167"
depends_on: "t197"
conflicts_with: ""
note: "前端 source/agent filter + label/color 扩展；依赖 t197 数据层"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

## Step 1-4 实施与验证

- 改动点全量梳理：chart-data.ts 三组 agent 映射（AGENT*COLORS/AGENT_LABELS records 侧、BUCKET_AGENT*_/ROLLUP*AGENT*_ buckets/rollup 侧）+ 三个 agentSegments\* 的 totals 初始与 agent list；TokenStatsView AGENT_OPTIONS；SessionTable chip 三元链；types.ts AgentFilter；token-stats.css 加 `.chip.gk`。web 查询面（usageboard-web.ts）仅透传 shared filter 类型（t197 已扩展 grok），无需改。
- 颜色选 `#b687f0`（紫），与现有 cc 橙 / opencode 蓝 / kimi 绿区分；`grok` label 用 "Grok"。
- TDD：chart-data / session_table / token_stats_view 三处 red → green。新增 view 测试覆盖 AC1（Grok 筛选项存在）、AC2（选 Grok 后 dashboard 请求 agent=grok）、AC4（grok 无数据空态不报错）。
- 门禁：typecheck/lint/deadcode/arch 全绿；format:check 除 2 个 pre-existing 漂移文件（p039 登记）外全绿——顺带格式化 t197 finalization 引入的 2 个文档漂移（archive task.md / ai-cli-token-stats-api.md，属门禁修复）。
- 全量 `pnpm test`：t198 相关（token-stats renderer 130 + main/shared 221）全绿；refresh-service / grok_oauth / vault 集成测试在并发负载下偶发超时（单独跑全绿，pre-existing flaky，与 t196/t197 同类）；build-info 测试需先 `gen-build-info.ts`（worktree 缺生成文件，已生成）。
- 黑盒：`build:web` 成功；playwright 内置 webServer 自动启动不可靠（preview 未 ready），手动 `MOCK_FIXTURE=synthetic vite preview` + `playwright test --project=web` → **48/48 通过**（与 t196 一致），web 面板无回归。

## Round 1 finding 修复记录

- 通用 reviewer 1 条 minor（t198_gen_f001）：AC4 视图测试未触达「选择 grok 且无 grok 数据」场景。已修：`token_stats_view.test.tsx` AC4 用例改为先点击 Grok 筛选、断言第二次 dashboard 请求 `agent=grok`（fixture 仍只含 claude_code）、再断言无「加载中...」残留，直接触达 AC4 渲染路径。复验 view 14 例全绿、tsc 通过。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending.md`「待办」节（普通模板）**，新条目先运行 `scripts/pending.py next` 取编号，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 (2026-08-04 04:50 UTC+8)

| finding_id    | severity | status | rationale                          | fix_ref                       |
| ------------- | -------- | ------ | ---------------------------------- | ----------------------------- |
| t198_gen_f001 | minor    | 已修   | AC4 视图测试补点击 grok + 断言空态 | token_stats_view.test.tsx:255 |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC1：`token_stats_view.test.tsx`「offers a Grok agent filter」断言 Grok 按钮存在 + 点击后 dashboard 请求 `agent=grok`；`AGENT_OPTIONS` 含 grok 项。
    - AC2：`chart-data.test.ts` 三个 `agentSegments*` 用例注入含 grok 的 records/buckets/rollup fixture 断言 Grok 聚合与其它 source 隔离；store SQL 侧按 agent 过滤（t197 已全链路接线）。
    - AC3：`session_table.test.tsx` 断言 grok 行 label "Grok" + chip class；records/图表过滤经查询参数 `agent=grok`。
    - AC4：`token_stats_view.test.tsx`「AC4: renders without error after selecting grok」点击 grok + fixture 无 grok 数据断言无报错、无加载残留。
    - web 查询面：usageboard-web 透传 shared filter 类型（t197 已含 grok），无改。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-run` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`single`：

- Round 1 general：PASS
- Round 2 general：PASS

### 结果摘要

grok 展示层全链路扩展：source/agent 筛选、三组 label/color、SessionTable chip 与 CSS，AC1-AC4 全绿，web 面板 48/48 无回归。

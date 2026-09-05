---
tid: "t451"
slug: "agent_custom_range_chain_fix"
title: "代理面板自定义链路修复：下拉打开/应用生效/刷新持久化"
status: "done"
branch: "t451_agent_custom_range_chain_fix"
worktree: ""
review_level: "single"
diff_anchor: "c474462be7fbda6795cf65f370c4806ba49a7ee8"
depends_on: ""
conflicts_with: ""
note: "来源 p218；自定义下拉/应用/轮询/持久化行为修复"
---

# Task 过程总账

**front matter 是状态权威**，只经 `.repo_template/scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- 红：先加 7 个失败测试（AC-001/002/003/006/007 集成 + AC-005/008 单测），AC-004 首轮即绿（无轮询交织时旧链路可用，作回归锁）。旧 16 用例保持绿。
- 根因精化（超 p218 处）：读 user-event 源码确认原生 select 单选序列为 `click(select)→input/change→click(select)`，且注释明示浏览器同行为——jsdom 复现与真机同机制，非测试假象。
- 绿：RangePicker 加 `zoneRef` 豁免 + open-guard 同步 + 行内报错（成功才关）+ `z-[var(--z-menu)]`；TokenStatsView 加同区包裹、select `onClick` 重开、打开期显示 custom、预设切换显式关面板、custom 持久化（`load_saved_custom` 非法值丢弃）。
- AC-006 测试修正：轮询本身触发一次后台重取，断言由 `toHaveBeenCalledTimes(2)` 改为 `>=2` + 末次精确起止。
- 环境坑（非生产改动）：worktree 无 node_modules→`pnpm install --prefer-offline`；`gen-build-info` 因缺 `src/generated/` 崩溃→手工 `mkdir -p`（已记 p221）；node 单测 17 文件收集失败因 electron dist 下载不全→从主仓复制 `node_modules/electron`（gitignore，仅环境）。
- 黑盒：`pnpm build` 双产物验 `z-[var(--z-menu)]` 规则存在；`panel_navigation` e2e 5 passed；新增 `agent_custom_range` e2e 初跑 AC-005 撞 strict-mode（页面另有一处 query-failure `role=alert`，mock 缺 `/v1/dashboard` 所致，与本次无关）→断言收窄为错误文本后 3 passed。
- 存量门禁：typecheck 过；lint 剩 2 项存量（p215 已有 + p220 新记），均非本次引入。
- 审阅两轮 general 均 PASS（R1 3 minor→f001/f002 已修、f003 遗留 p219；R2 0 新 finding）。
- 顺手发现已登记：p219（t451 遗留）、p220、p221；跨 task 事实记 d052。

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

### Round 1 (2026-09-05 09:00 UTC+8)

首轮 general：3 条 minor，无 critical/important，verdict PASS。

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t451_gen_f001|minor|已修|补空输入与起止相等两 case（alert 文本+不回调+面板仍开）|tests/unit/renderer/components/token-stats/RangePicker.test.tsx|
|t451_gen_f002|minor|已修|AC-008 测试追加 globals `--z-menu: 60` 存在断言，pin 住类→token 映射|tests/unit/renderer/components/token-stats/RangePicker.test.tsx|
|t451_gen_f003|minor|遗留|click 重开副作用现状可接受；收窄需状态机改动，另起跟进|p219|

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足（AC-009 为 `[deploy]`，以真机 Chromium e2e `agent_custom_range.spec.ts` 3 passed 作最接近证据，人工手点待用户签收）
- 证据：每条 AC 在 `handoff.json` 的 `ac_evidence` 有对应引用（覆盖闭合门禁强制）；此处写一句话摘要，不复制 AC 正文

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS / FAIL
- Round 1 test：PASS / FAIL

`single`：

- Round 1 general：PASS
- Round 2 general：PASS

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 自定义链路 9 条 AC 全满足：单测 63（目标文件）/全量 3502 通过，typecheck 过，lint 仅 2 存量，构建双产物验层级规则，真机 e2e 3 passed；遗留 p219（click 重开打扰），顺手 p220/p221，事实 d052，p218 已闭环。见上

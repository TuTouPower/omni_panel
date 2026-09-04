---
tid: "t450"
slug: "gateway_empty_monitor_provider_hide"
title: "CPA 网关空 monitor provider 隐藏"
status: "done"
branch: "t450_gateway_empty_monitor_provider_hide"
worktree: ""
review_level: "full"
diff_anchor: "a44fdace91422e81e7532b72f002f996e7901c5d"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `.repo_template/scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- attempt=1 execution_id=4fbddfdf0524461b8cf242afb97dabf8；diff_anchor=a44fdace。
- 根因：visible_providers_from_groups 把 gateway(CPA) activeProviders（monitor 开关推导）全量并入可见集，ready 快照 items 无该 provider 数据仍渲染空卡（p217，用户环境 CPA monitor_kimi=true 但网关零 kimi 数据）。
- 修复演进（review 驱动）：R1 f001 判定从 has_items 改 status==='ready' 误伤 failed 带 lastSuccess items；R2 f003 收窄导致 ready 空 items 全剔除违反 spec 保留分支；最终判据 gateway && status==='ready' && items 非空 才过滤，其余（ready 空 / failed / loading 含 lastSuccess items）保留全部 monitor。
- 抽 snapshot_items_of helper 统一 items 提取（f002）；注释如实表述保留语义（f004）。
- 旧测试迁移：popup_view_config「拖拽排序」fixture 原依赖 gateway ready 空 items 显 monitor provider（t450 推翻），items 补 claude+deepseek 记录，断言与测试意图不变。
- 全量 pnpm test 3494 passed；typecheck 0 err；lint 1 pre-existing（p215 非本 task）。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

### Round 1 (2026-09-04 21:30 UTC+8)

code FAIL（f001 important + f002 minor）；test PASS（0）。code 已修，重审 Round 2。

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t450_code_f001|important|已修|判定改 snapshot.status==='ready'（非 has_items），failed/loading 保留全部 monitor；补 failed 带 lastSuccess items 用例|src/renderer/lib/provider-usage.ts:450|
|t450_code_f002|minor|已修|抽 snapshot_items_of 统一 items 提取|src/renderer/lib/provider-usage.ts:205|

### Round 2 (2026-09-04 21:36 UTC+8)

code FAIL（f003 important）；test PASS（0）。code 已修，重审 Round 3。

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t450_code_f003|important|已修|is_ready 门致 ready 空 items 全剔除违反 spec 保留分支；判据收窄为 ready && has_items 才过滤，补 ready 空 items 保留用例|src/renderer/lib/provider-usage.ts:451|

### Round 3 (2026-09-04 21:38 UTC+8)

code PASS（1 minor f004）+ test PASS（0）。f004 注释措辞已修，进入 Round 4 完整重审。

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t450_code_f004|minor|已修|注释如实表述 loading/failed/空 items 保留语义（防整体消失，闪跳为批准语义）|src/renderer/lib/provider-usage.ts:443|

### Round 4 (2026-09-04 21:41 UTC+8)

code PASS（0 new）+ test PASS（0）。无 finding 未进处置表。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001/002/003 由 provider-usage.test 用例断言（ready 空 monitor 剔除 / 有数据保留 / failed 保留）；popup_view_config 拖拽 fixture 迁移保测试意图；全量 3494 passed。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：FAIL
- Round 1 test：PASS
- Round 2 code：FAIL
- Round 2 test：PASS
- Round 3 code：PASS
- Round 3 test：PASS
- Round 4 code：PASS
- Round 4 test：PASS

`single`：

- N/A

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- p217 CPA 网关空 monitor provider 隐藏：ready 有 items 时按 items 过滤空 monitor；ready 空 / failed / loading 保留；4 轮 review 收敛（f001/f003 important 经两次往返），全量 3494 passed。

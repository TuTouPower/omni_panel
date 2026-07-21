# Task review T007

- task：`T007_domain_trend_policy`
- spec：`docs/tasks/T007_domain_trend_policy/spec.md`
- target：working tree（未提交改动）
- reviewer_focus：测试
- reviewed_at：2026-07-20 07:40 UTC+8

流程（两 agent 并行、续写规则、权限）见 AGENTS.md step 6。本 task 纯文档无单测/E2E，「测试」角色转为**文档一致性核对 + AC 可追溯性验证**。

## AC 覆盖核对表

| AC   | 追溯方式                                                                                        | 结果 | 证据                                                                                                                                                                                                                                                                                                                                                     |
| ---- | ----------------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1 | `grep "不做趋势图 UI" docs/blueprint/domain.md` 无命中；改写为 sparkline 限定 + TokenStats 分工 | PASS | `docs/blueprint/domain.md:73` 改写为「不做完整多维趋势图 UI（柱状/热力/区间选择仍归 TokenStats 独立窗口）；账号展开区出近 7 天 sparkline 迷你走势（T006），SQLite 历史已用于此时序聚合。」 原字样在 domain.md 已无命中（仅 decisions 005 / review / tasks / archive 命中，符合预期）。                                                                   |
| AC-2 | decisions.md 新增 005，含旧决策引用 + 新决策 + 理由 + 日期                                      | PASS | `docs/blueprint/decisions.md:58-63` 条目 005（2026-07-20），字段齐全：背景（引用 domain §6 原边界 + T006 打破）/ 选项 A·B·C / 结论（选 A，引审阅 adoption D1）/ 替代（无，附原边界追溯）。                                                                                                                                                               |
| AC-3 | `grep "前置 T007" docs/tasks/T006_trend_sparkline/spec.md` 命中                                 | PASS | `docs/tasks/T006_trend_sparkline/spec.md:41`「**前置 T007**（domain §6 政策修订 + decisions 决策条目）：本 task 打破 `domain.md §6`「不做趋势图 UI」产品边界，必须先由 T007 解除边界并记录决策替代，T006 spec/plan 在 T007 合入后才进入实施。」（git diff 显示 T006 spec 未在本 task 改动，该句为 T006 起草时已写入；AC 措辞为「含」非「新加」，满足。） |
| AC-4 | `pnpm format:check` 与 `pnpm lint` 通过；纯文档不触发类型/测试回归                              | FAIL | `pnpm lint` 通过（纯文档不在 eslint 扫描范围）。`pnpm format:check` 失败：`docs/tasks_index.md` 命中 prettier warn（详见 f001）。                                                                                                                                                                                                                        |

## 文档一致性核对

- grep `不做趋势图 UI` 在 `docs/blueprint/domain.md` 无命中；其他命中点（decisions 005 / review 报告 / T007 spec 与 plan 自身 / archive）均为历史引用，符合预期。
- grep `前置 T007` 在 T006 spec 命中（L41），与 T007 decisions 005 结论方向一致，无矛盾。
- domain.md §6 改写后表述与 decisions 005 结论一致：前者详细（柱状/热力/区间选择 + sparkline），后者概要（完整多维趋势 + sparkline），核心分工相同——账号展开区 sparkline，TokenStats 承担完整多维趋势。

## Findings

### T007_test_f001 — AC-4 format:check 失败：本 task 改动让 `docs/tasks_index.md` 落入 prettier 告警

- 严重度：high
- 位置：`docs/tasks_index.md:14`（T007 行）
- 问题：T007 把 T007 行状态从 `backlog` 改为 `active` 并同步备注，但未运行 `pnpm format`。`pnpm format:check` 当前命中 `docs/tasks_index.md` 为 warn；对照 HEAD 基线（git stash 后）相同命令对该文件无命中——即此格式回归由本 task 引入。AC-4 明确要求 format 通过，黑盒验证（`pnpm format:check`）不通过。
- 复现：`rtk proxy pnpm format:check 2>&1 | grep tasks_index` 命中；`git stash && rtk proxy pnpm format:check 2>&1 | grep tasks_index` 无命中；`git stash pop` 还原后仍命中。
- 建议：跑 `pnpm format`（prettier --write `docs/tasks_index.md`）重排表格空格后重新 `pnpm format:check` 验证。属本 task step 4 黑盒验证漏跑的修复。

### T007_test_f002 — spec 范围第 18 行措辞与实际执行不一致

- 严重度：low / suggestion
- 位置：`docs/tasks/T007_domain_trend_policy/spec.md:18`（范围条目）与 `docs/tasks/T007_domain_trend_policy/log.md:7`
- 问题：spec「范围」第 18 行「T006 spec.md「依赖与约束」段加「前置 T007」」用的是「加」，暗示本 task 新增该句；但 log.md 第 7 行 owner 自述「T006 spec「依赖与约束」已含「前置 T007」，无需改动」——即 T006 spec 早在 T006 起草时已写入该句，本 task 实际未改动 T006 spec。AC-3 用词为「含」而非「加」，故 AC 满足，无功能性遗漏；仅 spec 范围措辞易让后续追溯误判本 task 动过 T006 spec。
- 建议：spec「范围」改为「确认 T006 spec.md「依赖与约束」段含「前置 T007」」或「（本 task 无需改动，已存在）」；或在 log 中显式标注「spec 范围原列该动作，执行时确认已存在，故无 diff」。纯文档措辞，不阻断验收。

## 危险模式扫描（文档版）

- AC 表述可 grep / 可命令验证：AC-1（grep 字样）、AC-2（字段对镜模板）、AC-3（grep 引用）、AC-4（pnpm 命令）——均可独立复现，无模糊表述。
- domain.md §6 改写后首句以「不做完整多维趋势图 UI」开头，仍属"明确不做"边界类目，sparkline 为例外说明；decisions 005 与之一致，无矛盾或误导。
- 改动仅触及 domain.md / decisions.md / tasks_index.md / 本 task log.md，无越界写入非范围文档；`docs/blueprint/architecture.md` `ipc.md` 等按 spec 非范围未动，符合「长期真相延后」与 T006 Finalization 边界。
- 无不可验证的模糊断言；仅 format 回归需修。

## 结论

AC-1 / AC-2 / AC-3 通过且证据 grep-able；AC-4 因 `docs/tasks_index.md` prettier 告警不通过——属本 task 改动引入、可由 `pnpm format` 一键修复。f002 为 spec 措辞与执行记录轻微出入，不影响验收。owner 跑 `pnpm format`（或仅对 `docs/tasks_index.md` 跑 prettier --write）并重跑 `pnpm format:check` 验证通过后即可进入 adoption 收尾。

verdict: FAIL

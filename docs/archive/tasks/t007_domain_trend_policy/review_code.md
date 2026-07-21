# Task review T007

- task：`T007_domain_trend_policy`
- spec：`docs/tasks/T007_domain_trend_policy/spec.md`
- target：本 task 未提交改动（working tree）
- reviewer_focus：文档+代码
- reviewed_at：2026-07-20 07:40 UTC+8

流程（两 agent 并行、续写规则、权限）见 AGENTS.md step 6。

## Findings

### T007_code_f001 — `pnpm format:check` 失败：tasks_index.md 表格列宽未对齐

- 严重度：high
- 位置：`docs/tasks_index.md:17`
- 问题：T007 行状态由 `backlog`（7 字符）改为 `active`（6 字符），末列备注列也由「spec/plan 已落地；T006 前置；纯文档」改为「实施中；T006 前置；纯文档」，但作者未运行 prettier 重新对齐表格列宽。实际行末 14 空格，prettier 期望 15 空格。`pnpm exec prettier --check docs/tasks_index.md` 返回 `Checking formatting...`（失败退出码 1），导致整体 `pnpm format:check` 失败。`log.md` 黑盒段声明「黑盒：pnpm format:check + lint」通过，与实际结果不符。
- 建议：`pnpm exec prettier --write docs/tasks_index.md`（将末列补齐到 15 空格），随后重新运行 `pnpm format:check` 验证通过，更新 `log.md` 黑盒记录。

## AC 核对

| AC   | 内容                                                                                        | 结果 | 说明                                                                                                                                                                                                                                                                    |
| ---- | ------------------------------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1 | `domain.md §6` 不再出现「不做趋势图 UI」原文；改写为 sparkline 限定 + TokenStats 分工的表述 | PASS | 原「不做趋势图 UI」已移除；新表述「不做完整多维趋势图 UI（柱状/热力/区间选择仍归 TokenStats 独立窗口）；账号展开区出近 7 天 sparkline 迷你走势（T006），SQLite 历史已用于此时序聚合」双句限定清晰，前缀仍是否定式，避免被误读为全面放开趋势图。                         |
| AC-2 | `decisions.md` 新增条目，含旧决策引用、新决策、理由、日期                                   | PASS | `decisions.md:58-63` 新增 005 条目：日期 2026-07-20、背景段引用 domain §6 原文、选项 A/B/C、结论选 A、理由（符合长期真相延后 + 单 task 单 commit）、替代字段注「原边界追溯：domain.md §6 第一版 commit」（合理：原边界非 ADR 编号条目，无被替代编号可填）。四字段齐全。 |
| AC-3 | T006 spec.md「依赖与约束」段含「前置 T007（domain 政策修订）」                              | PASS | `docs/tasks/T006_trend_sparkline/spec.md:41` 已含「前置 T007（domain §6 政策修订 + decisions 决策条目）」并说明合入顺序约束。`log.md` 注「T006 spec「依赖与约束」已含前置 T007，无需改动」属实。                                                                        |
| AC-4 | `pnpm check`（format/lint）通过；纯文档改动不触发类型/测试回归                              | FAIL | 见 T007_code_f001。`pnpm format:check` 在 `docs/tasks_index.md` 上失败（退出码 1）；其余 3 个改动文件（`domain.md` / `decisions.md` / `log.md`）prettier 检查通过。lint 纯文档不触发。                                                                                  |

## 文档真实性

- `domain.md §6` 改写措辞精准：前缀保留「不做完整多维趋势图 UI」否定语义，后接「账号展开区出近 7 天 sparkline」明确放开的窄范围，并以「（T006）」标注实施来源；末句「SQLite 历史已用于此时序聚合」点明数据来源与原边界的延续性。无法被误读为「全面放开趋势图」。
- `decisions.md` 005 条目四字段（背景/选项/结论/替代）齐全；背景段完整引用原 domain §6 文本并说明打破边界动因（T006 计划）；选项段列出 A/B/C 三选项并标注 adoption D1=A 决策来源；结论段点明符合的两条硬约束；替代字段补充原边界追溯路径而非杜撰被替代编号。

## 一致性

- `decisions.md` 005 结论（domain §6 改写为「完整多维趋势仍归 TokenStats；账号展开区出 sparkline」）与 `domain.md §6` 实际文本一致。
- `decisions.md` 005（T006 实施时引用本条）与 T006 spec「前置 T007」双向可追溯。
- `domain.md §6` 改写未触及其他产品边界条目（其余 4 条原样保留）。

## 结论

4 条 AC 中 AC-1 / AC-2 / AC-3 通过，AC-4 因 `docs/tasks_index.md` 表格列宽未 prettier 对齐而失败（T007_code_f001，high）。修复成本极低（一行 prettier --write），但 log.md「黑盒：pnpm format:check + lint」声明与实际结果矛盾，需 owner 在 adoption 阶段修复并重跑 format:check、更新 log。文档真实性与 cross-ref 一致性均达标。

verdict: FAIL

# Task log

只记录有追溯价值的进展、踩坑、中途决策、偏离 plan 原因和关键验证结果；不写命令流水账。

## 记录

- 2026-07-20：T007 实施（纯文档）。`domain.md §6` 原「不做趋势图 UI」改写为「完整多维趋势仍归 TokenStats；账号展开区出 sparkline」；`decisions.md` 加 005 条目记录决策替代（选项 A：先开 T007 解除边界再开 T006，符合长期真相延后 + 单 task 单 commit）。T006 spec「依赖与约束」已含「前置 T007」，无需改动。
- 黑盒：`pnpm format:check` + `lint`（纯文档无代码红/绿；format/lint 兜底）。

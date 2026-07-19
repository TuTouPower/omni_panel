# Task spec

## 背景

`docs/blueprint/domain.md §6 产品边界` 当前明确写「不做趋势图 UI（SQLite 留了历史数据，但第一版不出图）」，是第一版长期真相。T006 计划在账号展开区引入近 7 天 sparkline，直接打破该边界。按 CLAUDE.md「长期真相延后」「未稳定方案留在 task」「单 task 单 commit」原则，长期真相的修订不能混进实施 task，必须先开独立小 task 解除边界并记录决策替代，T006 实施时引用本 task 决策编号。

## 参考来源与设计取舍

- **参考来源**：T006 spec/plan（账号展开区 sparkline 方案）；`docs/blueprint/domain.md:73`（产品边界原文）；`docs/blueprint/decisions.md`（决策记录格式）。审阅报告 `docs/reviews/review_20260719_2201/opus.md` T006_code_f003 指出该冲突。
- **采纳**：独立 task 先改长期真相，再开实施 task。对应审阅 D1 选项 A。
- **不采纳 D1-B**（T006 单 task 内 Finalization 段一并改 domain.md + decisions.md）：违反「长期真相延后」「单 task 单 commit」工作流硬约束，把真相修订与实施混在一个 commit。
- **不采纳 D1-C**（放弃 T006）：用户已确认要做趋势 sparkline。

## 范围

- `docs/blueprint/domain.md §6` 移除或改写「不做趋势图 UI」条目：明确「账号展开区出近 7 天 sparkline（迷你走势）；完整多维趋势（柱状/热力/区间）仍归 TokenStats 独立窗口承担」。
- `docs/blueprint/decisions.md` 新增决策条目：记录「第一版不出图 → 账号展开区 sparkline 出图」的替代，含旧决策引用、新决策、理由、日期。
- T006 spec.md「依赖与约束」段加「前置 T007」。

## 非范围

- 不改 `architecture.md` / `ipc.md` / `observation-store.md` / `web-panel.md`（属 T006 Finalization）。
- 不动 T006 实施代码、不写趋势聚合函数。
- 不调整 TokenStats 独立窗口的定位（完整多维趋势仍归它）。

## 验收标准

- [ ] `domain.md §6` 不再出现「不做趋势图 UI」原文；改写为 sparkline 限定 + TokenStats 分工的表述。
- [ ] `decisions.md` 新增条目，含旧决策引用、新决策、理由、日期。
- [ ] T006 spec.md「依赖与约束」段含「前置 T007（domain 政策修订）」。
- [ ] `pnpm check`（format/lint）通过；纯文档改动不触发类型/测试回归。

## 依赖与约束

- 纯文档 task，无代码红/绿；黑盒验证 = 文档一致性检查。
- T006 实施前置：T006 spec/plan 在本 task 合入后才能进入 step 2（红测）。
- 约束：`domain.md §6` 改写措辞需精准——「账号级 sparkline」与「TokenStats 完整趋势」分工要写清，避免后续误读为「全面放开趋势图」。

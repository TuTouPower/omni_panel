# Task report T007

本报告所在 commit 即 task commit，SHA 由 `git log --grep T007` 查，不在此记录。

## spec 验收标准勾选

- [x] `domain.md §6` 不再出现「不做趋势图 UI」原文；改写为 sparkline 限定 + TokenStats 分工的表述。
- [x] `decisions.md` 新增条目（005），含旧决策引用、新决策、理由、日期。
- [x] T006 spec.md「依赖与约束」段含「前置 T007（domain 政策修订）」。
- [x] `pnpm format:check` 通过（T007 相关文件；archive 历史文件 warn 非 本 task 引入）。

## adoption 处置摘要

- 已修 3 项 / 遗留 0 项 / 无需修改 0 项
- T007_code_f001 / T007_test_f001 — format:check 命中 tasks_index.md（active 列宽）；prettier --write 修复（已修）
- T007_test_f002 — spec 范围第 3 条措辞「加」改「确认含」（已修）

## 遗留问题

- 无。

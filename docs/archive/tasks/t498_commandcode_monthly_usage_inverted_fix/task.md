---
tid: "t498"
slug: "commandcode_monthly_usage_inverted_fix"
title: "Command Code 月额度消耗计算与重置时间展示修复"
status: "done"
branch: "t498_commandcode_monthly_usage_inverted_fix"
worktree: ""
review_level: "single"
review_limit: "5"
verify_limit: "5"
diff_anchor: "cb051126676f2c28ef25cbeed7f95c82417b880a"
depends_on: ""
conflicts_with: ""
note: "来源 p246；修复 Command Code 月额度 remaining 错当 used 导致的用量反转、display_style 改为 percent 并正常展示重置时间与状态"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

1. TDD 编写测试：覆盖 Command Code 月度用量消耗计算（`monthly_cap - monthly_remaining`）、百分比显示风格、重置时间戳、阈值正向映射（normal/warning/critical/belowThreshold）、未知套餐安全降级。
2. 修复 `connectors/commandcode/connector.ts`：在套餐上限已知时以消耗量 `Math.round(Math.max(0, monthly_cap - monthly_remaining) * 10000) / 10000` 作为 `used`，`limit` 为套餐上限，`display_style: "percent"`，按实际消耗比例及 `belowThreshold` 计算 `status`；未知套餐降级保留 ratio 风格与原始剩余值。
3. 闭环归档 `p246` 待办条目。
4. 门禁验证：`pnpm test` (312 suites, 3852 passed)、`pnpm typecheck` (pass)、`pnpm lint` (pass)、`pnpm format:check` (pass)、`pnpm designmd:check` (pass)。

## Review 处置

### Round 1 (2026-09-17 09:49 UTC+8)

Round 1 零 finding。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`pnpm test tests/unit/connector/commandcode.test.ts` (12/12 passed), 全量测试 `pnpm test` (3852 passed, 0 failed)
- 黑盒：无黑盒要求，单元测试全覆盖
- review：Round 1 PASS (`review_general.md`)
- AC 证据：见 `handoff.json`

### 结果摘要

- 修复 Command Code 月度用量计算反转问题：上游 `monthlyCredits`（剩余额度）不再直接赋给 `used`，而是在已知套餐上限时通过 `monthly_cap - monthly_remaining` 正确得出已消耗量。
- 将月度观察量展示风格从 `"ratio"` 调整为 `"percent"` 并附带 `reset_at`，使前端正常展示百分比与重置日期，与 5 小时和周窗口风格对齐。
- 修正状态阈值判定为正向消耗比例映射，并在 `belowThreshold` 为真时保底 warning。
- 归档 `p246` 待办。全部门禁校验通过。

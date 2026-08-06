---
tid: "t230"
slug: "fix_model_dropdown_alias"
title: "代理面板模型下拉应用模型映射"
status: "done"
branch: "t230_fix_model_dropdown_alias"
worktree: ""
review_level: "full"
diff_anchor: "c0ccd19d580971a92d8f22847b0f745ed9e48792"
depends_on: ""
conflicts_with: "t229"
schedule_status: "scheduled"
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

- 后端：在 `token-stats-store.ts` 的 `query_dashboard` 中，对 `window_models` 查出的原始 model 用 `dashboard_alias_resolver` 映射后再去重，写入 `dto.models`。
- 前端：在 `TokenStatsView.tsx` 中将 `modelOptions` 从 `string[]` 改为 `{ value, label }[]`；`value` 保持原始模型名用于查询，`label` 经 `modelAliases` 映射后渲染。
- 测试：后端新增 2 个用例覆盖 `dashboard.models` 映射与按原始名过滤；前端新增 1 个用例覆盖别名显示与查询参数保持原始名。
- 中途发现 `metric_buckets` 中的 model 应保持原始名（渲染层 `prepareBarDataFromDashboardChartData` 已做别名映射），相应调整测试断言。

## Review 处置

### Round 1 (2026-08-06 01:30 UTC+8)

Round 1 零 finding，未进处置表。

## 收尾报告

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC1/AC2/AC3：`tests/unit/renderer/views/token_stats_view.test.tsx` 新增用例通过。
    - AC4：`tests/unit/main/core/token-stats/token-stats-store.test.ts` 新增用例通过。
    - 全量 `pnpm test`、`pnpm lint`、`pnpm typecheck` 通过。

### Reviewer verdict

`full`：

- Round 1 code：PASS
- Round 1 test：PASS

### 结果摘要

模型下拉显示文本应用 modelAliases 映射，查询仍使用原始模型名；后端 `dashboard.models` 同步返回映射名。

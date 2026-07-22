---
tid: t044
slug: split_popup_view
diff_anchor: "6d4f7e0"
branch: t044_split_popup_view
---

# Task t044_split_popup_view

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

只记有追溯价值的进展、踩坑、中途决策、偏离 plan、关键验证；不写命令流水账。

- 来源：t043 `t043_code_f001` 遗留（PopupView 954 行超膨胀标准，跨 task 慢性累积）。本 task 纯重构降体量，行为零回归。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格。

### Round 1 (2026-07-23 01:20 UTC+8)

- code：0 finding（PASS）—— 4 hook 抽离与原 inline 逐字等价，闭包依赖闭合，无 stale closure。
- test：3 finding，进表。

| finding_id     | severity  | status | rationale                                                                                                | fix_ref                                                      |
| -------------- | --------- | ------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| t044_test_f001 | important | 已修   | `handle_drag_over`（provider x/y 轴中点重排）零覆盖；补 x 轴换位 + y 轴 null 两用例                      | tests/unit/renderer/hooks/use_dnd_handlers.test.ts           |
| t044_test_f002 | minor     | 已修   | `use_tab_navigation` wheel 节流+环绕无单测；新建 wheel down/up wrap/节流/deltaX 4 用例                   | tests/unit/renderer/hooks/use_tab_navigation.test.tsx        |
| t044_test_f003 | minor     | 已修   | `use_watched_metric_toggler` 无单测；新建 add→remove wiring 用例（断言 patchConfig 调用 + watched 增删） | tests/unit/renderer/hooks/use_watched_metric_toggler.test.ts |

### Round 2 (2026-07-23 01:40 UTC+8)

- code：N/A（round 1 PASS，round 2 无 code 改动）。
- test：0 finding（PASS）—— `t044_test_f001`/`f002`/`f003` 已修并经 round 2 确认。零 finding，未进处置表。

### Round N (YYYY-MM-DD HH:MM UTC+8)

| finding_id       | severity                 | status | rationale | fix_ref   |
| ---------------- | ------------------------ | ------ | --------- | --------- |
| {tid}\_code_f001 | critical/important/minor | 已修   | {一句话}  | {文件:行} |

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep {tid}` 查，不在此记。

### 验收标准勾选

- [x] PopupView.tsx 行数显著下降：947 → **781**（−166）。
- [x] 抽出的 hook/组件有单测：`use_dnd_handlers`（9）/`use_popup_derived`（既有）/`use_tab_navigation`（4）/`use_watched_metric_toggler`（1），共 30 hook 测试。
- [x] `pnpm test` 全绿（1496）；typecheck/lint 干净。
- [x] 行为零回归：`popup_view.test.tsx` 28 用例全过 + 4 hook 单测覆盖关键路径（含 provider drag_over x/y 轴、wheel 节流/环绕、watched toggle wiring）。

### Reviewer verdict

- Round 1 code：PASS（0 finding，hook 与原 inline 逐字等价、闭包闭合）
- Round 1 test：FAIL（`t044_test_f001/f002/f003` 覆盖空洞 → 已修）
- Round 2 code：N/A（无 code 改动）
- Round 2 test：PASS（f001/f002/f003 修复确认）

### 遗留

- 无。t043 code_f001（PopupView 膨胀）经本 task 治本（947→781，<800）。

### 结果摘要

- 纯重构拆 PopupView 为 4 自定义 hook（`use_popup_derived`/`use_dnd_handlers`/`use_tab_navigation`/`use_watched_metric_toggler`），PopupView 947→781 行（退出 ≥800 膨胀区），行为零回归。t043 code_f001 遗留关闭。

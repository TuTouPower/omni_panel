---
tid: t046
slug: fix_account_usage_row_watch_toggle
diff_anchor: "be9f98d89d3949279b49bf8f8281a5f75890a143"
branch: t046_fix_account_usage_row_watch_toggle
---

# Task t046_fix_account_usage_row_watch_toggle

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 诊断（开干前）：t043 metric 级监控 bell 只接了 `PopupView → ProviderAccountList → ProviderAccountRow → UsageBarList → UsageBarRow` 链，漏了 `ProviderCard → AccountUsageRow → UsageBarRow` 链。主面板总览 provider 卡片的 account 详情用 `AccountUsageRow`，其 props 无 `on_toggle_watched`/`watched_labels`，调 `UsageBarRow` 未传 → bell 不渲染。本 task 补齐 AccountUsageRow 路径。

## Review 处置

**本文件本小节 = 处置表唯一落点。**

### Round 1 (2026-07-22 21:12 UTC+8)

Round 1 零 finding，未进处置表。两轴均 PASS。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep {tid}` 查。

### 验收标准勾选

- [x] 主面板 provider 卡片 account 详情，每条数据标签行显示 bell（默认关）。
- [x] 点击 bell 持久化 upcomingResetWatched，刷新后保留（复用 t043 既有 `handle_toggle_watched` + `use_watched_metric_toggler`，数据层未改）。
- [x] accountKey/raw_label 维度对齐 collect（`account.id` = `accountKey(period)`，与 UsageBarList 路径同口径）。
- [x] AccountUsageRow 单测：渲染 bell + 点击回调（4 条 it）。
- [x] `pnpm test` 全绿（149 files / 1506 tests）；typecheck/eslint 干净。

### Reviewer verdict

- Round 1 code：PASS
- Round 1 test：PASS
- Round 2 code：N/A
- Round 2 test：N/A

### 遗留

- 无（范围外观察：ProviderCard 单账号分支直接渲染 `UsageBarList` 未传 watched/toggle，spec 未要求，如需覆盖另开 task）。

### 结果摘要

- 补齐 `PopupView → ProviderOverview → ProviderCard → AccountUsageRow → UsageBarRow` 链的 watched/toggle 透传，主面板多账号 provider 卡片 account 详情行 bell 恢复。

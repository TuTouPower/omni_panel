---
tid: t043
slug: upcoming_reset_metric_watch
diff_anchor: "fe967b82b35d5088d5e8b97ffea50accece5dcf0"
branch: t043_upcoming_reset_metric_watch
---

# Task t043_upcoming_reset_metric_watch

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

只记有追溯价值的进展、踩坑、中途决策、偏离 plan、关键验证；不写命令流水账。

- 需求方向（开干前）：即将重置监控从 account 级（t041 `upcomingResetOff`，默认全开）改为 metric（数据标签）级显式开启（默认全关）。用户确认：废弃 account 级（旧配置丢失）、保留全局阈值 `upcomingResetThresholdPercent`、入口在主面板 metric 行。metric 稳定标识用 `raw_label`（`MetricRecord` 无 metric_id）。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

### Round 1 (2026-07-22 23:50 UTC+8)

- code：1 finding（minor），进表。
- test：2 finding（important），进表。

| finding_id     | severity  | status | rationale                                                                                                                                                                                                                                                     | fix_ref                                         |
| -------------- | --------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| t043_code_f001 | minor     | 遗留   | PopupView 954 行 + 本 task 净增 32 触发膨胀标准；但增量全是 toggle wiring（访问 config/accountOverrides/patchConfig 闭包，不可拆），文件超阈值是跨 task 慢性累积（同 t042 server.ts 先例）。抽 hook 仅减 ~23 行且不消除「≥800+净增」命中，治本需独立重构 task | src/renderer/views/PopupView.tsx                |
| t043_test_f001 | important | 已修   | 重写 collect 测试丢失 `resetAt<=now` skip 分支覆盖；补回 `skips watched period with resetAt <= now (already reset)`                                                                                                                                           | tests/unit/renderer/lib/upcoming_resets.test.ts |
| t043_test_f002 | important | 已修   | 重写丢失 `used/limit` invalid→percent 0 fallback 覆盖；补回 `reports percent 0 when watched period has invalid used/limit`                                                                                                                                    | tests/unit/renderer/lib/upcoming_resets.test.ts |

### Round 2 (2026-07-23 00:15 UTC+8)

- code：N/A（round 1 后无 code 改动；`t043_code_f001` 遗留，用户认可 + 独立 task 治本）。
- test：0 finding（PASS）—— `t043_test_f001`/`f002` 已修并经 round 2 确认。零 finding，未进处置表。

### Round N (YYYY-MM-DD HH:MM UTC+8)

（有 finding 时用本表；每条 finding 一行。）

| finding_id       | severity                 | status | rationale | fix_ref   |
| ---------------- | ------------------------ | ------ | --------- | --------- |
| {tid}\_code_f001 | critical/important/minor | 已修   | {一句话}  | {文件:行} |

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep {tid}` 查，不在此记。

### 验收标准勾选

- [x] config schema：移除 `upcomingResetOff`，加 `upcomingResetWatched`；旧 config（含 upcomingResetOff）加载不报错（zod 默认 strip），迁移为 watched 空。
- [x] `collect_upcoming_resets`：watched 空 → `[]`；watched 含 (provider,accountKey,raw_label) + threshold 非 null + 剩余%≤阈值 → 进面板；非 watched period 不进。
- [x] `UpcomingResetItem` 含 `rawLabel`。
- [x] 主面板 metric 行 toggle（UsageRows period 行 bell icon）：默认关（opacity 0.35）；点击持久化 `upcomingResetWatched`（add/remove_watched_metric + save_config）。
- [x] t041 account 级「是否监控即将重置」icon 按钮移除（AccountRow/CpaCard/VendorCard/SettingsView，src 内零残留）。
- [x] schema 单测 + collect 过滤单测（含 resetAt<=now / used-limit invalid 分支）+ metric 行 toggle 组件测；`pnpm test` 1473 全绿；typecheck/lint 干净。

### Reviewer verdict

- Round 1 code：FAIL（`t043_code_f001` PopupView 膨胀 minor → 遗留）
- Round 1 test：FAIL（`t043_test_f001`/`f002` 分支覆盖丢失 → 已修）
- Round 2 code：N/A（无 code 改动；f001 遗留用户放行）
- Round 2 test：PASS（f001/f002 修复确认）

### 遗留

- `t043_code_f001`：PopupView.tsx 954 行 + 本 task 净增 32 触发文件膨胀标准（minor）。文件超阈值是跨 task 慢性累积，本 task 增量为 toggle wiring（不可拆闭包）；抽 hook 治标不治本（仍 >800+净增）。用户认可遗留，独立重构 task 治本（拆 PopupView，见 t044）。

### 结果摘要

- 即将重置监控从 account 级（`upcomingResetOff` 默认全开）改为 metric 级显式开启（`upcomingResetWatched`，默认全关）。数据层（config schema/helpers/collect watchedMetrics/rawLabel）+ UI（主面板 period 行 bell toggle，t041 account 链路清除）完成；TDD 红→绿，双审 round 2 test PASS，code f001 遗留（PopupView 膨胀，独立 task）。

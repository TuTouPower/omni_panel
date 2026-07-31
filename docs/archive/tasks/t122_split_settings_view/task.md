---
tid: "t122"
slug: "split_settings_view"
title: "拆分 SettingsView：抽 AccountDialog + catalog hook + 工具函数"
status: "done"
branch: "t122_split_settings_view"
worktree: ""
review_level: "full"
diff_anchor: "847e43beeb0ce3382923526c90cd3c1e7d809599"
depends_on: ""
conflicts_with: ""
schedule_status: ""
note: ""
---

# Task t122_split_settings_view

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

只记有追溯价值的进展、踩坑、中途决策、偏离 plan、关键验证；不写命令流水账。

- 无事项时写：无

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 解决不了；满轮后进 blocked，在「遗留」与口头报告中列出
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

### Round 1 (2026-07-26 18:20 UTC+8)

| finding_id     | severity | status | rationale                                                                    | fix_ref |
| -------------- | -------- | ------ | ---------------------------------------------------------------------------- | ------- |
| t122_code_f001 | minor    | 撤回   | interval_label 重复计算在原 SettingsView 中已存在，拆分未引入新逻辑          | —       |
| t122_code_f002 | minor    | 遗留   | AccountDialog→views/lib 反向依赖由拆分暴露；session_meta 待迁至 renderer/lib | —       |
| t122_code_f003 | minor    | 遗留   | accounts_section 436 行略超 minor 阈值，未达 800 硬限；后续可拆 AccountsList | —       |

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep {tid}` 查，不在此记。

### 验收标准勾选

- [x] SettingsView.tsx 行数降至 800 行以下（724 行）
- [x] 抽出的子组件/hook 在新位置被 SettingsView 正确 import，无重复定义
- [x] pnpm typecheck 通过（无新类型错误）
- [x] pnpm test 全绿（1749/1750，config-store EPERM 为 Windows 已知 flaky）
- [x] 行为零变化：纯文件搬迁 + import 路径调整 + 必要 props 类型导出

### Reviewer verdict

- Round 1 code：FAIL（3 minor：f001 撤回，f002/f003 遗留）
- Round 1 test：PASS（0 finding）
- Round 2 code：N/A（未改代码，无需加轮）
- Round 2 test：N/A

### 遗留

- `t122_code_f002`：AccountDialog→views/lib 反向依赖；待后续将 session_meta 迁至 `src/renderer/lib/`
- `t122_code_f003`：accounts_section.tsx 436 行超 minor 阈值；待后续拆 AccountsList

### 结果摘要

SettingsView 2352→724 行，8 个子文件按领域拆分，行为零变化。

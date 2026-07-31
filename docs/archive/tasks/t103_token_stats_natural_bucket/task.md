---
tid: "t103"
slug: "token_stats_natural_bucket"
title: "token-stats preset 按自然边界切片"
status: "done"
branch: "t103_token_stats_natural_bucket"
worktree: ""
review_level: "full"
diff_anchor: "917567d3192d82b31c615718f42f5f59441cac5f"
depends_on: ""
conflicts_with: ""
schedule_status: ""
note: ""
---

# Task t103_token_stats_natural_bucket

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 2026-07-24 创建 task。背景：用户反馈代理面板选「7 天」时，7/24 15:30 当前时刻下显示的是 `7/17 ... 7/23` 共 7 根柱，7/24 没有自己的柱子。根因：`bucketize` 按 `start + i * step` 等长切，label 取每个 bucket 起点时间所在的日期——bucket 起点是 7/17 15:30 所以 label=7/17（但实际覆盖区间大部分在 7/18）；7/24 数据被合并进 label=7/23 的末 bucket。用户要求按自然日/自然小时边界切片，首末允许 partial。
- 2026-07-24 用户确认：「24h」也按小时自然边界切；「30d」31 根含两端 partial。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 解决不了；满轮后进 blocked，在「遗留」与口头报告中列出
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

### Round 1 (2026-07-24 23:07 UTC+8)

| finding_id       | severity  | status | rationale                                                                            | fix_ref                                                                |
| ---------------- | --------- | ------ | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `t103_test_f001` | important | 已修   | 补充 24h/30d 的 `prepareBarData` 回归覆盖，并验证视图切换 preset 后传递对应 `gran`。 | `chart-data.test.ts`、`token_stats_view.test.tsx` 的自然时间桶回归用例 |

代码审查 Round 1 为零 finding；测试审查 finding 已修，进入 Round 2 复审。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep {tid}` 查，不在此记。

### 验收标准勾选

- [x] 当前 7/24 15:30 选「7 天」，柱状图显示 8 根：label = `7/17 ... 7/24`；7/17 和 7/24 为 partial。
- [x] 当前 7/24 15:30 选「24 小时」（hour 模式），显示 25 根：首末 partial。
- [x] 当前 7/24 15:30 选「30 天」，显示 31 根：首末 partial。
- [x] record.timestamp 路由正确。
- [x] `bucketize` 单测覆盖非整点 start + 跨自然日。
- [x] `pnpm test` 全量通过（158 files / 1628 tests）。

### Reviewer verdict

- Round 1 code：PASS
- Round 1 test：FAIL（`t103_test_f001` 已修）
- Round 2 code：PASS
- Round 2 test：PASS

### 遗留

- 无。

### 结果摘要

- `bucketize` 保持滑动窗口端点，以本地自然日或自然小时生成首末 partial bucket；`idx` 在自然边界进入新桶，`end` 仍归末桶。
- `BarChart` 小时轴改用真实 bucket 起点显示每 6 小时 tick 与午夜日期，project/session 轴不变。
- 自动化验证覆盖 7d、24h、30d 聚合与 preset → `BarChart` 粒度透传；未单独启动含可控 token records 的代理面板进行人工截图。

---
tid: t162
slug: records_query_limit_window
diff_anchor: "43c6d1637387694101c1113bc138afa69d81df04"
branch: t162_records_query_limit_window
---

# Task t162_records_query_limit_window

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- diff_anchor: 43c6d163（main HEAD at start）。
- 现状澄清：start/end 下推、TokenStatsRecordFilters 已含 start/end，本 task 只补 limit + loadData 传时间窗。
- store：query_records 末尾 `LIMIT @limit`（参数化），缺省 DEFAULT_RECORDS_LIMIT=5000。
- view：loadData 传 `{...(env?), start, end}`，依赖纳入 currentRange（memo 稳定，preset 变才重拉，无闭环）。
- 黑盒：pnpm test 184 files / 1886 tests 全过（+4 新增）。
- 双审：code PASS / test PASS，零 finding。

## Review 处置

### Round 1 零 finding

Round 1 双轴均零 finding，未进处置表。code/test verdict 均 PASS。

## 收尾报告

### 验收标准勾选

- [x] `query_records` SQL 含 `LIMIT`，且 `filters.limit` 缺省时有默认兜底（默认 5000）。
- [x] `TokenStatsView.loadData` 向 `getRecords` 传入当前时间窗 start/end。
- [x] 打开代理面板后渲染进程持有的 records 数 ≤ limit（默认 5000），不再为全表规模。
- [x] 窗口内 records ≤ limit 时数据与改动前一致；超限时仅保留最新 N 条（视觉一致由 t164 兜底）。
- [x] 新增/更新单测覆盖 `query_records` 的 limit 下推。

### Reviewer verdict

- Round 1 code：PASS
- Round 1 test：PASS
- Round 2 code：N/A
- Round 2 test：N/A

### 遗留

- 无

### 结果摘要

止血完成。代理面板 records 加载从全表（本机 38 万行）降至默认 5000 条（按时间窗 + ORDER BY timestamp DESC 保留最新 N）。主进程不再一次性物化全表经 IPC 传输。render 端 records 持有量 ≤5000。loadData 现在传 start/end 时间窗，主进程侧过滤下推生效。完整视觉一致性（超 limit 的窗口）由 t164 兜底。

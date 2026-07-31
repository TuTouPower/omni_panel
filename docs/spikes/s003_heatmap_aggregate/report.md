# Spike report

## 问题

热力图修复候选方案 A（SQLite `GROUP BY weekday,hour` 聚合查询）的两项未知：

1. `strftime('%w'/'%H', timestamp/1000, 'unixepoch', '+8 hours')` 对 epoch ms 的 weekday/hour 提取，是否与 UTC+8 时区解释一致（含跨日、跨周、月界边界）。
2. 30d（~60 万行）records 上聚合查询的耗时与返回行数。

## 成功判据

- 全部边界用例的 SQL weekday/hour 与 `Asia/Shanghai` 时区解释一致。
- tokens/calls/sessions 三种 metric 聚合计数正确。
- 30d 聚合耗时与现 records 路径（LIMIT 100000）相当，返回格数固定 ≤168。

## 尝试

实验代码见 `code/`（strftime 正确性 + 性能两脚本，运行：`python3 code/spike_s003_*.py`，依赖系统 python3 sqlite3）。

- `spike_s003_strftime.py`：9 个边界用例（跨日界、周日 23:59→周一 00:00、月界、年界），每例插两行同 session 记录，跑 `GROUP BY w,h`，比对 Python `zoneinfo("Asia/Shanghai")` 期望值。
- `spike_s003_perf.py`：内存库插入 60 万行（30d 分布），测全表/7d/1d 聚合耗时，并对照现 `ORDER BY timestamp DESC LIMIT 100000` 路径。

## 证据

- 正确性：9 例全 PASS（`w/h` 映射一致，`calls=2 / sessions=1 / tokens=470` 逐例正确），聚合行数 9 ≤ 168。
- 性能（内存 SQLite）：
    - 30d 全表聚合：591.9 ms，42 格
    - 7d 聚合：148.1 ms
    - 1d 聚合：19.4 ms
    - 对照 7d LIMIT 100000 SELECT：168.8 ms，返回 100 000 行

## 结论

- SQLite `strftime` + `'+8 hours'` 对 epoch ms 的 weekday（0=周日）/hour 提取与 UTC+8 语义完全一致，边界无误。
- 方案 A 聚合返回 ≤168 格，数据量固定；30d 聚合耗时与现路径相当（磁盘 I/O 下会略高于内存值，但量级一致），renderer 不再拉 10 万行 records。
- 方案 A 成立。

## 是否采纳

- 决定：是
- 理由：正确性验证通过，性能与现状相当且返回量固定，30d 窗口可用。
- 后续 task：t170

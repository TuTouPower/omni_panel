# d002 SQLite strftime epoch ms 的 UTC+8 weekday/hour 聚合（2026-07-31）

- 来源：s003
- 结论：SQLite `strftime('%w'/'%H', timestamp/1000, 'unixepoch', '+8 hours')` 对 epoch ms 的 weekday（0=周日）/hour 提取与 UTC+8 语义一致，可作热力图等按本地时区聚合的后端 GROUP BY 依据。
- 证据：s003 脚本 9 边界用例（跨日、周日 23:59→周一 00:00、月界、年界）全部与 Python `zoneinfo("Asia/Shanghai")` 期望一致；`COUNT(*)`/`COUNT(DISTINCT session_id)`/`SUM(tokens)` 逐例正确。
- 影响：`token-stats-store` 可新增按 weekday×hour 的聚合查询（方案 A），30d 全表 60 万行聚合约 592ms（内存）、返回 ≤168 格；7d 约 148ms。
- 现状：有效

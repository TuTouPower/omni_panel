# p045 idx_trend 索引对 trend 查询冗余（t214 审阅建议）

- 来源：t214_code review 未进表提示
- 内容：t214 给 `query_trend_series` SQL 加 source_instance_id 后，SQLite planner 改用 idx_lookup（provider, account_id, metric_id, source_instance_id, observed_at）全覆盖，idx_trend（provider, account_id, metric_id, observed_at）对该查询不再被选用（见 d015）。idx_trend 保留无害但属冗余索引（占空间、增写入开销）。清理前须确认无其他查询路径依赖 idx_trend 的列序（如不含 source_instance_id 的等价范围查询）。
- 处理：t221

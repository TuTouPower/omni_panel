# p040 session 轴会话 key 不含 env（t200 遗留）

- 来源：t200_code_f003
- 内容：rollup DTO 行（`tokenStatsRollupRowSchema`）不含 `env`，renderer `prepareBarDataFromDashboardRollup` 的 session_key 缩为 `${source}|${session_id}`；改前服务器含 env（`${source}|${env}|${session_id}`）。跨平台同 session_id 的会话在 session 轴会合并为一个 category。session_id 为 UUID 碰撞概率极低。补 env 会改变 `query_range_rollup` 的分组/校验语义，改动面广，暂缓。
- 处理：t217

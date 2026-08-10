# d016 sparkline 取点策略：固定 ≤max_points 桶 + 窗口选择（2026-08-05）

- 来源：t208
- 结论：`query_trend_series` 取点从「按 UTC 天分桶、长度=days、null 填充」改为固定桶数（max_points 默认 120）：原始点数 ≤cap 时每点独立（不聚合，保留采集粒度），超过则按 cap 桶均分 `[now-days, now]` 窗口、每桶取 observed_at 最大一条；不再 null 填充。DB 细粒度存储（30min 采集）此前被按天压缩为一天一点，现按实际采集粒度渲染。前端窗口选择器（1/7/30 天）session 内 state，cache_key 含 days。sparkline 宽 560px/有效 ~514px/点半径 2.6px，120 点间距 ~4.3px 清晰不糊。
- 证据：t208 `trend-granularity.test.ts` 4 用例（48 点>1、≤120、原始<cap 不聚合、>cap 同桶取最新）；DB 实测 tavily avg 18min 采集间隔。
- 影响：trend 三路径（IPC/local-api/web）返回长度语义变（≤max_points，非 days）；`build_trend_series` 入参保留 `|null` 防御；sparkline 不再因按天压缩丢日内波动。窗口选择不持久化（后续增强）。
- 现状：有效

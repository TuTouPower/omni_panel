# p030 t191 `freshness.stale` 恒为 false

- 来源：t191_code_f007
- 内容：`query_dashboard` 返回 `freshness: { queried_at, stale: false }` 硬编码，不反映真实数据新鲜度；renderer 当前未消费 stale
- 处理：t201

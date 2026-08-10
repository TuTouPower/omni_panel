# p029 t191 会话翻页重算整个 dashboard

- 来源：t191_code_f006
- 内容：renderer query key 含 `session_offset`，翻页 cache miss 后重新请求完整 dashboard（summary/chart/heatmap 一并重算），连续翻页将同窗口全量聚合重复执行
- 处理：t200

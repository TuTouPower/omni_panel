# d039 会话库内容搜索增量：renderer 分块多次 searchContent

- 来源：s030 spike / t404
- 结论：冷缓存内容搜索增量与进度采用 **(A) renderer 分页多次 `searchContent`**，不引入主进程进度事件/SSE。Request 可选 `offset`/`limit`（省略=全量一次，兼容旧调用）；Response 可选 `progress: { scanned, total, done, next_offset }`；本批只 resolve/extract 候选 slice。
- 证据：s030 对比 (A)/(B)；现网单次 Promise + t263 AbortSignal；(B) 需新 IPC channel 与 web 流式面。报告：`docs/spikes/s030_search_content_incremental_ipc/report.md`。
- 影响：IPC/local-api/preload/web 同形扩展字段；`SessionLibrary` 循环合并 sessions 并展示「已扫描 N/M」；keyword 匹配语义不变。
- 现状：有效

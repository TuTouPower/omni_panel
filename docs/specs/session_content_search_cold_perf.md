# session_content_search_cold_perf

会话库「包含消息内容」搜索冷缓存性能与反馈（t404 / p186）。

## 行为

- 内容搜索对候选会话分块扫描（默认每批 64），keyword 命中判定与既有 `searchContent` 一致（消息文本 lowercase includes）。
- 搜索进行中 UI 展示进度「已扫描 N/M 个会话」（或等价）；完成后隐藏进度。
- 每批命中 sessions 立即合并展示（增量结果），不等全部候选解析完。
- 全部批次完成后最终命中集完整（不丢）；枚举达 SEARCH_ENUM_CAP 时仍返回 `truncated` 降级提示（t388）。
- 切换关键词 / 离开搜索时 abort 未完成请求与后续分块循环，不泄漏、不覆盖新一轮 UI 状态。

## 契约

- Request 可选 `offset` / `limit`（省略 = 从 0 扫到末尾，兼容旧全量一次调用）。
- Response 可选 `progress: { scanned, total, done, next_offset }`；本批 `hits`/`sessions` 仅含本 slice（offset=0 时附带 metadata 命中）。
- Electron IPC 与 local-api HTTP 同形；不新增进度事件 channel / SSE。
- extract_cache 仍为进程内内存 Map；不做磁盘持久化（非本 spec 范围）。

## 验证

- 单测：`clamp_search_content_range`、IPC/local-api 分块 progress、renderer 进度文案与增量、取消不续 offset。
- 黑盒：`pnpm test`；大会话库 Playwright 命中数属环境相关，不设硬秒数门禁。

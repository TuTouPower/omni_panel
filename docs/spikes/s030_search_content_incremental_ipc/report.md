# Spike report

## 问题

内容搜索冷缓存需分块/增量反馈。候选 IPC 形态：

- (A) renderer 分页多次调用 `searchContent`（每次小候选集，结果合并展示）
- (B) 主进程回调/事件推送进度（Electron event + web SSE/NDJSON）

选型目标：协议侵入度、Electron/web 对称、取消语义、与现有单次 Promise 兼容。

## 成功判据

- 能同时满足 AC-001 进度、AC-002 增量结果、AC-005 取消，且不改 keyword 匹配语义。
- Electron IPC 与 local-api HTTP 共用同一请求/响应字段，避免双协议。
- 相对 (B) 不新增进度 channel / SSE / NDJSON 解析面。

## 尝试

- 读 `subscription-service.searchContent`（concurrency=3、abort 停新 loc、extract_cache 内存 Map）。
- 读 `session-history-ipc` / local-api `handle_session_history_search_content`：单次 Promise 返回全量 hits/sessions。
- 读 renderer `SessionLibrary` 内容搜索 effect：单次 await +「搜索消息内容中…」。
- 评估 resolve 成本：`resolve_session_file` 有进程缓存 + 持久索引；按 slice 只 resolve 本批候选即可。
- 评估 (B)：须新增 `searchContentProgress` IPC + web 流式/轮询，preload/web shim/类型面全面扩张。

## 证据

- 现契约：`SessionHistorySearchContentRequest/Response` 无 offset/limit/progress（`src/shared/types/ipc.ts`）。
- 取消已具备：IPC per-sender AbortController、HTTP `res.on('close')`、renderer AbortSignal（t263）。
- 瓶颈在 `extract_full` 非枚举；分块后每批只 extract 本 slice，总提取量不变，首批可先返回。

## 结论

选 **(A) renderer 分页多次 searchContent**。

扩展可选字段（省略行为=现网全量一次）：

- Request：`offset?`、`limit?`
- Response：`progress?: { scanned, total, done, next_offset }`；本批 `hits`/`sessions` 仅含本 slice（offset=0 时附带 metadata 命中）。

renderer 默认 `limit=64` 循环至 `progress.done`，合并 sessions、展示「已扫描 N/M」、signal abort 停环。

可信度高：不改匹配逻辑，复用 abort/extract_cache，HTTP/IPC 同形。

限制：每批重跑 `query_all_sessions`（SQLite，4000 级可忽略）；不解决 extract_cache 跨进程持久化（非范围）。

## 是否采纳

- 决定：是
- 理由：最小侵入、双端对称、满足全部 AC
- 后续 task：t404

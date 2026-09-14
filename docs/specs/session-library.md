# session-library

会话历史查询的桌面 IPC 与 LocalAPI 共享同一运行时契约（t476）。入口只负责
解包/封装，校验、候选枚举、分页区间和摘要 loc 归一化由
`src/main/core/query-contract.ts` 提供。

## 查询契约

|能力|必填与边界|非法输入|
|---|---|---|
|会话 query|`id`、`source`、`env` 非空；`limit` 为整数且 ≥1；`before_cursor` 为有限分页游标|400 / `VALIDATION_ERROR`|
|recent|`source`、`env` 非空；`limit` 为 [1, 10000] 整数|400；limit 使用 `INVALID_LIMIT`|
|searchContent|`keyword` 为 string；现代请求的 `filters` 为 object，`sources` 为 string[]，`search`/`title`/`directory` 为 string；候选 `offset`/`limit` 使用既有 clamp 语义|400 / `VALIDATION_ERROR`|
|summaries|`locs` 必须为数组；数组内无效 loc 逐条跳过，合法 loc 保留|容器错误 400 / `VALIDATION_ERROR`|

`CONTENT_SEARCH_PAGE_SIZE=100`、`SEARCH_ENUM_CAP=100000` 与 limit 上下界只在共享
模块定义一次。`GET /v1/sessionHistory` 与 `/v1/sessionHistory/query` 提供同一
query 行为；`GET /v1/sessionHistory/recent` 与桌面 recent 使用同一 service。

## 入口一致性

- `sessionHistory:query` 与 HTTP query 对同一定位和分页参数返回相同消息排序与游标。
- `sessionHistory:searchContent` 与 HTTP `POST /v1/sessionHistory/searchContent`
  共享候选过滤、枚举上限、分页区间和畸形输入分类。
- `sessionHistory:summaries` 与 HTTP `POST /v1/sessionHistory/summaries` 共享 loc
  逐条跳过策略。
- token-stats 的 sessions/records limit、trend 必填项与 days 默认值也经同一共享
  契约校验；dashboard 的 `status.sources_status` 始终为最新来源状态数组，没有采集
  报告时为 `[]`。

## 验证

- `tests/unit/main/query-contract.test.ts`：共享契约、边界、分页和默认值。
- `tests/unit/ipc/session-history-ipc.test.ts`、`tests/unit/ipc/token-stats-ipc.test.ts`
  与 `tests/unit/ipc/trend-ipc.test.ts`：桌面适配器。
- `tests/integration/local-api/server.test.ts`：HTTP 双入口/真实 store 集成覆盖；受
  环境 native SQLite 绑定缺失时记录为环境阻塞。

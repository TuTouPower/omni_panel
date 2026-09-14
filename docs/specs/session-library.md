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

## Command Code 会话历史（t484）

- source `commandcode` 只在 `linux`/`mac` 可达，路径为
  `~/.commandcode/projects/<encoded-cwd>/<session_id>.jsonl`。locator 只按项目目录
  下的精确文件名匹配，不把 session id 当作路径片段。
- extractor 只保留 `type: "message"` 的 user/assistant text block；user 还必须满足
  `message.meta.source === "user"`。thinking、tool_use、tool_result、未知 block、
  非法 JSON 和畸形 timestamp 不进入统一消息列表。
- 字节游标支持追加增量、UTF-8/半行回退和 invalid JSON；检测到截断或同尺寸重写时
  全量重提取并替换缓存，避免把旧消息接到新文件后面。首条/末条 user 摘要复用同一
  过滤规则。
- `sessionHistory:query`/`subscribe` 与对应 LocalAPI 入口复用同一 locator/service，
  因此桌面和 Web 都能打开 Command Code 会话并接收 `messagesUpdated`。
- 会话面板的 Command Code 操作调用宿主固定的 `cmd --resume <session_id>`；IPC 和
  LocalAPI 只接受本地平台与已定位的 Command Code session，并使用无 shell 参数数组
  启动，不执行 renderer 传入的任意命令。

## 验证

- `tests/unit/main/query-contract.test.ts`：共享契约、边界、分页和默认值。
- `tests/unit/ipc/session-history-ipc.test.ts`、`tests/unit/ipc/token-stats-ipc.test.ts`
  与 `tests/unit/ipc/trend-ipc.test.ts`：桌面适配器。
- `tests/unit/main/core/session-history/commandcode-extractor.test.ts`、
  `tests/unit/main/core/session-history/subscription-service.test.ts`、
  `tests/unit/main/core/session-history/resume.test.ts`：Command Code 提取、watcher
  与固定宿主 resume。
- `tests/integration/local-api/server.test.ts`：HTTP 双入口/真实 store 集成覆盖；受
  环境 native SQLite 绑定缺失时记录为环境阻塞。

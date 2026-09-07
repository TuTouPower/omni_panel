# 会话查询支持独立标题、工作目录过滤

需求：会话列表查询与正文搜索候选过滤增加可选独立 `title`、`directory` 条件（t457）。旧 `search` 把 title、directory、id 拼成一串子串匹配，无法表达「标题含 A 且工作目录含 B」；会话库 UI（t458）与 coding agent skill（t460）依赖独立条件 AND。

## 查询契约

- `query_sessions` 过滤器新增 `title` / `directory`：非空时对对应列做大小写不敏感子串匹配（`unicode_lower(...) LIKE unicode_lower(@param) ESCAPE '\\'`）；省略或空字符串 = 该项不约束。
- 与现有 `source` / `sources` / `env` / `search` / `start_at` / `end_at` / `order_by` / `direction` / `limit` / `offset` 全部 AND。
- 旧 `search`（title/directory/id 拼串混搜）语义不变。
- LIKE 特殊字符（`%` `_` `\`）转义与参数绑定策略与 `search` 一致（`replace(/[\\%_]/g, ...)` + `ESCAPE '\\'`），用户输入不拼进 SQL。

## 入口

三入口收敛到同一 `query_sessions` 过滤语义（AC-007）：

|入口|载体|透传方式|
|---|---|---|
|`GET /v1/sessions`|LocalAPI HTTP|查询参数 `title=` / `directory=`（空串视为不约束）|
|桌面会话列表|IPC `TOKEN_STATS_SESSIONS`|`TokenStatsSessionFilters` 对象整传（preload → handler → store 纯透传）|
|web `getSessions`|LocalAPI HTTP（经 `usageboard-web.ts` 序列化）|filters 非空才序列化为查询参数|

## 正文搜索候选过滤（AC-006）

`searchContent`（IPC `sessionHistory:searchContent` 与 HTTP `POST /v1/sessionHistory/searchContent`）的 `filters` 同样接受 `title` / `directory`：候选枚举与 metadata 命中查询两条路径均透传，被排除的会话不进候选、不因正文含 keyword 进入命中。HTTP 侧对非字符串值回 400（与 `search` 校验同级）。

## 验收标准

- AC-001：仅非空 `title=T` 时，返回会话 title 均含 T（大小写不敏感）；title 不含 T 的不返回，即使 directory/id 含 T。
- AC-002：仅非空 `directory=D` 时同上对称。
- AC-003：同时提供两条时 AND；只满足其一不返回。
- AC-004：与现有全部条件 AND；排序分页照常。
- AC-005：省略或空串 = 不约束；`search` 混搜语义不变。
- AC-006：searchContent filters 接受同样两条，语义与列表一致。
- AC-007：三入口同一组条件同一结果。

## 测试

- store：`tests/unit/main/core/token-stats/token-stats-store.test.ts`（`t457` 前缀用例：独立过滤判别、AND、空串、LIKE 转义）。
- IPC：`tests/unit/ipc/session-history-ipc.test.ts`（透传断言 + 空串）。
- HTTP：`tests/integration/local-api/server.test.ts`（真实 store 端到端 + searchContent 透传 + 400）。
- web：`tests/unit/web/usageboard-web.test.ts`（序列化与空串省略）。

## 非范围

- 会话库筛栏控件（t458）、桌面写 `cli.json`（t459）、skill/指南（t460）。
- 新排序字段、默认 limit、命中消息片段、鉴权与绑定地址。

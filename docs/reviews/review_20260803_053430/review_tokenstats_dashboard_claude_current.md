# tokenstats_dashboard

## 审阅范围

仅审 `D:/Dev/Code/omni_usage_t191` 当前目标 diff：token-stats dashboard query API 及其 main/core、IPC、preload、shared DTO、local API、renderer、web 调用链。未运行构建或测试。

## 高优先级

### 1. Web 端丢弃 dashboard 可选参数，别名与会话翻页无法跨边界传递

- file: `D:/Dev/Code/omni_usage_t191/src/web/usageboard-web.ts:235-245`
- summary: `getDashboard` 只序列化 `agent/platform/start/end/metric/xaxis/gran`，未传 `dir_aliases`、`model_aliases`、`session_offset`、`session_limit`；renderer 通过同一 `UsageboardApi` 已传入这些字段，但 web adapter 静默丢弃。
- failure_scenario: Web 模式配置目录/模型别名后，desktop 的 KPI、donut、图表按别名聚合，web 端请求仍按原始 key 聚合，面板各区域口径不一致。Web 端会话表翻到下一页时，`TokenStatsView` 改变 `session_offset` 并重新查询，但 URL 永远没有 offset，服务端重复返回第一页。
- impact: Web 与 Electron 的同一 DTO 查询契约不一致；别名展示和按需会话加载均失效。
- suggestion: 将所有 dashboard query 字段按 DTO 映射到 URL（别名可 JSON 编码），或改用 POST JSON；补充 web adapter 对别名和分页字段的契约测试。
- confidence: 高
- priority: P1

### 2. Local API dashboard 入口无法接收别名参数，web 传输即使补齐也会被截断

- file: `D:/Dev/Code/omni_usage_t191/src/main/core/local-api/server.ts:288-303`
- summary: `/v1/dashboard` 的 query 构造只读取基础字段、`session_offset`、`session_limit`，未读取 `dir_aliases` / `model_aliases`；shared schema 明确允许两组别名，Electron IPC 路径则完整透传。
- failure_scenario: 任意浏览器客户端按 `TokenStatsDashboardQuery` 约定发送别名（例如 URL 中带目录/模型 alias）时，local API 构造的 `query` 不含 alias，`store.query_dashboard` 用原始目录/模型完成 summary 与 chart 聚合；renderer 仍可能按本地 alias 二次显示，导致 web summary、图表、会话标签之间不一致。
- impact: local API 与 IPC 对同一 DTO 的字段覆盖不完整，跨端行为不可互换。
- suggestion: 定义明确的 alias URL 编解码格式并在这里解析、校验后传入 store；避免只依赖 TypeScript 类型而不做 HTTP 传输契约。
- confidence: 高
- priority: P1

## 中低优先级

### 3. 会话表改变每页大小后，在已加载远端页上显示空表且不触发重新加载

- file: `D:/Dev/Code/omni_usage_t191/src/renderer/components/token-stats/SessionTable.tsx:72-80,255-261`
- summary: dashboard 分页数据带 `loadedOffset`；切换 page size 时只 `setPage(1)`，不重置 `loadedOffset` 或调用 `onPageChange(0)`。随后第一页的 `requestedStart=0` 不在当前远端窗口内，`slice` 被强制置为空。
- failure_scenario: 会话总数超过 100，先翻到第 2 个远端窗口（`loadedOffset=100`），再把页大小从 10 改成 20/50。组件页码变为 1，但数据仍是 offset 100，条件 `requestedStart >= loadedOffset` 为假，表格显示“该筛选条件下暂无记录”，且没有任何请求回第一页；用户只能切换筛选条件或触发其他刷新恢复。
- impact: 正常分页操作呈现错误空状态。
- suggestion: page size 改变时先 `setPage(1)`，同时调用 `onPageChange?.(0)`；或让父组件在 page size 变化时重置 session offset，并以已加载窗口覆盖当前页再渲染。
- confidence: 高
- priority: P2

### 4. 模型别名开启时，会话表模型标签颜色与 dashboard donut 颜色失配

- file: `D:/Dev/Code/omni_usage_t191/src/renderer/views/TokenStatsView.tsx:167-177`；`D:/Dev/Code/omni_usage_t191/src/renderer/components/token-stats/SessionTable.tsx:52-68`
- summary: `dashboard_model_colors` 以服务端 summary 的 alias key 建立颜色表；会话行的 `models` 仍是 raw model，`display_models` 虽解析成 alias，但 `colorForModel(m)` 仍用 raw key 查询，命中不了 alias key，回退到 `otherColor`。
- failure_scenario: 配置 `{ alias: "Claude", models: ["claude-sonnet-4"] }` 后，donut 为 alias `Claude` 分配主色；会话表显示同名 `Claude` 标签却使用“其他”灰色。多个 alias 时所有会话标签均可能失去与图表对应的颜色，用户无法按颜色追踪同一模型组。
- impact: dashboard DTO 已统一别名聚合，但 renderer 下游再次映射时破坏视觉契约。
- suggestion: 建立 raw model 到 resolved alias 的颜色映射，或在 `display_models` 中以 resolved label 查询颜色；同时覆盖 alias 会话表颜色测试。
- confidence: 高
- priority: P3

## 不确定项

- 未发现需要列入报告、但无法通过静态调用链高置信确认的其他问题。

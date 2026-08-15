# Task spec

## 背景

web 面板（`--cli serve` + 浏览器）每个会话开一条 `EventSource('/v1/events?subscriberId=')`，另加 1 条全局 `/v1/events`。LocalAPI 是 Node HTTP/1.1，Chrome 同 origin 上限 6 条长连接。8 槽挂满后 6 条 SSE `readyState=1` 永不结束，`getSessions` / `query` / 刷新等同源 fetch 永久排队，页面转圈、「最近会话」列表空。2026-08-16 在 CDP 9223 复现：关 2 条 OPEN SSE 后同页 fetch 182ms 恢复。根因与同类位点见 p187。用户批准修复目标：**一页一条** EventSource，会话推送与全局 state/config/theme 走同一连接。

## 契约区

### 范围

- web 桥对 local-api origin 每个页面只开 1 条 EventSource。
- 该连接同时承载：connector 状态、config、theme、已订阅会话的 `messagesUpdated`。
- 单页 unsubscribe / 整页关闭 / 断线重连后，订阅与推送语义与现网一致（不串会话、不漏仍打开的会话、不把别的页的订阅清掉）。
- 补回归：8 个会话已订阅时同源 `getSessions`（及同类 fetch）能在超时内完成。

### 非范围

- 不改桌面 Electron `sessionHistory` IPC 路径。
- 不把 LocalAPI 升级为 HTTP/2。
- 不处理 omni_panel 进程自连 18263、系统代理、Chrome LNA。
- 不改 renderer `sessionHistory.subscribe(source, env, session_id)` 调用方契约。
- 不做「每页最多 5 条 EventSource」的中间方案。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。

<!-- /规范 -->

- [ ] AC-001：同一 web 页面在已 `subscribe` 8 个不同会话、并且已注册 state / config / theme 监听之后，对该 local-api origin 只存在 1 个 EventSource 实例。
- [ ] AC-002：AC-001 的 8 会话已订阅状态下，该页发出的 `getSessions`（`GET /v1/sessions`）在 5 秒内返回 HTTP 200，body 为会话数组。
- [ ] AC-003：已订阅会话 A 与会话 B 时，服务端推送的 `messagesUpdated` 带 A loc 的只投递给监听方一次且 loc 为 A；带 B loc 的同理；A 的帧不会以 B 的 loc 出现。
- [ ] AC-004：`unsubscribe` 会话 A 之后：后续 A 的 `messagesUpdated` 不再投递给该页；B 仍能收到 B 的推送；EventSource 实例数仍为 1。
- [ ] AC-005：该页唯一 EventSource 断线后再次 `open`：调用方不必再调 `subscribe`，仍处于订阅中的会话能收到之后的 `messagesUpdated`。
- [ ] AC-006：同一 origin 两个页面各 `subscribe` 不同会话时，每个页面恰好 1 个 EventSource；关闭页面 1 之后，页面 2 仍能收到其会话的 `messagesUpdated`。
- [ ] AC-007：只开这一条 EventSource 时，connector 状态（默认 `message`）、`config`、`theme` 帧仍投递到既有 `onStateChange` / `onConfigChange` / `onThemeChange` 回调。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试。

## 上下文区

- 来源：p187（2026-08-16 `task-bug` 复现与根因；`docs/pending/todo/p187_web_sse_http11_conn_pool.md`）。现场：CDP `queryObjects(EventSource)` 6 OPEN + 3 CONNECTING 时 fetch 超时；关 2 条 OPEN 后 182ms 200。
- 根因：每会话一条长活 EventSource + 1 条全局 SSE，超过 Chrome HTTP/1.1 同 origin 6 连接上限。
- 已确认同类位点（须一并覆盖，禁止只改其中一处）：
    - `src/web/usageboard-web.ts` `ensure_events`（全局 `EventSource('/v1/events')`）
    - `src/web/usageboard-web.ts` `sessionHistory.subscribe`（每会话 `EventSource('/v1/events?subscriberId=')`）
- 已扫 `new EventSource` / `new WebSocket`：无第三处。桌面 IPC 不同因。omni_panel 自连 18263 待确认、不在范围。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- Chrome 6 连接上限本身、系统 `http_proxy`、LNA 权限：环境放大器，不是本修复契约。
- omni_panel 进程自连 18263：未证实同机制。
- 桌面 IPC 订阅路径：非范围。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 桥层：可继续 stub `EventSource` 构造函数，断言 `subscribe` N 次 + `ensure_events` 之后实例数为 1，不随槽位数线性增长；`unsubscribe` 不 `close` 共享连接（除非该页已无任何监听）。覆盖两处旧构造点，避免只修 subscribe 仍残留全局第二条。
- 服务端：真实 `createServer` 集成——一条 SSE 连接上登记多个会话订阅，推送按 loc 隔离；连接 close 只清该连接上的订阅；第二条 SSE 连接互不影响（AC-003/004/006）。
- 重连：对同一 EventSource 再次触发 `open`，断言仍打开的会话无需再 `subscribe` 即可收到后续帧（AC-005）。
- 回归饿死：8 次 subscribe 之后对同一 origin 发 `GET /v1/sessions`，5s 内 200（AC-002）。优先真实 HTTP 客户端；不要只 mock 掉 fetch。
- 既有 t279 单测（专属 SSE URL、open 后 POST、失败 close）语义失效时：**新增**覆盖「共享一条 + open 后登记/重挂」的用例；旧测试整段删除并写明理由，禁止把旧预期改成当前输出却仍叫原名字。
- web e2e 非必须；若加，挂满多槽后点「最近会话」列表非空可作为 AC-002 的端到端补充，不替代桥层计数断言。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：单连接多订阅的 close/重连竞态（t279 f005 同类）误删另一页或新连接的订阅；unsubscribe 误关共享 EventSource 导致全局 state/config/theme 静默停更；旧客户端若仍带 `subscriberId` 查询参数开专属流，混跑时行为分叉。
- 回退：回退本 task 实现 commit，恢复每会话一条 EventSource（症状回到 p187）。HTTP 的 `POST /v1/sessionHistory/subscribe|unsubscribe` 路径尽量保持，便于回退。

### 依赖与约束

- 无前置 task。
- renderer / preload 的 `sessionHistory.subscribe|unsubscribe|onMessagesUpdated` 签名不变。
- 单连接上如何挂多个会话（不再使用 `subscriberId` 查询参数、一条连接多个 id、或按 loc 把 `messagesUpdated` 推到该连接上已登记的订阅）由实施选择，以本 spec AC 为准。
- LocalAPI 保持 HTTP/1.1。
- 与 t406–t413 无共享文件预期冲突（那些是会话 UI；本 task 动 web 桥与 local-api SSE）。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：「web 实时推送（t279）」段——删除「每订阅一条专属事件流」，改为每页一条 SSE、多会话登记在同一连接。
- `docs/specs/web-panel.md` §5：EventSource 条数与会话推送复用同一连接。
- `docs/specs/platform-services-api.md`：`GET /v1/events` 与 sessionHistory 订阅的连接模型。
- `docs/specs_index.md`：`web-panel` / `platform-services-api` 行补 t414。

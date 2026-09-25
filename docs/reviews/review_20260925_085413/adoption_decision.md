# 审阅结果决策

## 目录

- 主目录：`docs/reviews/review_20260925_085413`（本文件所在）
- 并读目录：`docs/reviews/review_20260925_084303`（同轮较早的全仓审查，10 项；逐项映射见文末「附录」）

## 报告来源

- 已读：
    - `review_20260925_084303/review_intensive.md`
    - `review_20260925_085413/review_intensive.md`
    - `review_20260925_085413/bundle_p1_security.md`、`bundle_p2_correctness.md`、`bundle_p3_contract.md`、`bundle_p4_perf.md`、`bundle_p5_arch.md`、`bundle_p6_robust.md`、`bundle_p7_testdoc.md`
- 缺失：无（两个目录根级报告全部存在并已读；`_meta/` 未读，符合流程）

## 统计

- 采纳：149 项
- 不采纳：12 项
- 待决定：0 项

## 说明

1. 两个目录的关系：`review_20260925_085413` 是对 `review_20260925_084303` 的复跑与扩面（7 视角 bundle + 交叉证伪），其 bundle 为溯源真相源；084303 的 10 项中 7 项已被 085413 覆盖并复核（映射见文末附录），3 项（public/ 资产、MiMo 图标、DevPanel 轮询）085413 未复现，按原报告保留并纳入本决策。
2. 跨 bundle 同位置项已合并计数：`net-client.ts:126`（p1+p2）、`net-client.ts:41`（p2+p4+p6）、`logger.ts:22-25`（p1+p6）、`grok_bot_oauth_manager.ts:139/218`（p2+p6+ipc）、`ipc timeout_ms`（p2+p6）、`refresh-service.ts:587`（p2+p6）、`preload/index.ts:559`（p1+p3）、muse connector 多项（p1/p3/p5/p6/p7）、`plugin-metadata`（p3+p7）、`web grok_bot logout`（p2+p3+p7）等；合并后不再重复编号。
3. 交叉证伪处理：报告 CHALLENGED 的条目不删除——`stale 无界增长` 证伪（代码按 account+metric 取最新、prune 保一行，语义残留列 A113）；`t507 ondemand` 缺失属归档 spec 有意裁撤（列 R3）；`改测迁就` 已声明但未记决策（列 A87）；`popup 翻转` 收窄为仅 Upcoming 首击（列 A1）；`muse 硬编码` 由 H 降为可用性债（列 D9）；`markdown sanitize`（confidence 60）经代码复核为误报（列 R1）。
4. 当前基线：`pnpm test` 已复现 5 个用例失败（323/325 文件通过，3948 用例中 5 失败，全部位于 popup 两个测试文件），由 A1 修复。
5. 用户已明确：以最干净架构、最好设计为准，不以改动量与成本否决（token 消耗不作约束）。原因「成本高/收益不足/无测量」而不采纳的设计类项已全部转入采纳项（A94-A142）；不采纳项现仅保留误报、归档失效与无证据项（R1-R6）。
6. 用户决策已回填并转块（2026-09-25）：D2/D7/D8/D9/D10/D11/D12 采纳（A143-A149）；D1/D3/D4/D5/D6/D13 不采纳（R7-R12，含对应文档声明动作）；待决定项清零。

## 采纳项

### A1. Popup 卡片展开翻转（Upcoming 卡首击无效）与 5 个失败用例

- 来源：084303/intensive, p7_testdoc, 085413/intensive
- 位置：src/renderer/views/PopupView.tsx:591,780-786；tests/unit/renderer/views/popup_view_height.test.tsx:450,470；tests/unit/renderer/views/popup_view_upcoming.test.tsx:79,234,313
- 优先级：HIGH
- 详细判断理由：Provider 卡默认展开（`?? true`），Upcoming 卡展示默认 `false`，二者共用 `toggle_expand_provider` 中的 `!(expanded_providers[x] ?? true)`；首次点击 Upcoming 卡算得 `false` 并写回，界面无变化。已复现 `pnpm test` 5 用例失败（全库仅此两文件失败），属阻断门禁的真实缺陷。
- 修复说明：Upcoming 卡改用独立 toggle（基于其当前渲染值取反）或让 toggle 接收当前值；Provider 卡默认展开语义保持不变；按修复后语义更新两个测试文件的 Upcoming 断言，不得弱化 Provider 默认展开断言。

### A2. `pnpm check` 缺 `pnpm test`

- 来源：084303/intensive, p7_testdoc, 085413/intensive
- 位置：package.json:36
- 优先级：HIGH
- 详细判断理由：`check` 只跑 typecheck/lint/format/deadcode/arch，而 conventions 要求「合并前跑 check 与 test」；A1 的失败正说明单测漏网路径真实存在。
- 修复说明：`check` 追加 `&& pnpm test`（或提供 `check:full` 并同步 conventions.md 指向），确保本地预检包含单测。

### A3. 单实例锁竞争失败后未中止初始化

- 来源：p2_correctness
- 位置：src/main/index.ts:176
- 优先级：HIGH
- 详细判断理由：`app.requestSingleInstanceLock()` 失败仅 `app.quit()`（异步），后续初始化继续执行，存在双开 SQLite/端口竞争窗口。
- 修复说明：`app.quit()` 后 `return`（或在后续初始化入口统一短路），确保退出路径不再继续启动。

### A4. `with_concurrency` 拒绝路径泄漏与中断剩余任务

- 来源：p2_correctness, p6_robust
- 位置：src/main/core/scheduler/refresh-service.ts:587-601
- 优先级：HIGH
- 详细判断理由：`fn(item).then(...)` 无 catch，`fn` reject 时 executing 不删除且 `Promise.race` 直接 reject，剩余任务失控继续执行；单个失败可掀翻整轮 refreshAll。
- 修复说明：每项包成 `safe = fn(item).catch(report_failed)`；用 `safe.finally(() => executing.delete(safe))` 维护集合；`Promise.race` 只等待 safe；保留 `Promise.allSettled` 收尾。

### A5. grok_bot 同 instance 并发 poll 覆盖 cancel，产生孤儿轮询

- 来源：p2_correctness, p6_robust
- 位置：src/main/core/auth/grok_bot_oauth_manager.ts:139；src/main/ipc/grok_bot_auth_ipc.ts:112,139
- 优先级：HIGH
- 详细判断理由：第二个登录请求直接覆盖 `active_cancels`，前一 poll 无人可取消；IPC 层参数未钳制，timeout 可传 Infinity。两处同因（并发登录未拒绝），合并处理。
- 修复说明：manager 进入时若已有 active cancel 则抛 CONFLICT；finally 仅删除自己写入的 entry；IPC 层 clamp `timeout_ms` 到有限区间（如 10s..600s），非法值返回 INVALID_ARGUMENT；补并发 poll 测试。

### A6. grok_bot refresh 缺去重（与注释矛盾）

- 来源：p2_correctness
- 位置：src/main/core/auth/grok_bot_oauth_manager.ts:218
- 优先级：HIGH
- 详细判断理由：同一 instance 的定时刷新与手动刷新可并发发起；refresh token 轮换下后发请求可能使先发请求刚保存的 token 失效（现有 instance 锁/vault mutex 仅部分缓解）。
- 修复说明：加 `Map<instance_id, Promise>` inflight 去重，复用进行中 Promise，完成/失败后清理；补并发合并测试；评估把 mutation queue/generation/inflight 抽为 grok/kimi/grok_bot 共用并发原语（延续 0726 轮 A24 方向）。

### A7. grok_bot 连接器 401 不触发 `oauth_refresh`

- 来源：p3_contract, 085413/intensive
- 位置：connectors/grok_bot/connector.ts:134
- 优先级：HIGH
- 详细判断理由：请求异常被捕获后走 `report_failed` 而非抛出，refresh-service 的 `oauth_refresh` 分支够不着，401 不即时换票（t507 AC-003 断裂）。
- 修复说明：401/403 直接 `throw` 含会话失效文案的错误码，其他错误保持降级路径；补 401 触发 refresh 的集成测试。

### A8. opencode_go 吞 auth 错误阻断自动重登

- 来源：p2_correctness, p6_robust
- 位置：connectors/opencode_go/connector.ts:140（`go_status` catch 转 null），summary 同类路径
- 优先级：HIGH
- 详细判断理由：401/403 被 `.catch(() => null)` 转空，`is_auth_error` 失明，无法触发重登；根因信息同时全丢。
- 修复说明：401/403 直接抛会话失效错误；其他错误记 warn 带 status/message 后降级；补 401/500 分支测试。

### A9. observation 按 instance 查询与索引错配

- 来源：p4_perf
- 位置：src/main/core/observation/observation-store.ts:266（`list_by_instance_stmt`）；现有索引 `idx_lookup(provider, account_id, metric_id, source_instance_id, observed_at)`
- 优先级：HIGH
- 详细判断理由：查询 `WHERE source_instance_id = ?` + window sort，索引首列 provider 未被约束，无法走范围扫描，退化为全表扫描 + 排序。
- 修复说明：新增 `idx_by_instance(source_instance_id, account_id, metric_id, observed_at)` 并纳入 migration；确认 planner 命中并补查询计划断言测试。

### A10. net-client 50MB 全量 `Buffer.concat`

- 来源：p2_correctness, p4_perf, p6_robust
- 位置：src/main/core/connector/net-client.ts:20,41（`MAX_RESPONSE_BYTES = 50MB`），366,403
- 优先级：HIGH
- 详细判断理由：5 并发即 250MB 常驻堆，且超限前已完整读取；恶意/异常端点可触发内存放大。
- 修复说明：上限降至 5-10MB；读取循环内 early-abort（超限立即 destroy 并抛错）；pool 状态不确定时标记 `reset: true`；补大响应拒绝测试。

### A11. net-client `files.read/list` 软链与 TOCTOU 绕过

- 来源：084303/intensive, p1_security, p2_correctness
- 位置：src/main/core/connector/net-client.ts:520-545（read 仅对叶子 `lstat` 判软链；list 可被顶层软链目录带出）、101（list 无数量上限）
- 优先级：MEDIUM-HIGH
- 详细判断理由：中间目录软链与「校验后替换」TOCTOU 可读沙箱外文件；`list_dir_recursive` 顶层为软链时直接进入目标目录。
- 修复说明：read/list 统一 `realpath(resolved)` 后再 `is_within_allowed`，失败即拒；list 增加数量上限（如 5000）与错误路径上下文；补软链与 TOCTOU 测试。

### A12. PKCE verifier 明文经 renderer/IPC

- 来源：p1_security, p2_correctness（表单生命周期见 A52）
- 位置：src/renderer/components/forms/GrokBotPkceForm.tsx:33-34；src/preload/oauth_api.ts:139-144；src/main/ipc/grok_bot_auth_ipc.ts:93-113；src/main/core/auth/grok_bot_oauth_manager.ts:130+
- 优先级：HIGH
- 详细判断理由：verifier 从 main 返回 renderer，再经 IPC 送回；renderer 侧 XSS 即可劫持登录；verifier 亦曾进入 GET query（p1_security:164）。
- 修复说明：verifier 仅存 main（`Map<login_id, verifier>`），`login_start` 返回 `{uuid, login_id}`，poll/link 只传 `login_id`；manager 内部改用 POST body 携带 verifier；同步更新 preload 类型与单测。

### A13. grok_bot `account_id` 取自未验签 JWT

- 来源：p1_security
- 位置：connectors/grok_bot/connector.ts:40
- 优先级：MEDIUM
- 详细判断理由：未验签 JWT 的 account_id 可被构造，导致账号身份碰撞/错位，影响多账号展示与重登目标。
- 修复说明：改用 `source_instance_id` 或 `sha256(token)` 派生稳定 id；补畸形 JWT 测试（与 A49 配合）。

### A14. `effective_proxy` URL 零校验

- 来源：p1_security
- 位置：src/main/core/network/effective_proxy.ts:3
- 优先级：HIGH
- 详细判断理由：代理 URL 未做协议/格式校验，错误或恶意值可劫持全部出站流量。
- 修复说明：zod 校验仅接受 `http(s)://`（SOCKS 见 D10）；非法值拒绝并记日志；补非法输入测试。

### A15. `will-navigate` 放行 http/https

- 来源：p1_security
- 位置：src/main/window/window-manager.ts:240
- 优先级：HIGH（复核建议降 Medium，纵深防御）
- 详细判断理由：同窗导航到外部 http(s) 可替换应用界面并接触 preload 暴露面；标准做法是外部链接走系统浏览器。
- 修复说明：`will-navigate` 中 `preventDefault()` 后 `shell.openExternal`（仅 http/https 且校验 origin），应用内导航仅放行预期的 dev server/本地路径。

### A16. `openExternal` 缺 allowlist

- 来源：p1_security
- 位置：src/main/window/window-manager.ts:220（`setWindowOpenHandler` 任意 http 外开）；src/main/core/auth/grok_bot_oauth_manager.ts:112（OAuth 页）
- 优先级：LOW-MEDIUM
- 详细判断理由：任意协议/主机可被打开，存在钓鱼与本地协议触发面；收窄到业务域与显式用户动作成本低。
- 修复说明：两处统一走 URL 校验（仅 https、OAuth 域 allowlist 或用户确认），非允许值返回 deny 并提示。

### A17. JSON `__proto__` 原型污染面

- 来源：p1_security
- 位置：src/main/core/local-api/server.ts:251
- 优先级：LOW
- 详细判断理由：JSON 解析后的 `__proto__`/`constructor` 键在后续对象合并路径存在污染风险，防护成本低。
- 修复说明：解析 reviver 过滤危险键，或使用 `Object.create(null)` 承载；补污染输入测试。

### A18. Electron CSP 缺指令

- 来源：p1_security
- 位置：src/main/security/csp.ts:20
- 优先级：LOW
- 详细判断理由：缺 `object-src`/`frame-ancestors`/`base-uri`，纵深防御不完整。
- 修复说明：补 `object-src 'none'; frame-ancestors 'none'; base-uri 'self'`，跑 CSP 单测/快照。

### A19. Web CSP `connect-src` 放行任意 ws

- 来源：p1_security
- 位置：src/main/core/local-api/server.ts:734
- 优先级：LOW
- 详细判断理由：web 面板使用 EventSource（SSE）而非 WebSocket（usageboard-web.ts:263,915），`ws: wss:` 属多余放行。
- 修复说明：收紧为 `connect-src 'self'`；确认 SSE 路径与测试不受影响。

### A20. `verify_cookie` 未检 CRLF/长度

- 来源：p1_security
- 位置：src/main/index.ts:722
- 优先级：LOW
- 详细判断理由：用户输入 Cookie 直接拼接，缺头部注入与体量防护。
- 修复说明：8KB 上限 + 拒绝 `\r\n`，非法返回明确错误；补测试。

### A21. grok_bot OAuth `default_http` 无超时

- 来源：p6_robust
- 位置：src/main/core/auth/grok_bot_oauth_manager.ts:68
- 优先级：HIGH
- 详细判断理由：默认 http 客户端无超时，网络挂起会永久占住登录/刷新流程。
- 修复说明：统一 `AbortSignal.timeout(15000)`（或复用 net-client 装配）；失败按 A26 重试策略处理。

### A22. grok_bot OAuth 内层 catch 过宽（vault 写失败被吞）

- 来源：p6_robust
- 位置：src/main/core/auth/grok_bot_oauth_manager.ts:169
- 优先级：HIGH
- 详细判断理由：vault 保存失败被当作 poll 抖动吞掉，用户看到假成功/继续轮询。
- 修复说明：拆分 try——网络错误走重试，vault 写入失败直接 `throw SAVE_FAILED`；补 vault 失败注入测试。

### A23. grok_bot OAuth 两步 vault 写非原子

- 来源：p6_robust
- 位置：src/main/core/auth/grok_bot_oauth_manager.ts:182
- 优先级：HIGH
- 详细判断理由：refresh 与 access token 分两次写入，第二次失败留下混合状态（新 refresh + 旧 access）。
- 修复说明：先写 refresh、成功后再写 access，失败补偿删除；或引入事务语义；补第二步失败用例。

### A24. `open_external` 失败仅 warn，照常空转 180s

- 来源：p6_robust
- 位置：src/main/core/auth/grok_bot_oauth_manager.ts:120
- 优先级：MEDIUM
- 详细判断理由：浏览器未拉起时用户无感知，仍等待完整轮询超时。
- 修复说明：失败返回 `BROWSER_OPEN_FAILED`，前端提示并终止轮询；补失败路径测试。

### A25. 轮询超时/间隔硬编码、无抖动退避

- 来源：p6_robust
- 位置：src/main/core/auth/grok_bot_oauth_manager.ts:133
- 优先级：MEDIUM
- 详细判断理由：固定间隔对服务端不友好且无法调优；配置化 + jitter 成本低。
- 修复说明：移入常量/config，加 jitter 与上限内指数退避；保证取消路径及时退出。

### A26. `refresh_now` 单次无重试

- 来源：p6_robust
- 位置：src/main/core/auth/grok_bot_oauth_manager.ts:218
- 优先级：MEDIUM
- 详细判断理由：网络抖动/5xx 直接失败，用户需手动重试。
- 修复说明：网络错误/5xx/超时重试 1 次（带退避），401/400 不重试；补重试与不重试用例。

### A27. 服务端 error verbatim 进 UI/日志

- 来源：p6_robust
- 位置：src/main/core/auth/grok_bot_oauth_manager.ts:258
- 优先级：MEDIUM
- 详细判断理由：透传服务端原始错误可能带内部细节/敏感值，UI 展示也不稳定。
- 修复说明：只返回业务错误码与固定文案；日志记 status/bytes；补映射测试。

### A28. IPC `timeout_ms` 无范围校验

- 来源：p2_correctness, p6_robust
- 位置：src/main/ipc/grok_bot_auth_ipc.ts:112
- 优先级：MEDIUM-LOW
- 详细判断理由：`Infinity`/负值可造成无限轮询与 Map 泄漏（独立于 A5 的第二层防护）。
- 修复说明：finite + clamp（10s..600s），非法值返回 `INVALID_ARGUMENT`；补参数边界测试。

### A29. net-client 丢弃错误响应体，诊断黑洞

- 来源：p6_robust
- 位置：src/main/core/connector/net-client.ts:334
- 优先级：MEDIUM
- 详细判断理由：非 2xx 时错误体未记录，排障只能看到状态码。
- 修复说明：记录 500B 脱敏片段或错误码表；不改变对外返回结构。

### A30. probe 空 headers/空推导静默 `return []`

- 来源：p6_robust
- 位置：src/main/core/connector/probe-executor.ts:68
- 优先级：MEDIUM
- 详细判断理由：配置错误表现为「无数据」，掩盖真实原因。
- 修复说明：抛「Probe 无可用 metric」明确错误并计入 failed_accounts；补配置错误用例。

### A31. `insert_batch` 单条失败调用方无感知

- 来源：p6_robust
- 位置：src/main/core/observation/observation-store.ts:227
- 优先级：MEDIUM
- 详细判断理由：批量内失败仅记日志，刷新流程无法区分「部分成功」。
- 修复说明：返回 `{ok, failed}` 计数；保持事务与现有跳过策略。

### A32. `is_connection_error` 子串匹配过宽/过窄

- 来源：p6_robust
- 位置：src/main/core/scheduler/refresh-service.ts:82
- 优先级：MEDIUM
- 详细判断理由：裸子串（如 `tls`）可能误判业务错误为连接错误，且遗漏真实超时文案。
- 修复说明：改精确白名单 + timeout 正则，去裸匹配；补错误分类单测。

### A33. `query_trend` 无上下界

- 来源：p6_robust
- 位置：src/main/core/observation/observation-store.ts:358
- 优先级：MEDIUM
- 详细判断理由：days/cap 无钳制可被放大为 OOM/长查询。
- 修复说明：`days ≤ 365`、`cap ≤ 1000`，非法值拒绝或钳制；补边界测试。

### A34. retention 极小 cacheMaxMb 逐天 prune 阻塞

- 来源：p6_robust
- 位置：src/main/core/observation/observation-retention.ts:41
- 优先级：MEDIUM
- 详细判断理由：负值/极小配置导致循环全表删除阻塞主线程。
- 修复说明：拒绝负值/极小值（设下限）；单次 `DELETE ... LIMIT` 分批执行；补边界测试。

### A35. logging 写失败/清理失败静默吞

- 来源：p6_robust
- 位置：src/main/core/logging.ts:201
- 优先级：MEDIUM
- 详细判断理由：磁盘满/权限问题无任何运维信号，日志静默丢失。
- 修复说明：失败时 `console.warn` + 节流计数，避免递归。

### A36. `exportCurrentLog` 未处理源文件缺失

- 来源：p6_robust
- 位置：src/main/core/logging.ts:63
- 优先级：LOW
- 详细判断理由：ENOENT 直接抛给用户，文案不可读。
- 修复说明：源缺失返回空文件或 `LOG_EMPTY` 明确结果；补测试。

### A37. refresh 失败路径 stale 副本逐条 insert

- 来源：p4_perf, p6_robust
- 位置：src/main/core/scheduler/refresh-service.ts:553
- 优先级：LOW-MEDIUM
- 详细判断理由：全轮失败时逐条 autocommit，存在半写状态与开销放大；已有 `insert_batch` 可复用。
- 修复说明：收集后走 `insert_batch` 单事务；保持 t370 的 try/catch 与 updateState 语义。

### A38. Kimi purge 非原子

- 来源：p6_robust
- 位置：src/main/core/observation/observation-store.ts:106
- 优先级：LOW
- 详细判断理由：崩溃窗口留下 purge 标记与数据不一致。
- 修复说明：包事务或调整为先删后记；补中断场景测试（可选）。

### A39. runtime 顶层 catch 只存 message 丢 stack

- 来源：p6_robust
- 位置：src/main/core/connector/runtime.ts:249
- 优先级：LOW
- 详细判断理由：排障缺调用栈，定位成本高。
- 修复说明：附 stack（scrub 后）写入错误摘要或日志。

### A40. 编译期必败错误仍重试 3 次

- 来源：p6_robust
- 位置：src/main/core/connector/runtime.ts:66
- 优先级：LOW
- 详细判断理由：语法/沙箱拒绝类错误重试无意义，浪费轮次与日志。
- 修复说明：定义 `NonRetryableError`，遇即 break；补重试次数测试。

### A41. Abort 超时识别脆弱、reason 丢失

- 来源：p6_robust
- 位置：src/main/core/connector/runtime.ts:90
- 优先级：LOW
- 详细判断理由：超时与外部 abort 无区分，错误归因不准。
- 修复说明：统一 `TimeoutError` 或透传 cause；补超时用例。

### A42. tier1-poll 对 4xx 同样重试

- 来源：p6_robust
- 位置：src/main/core/connector/tier1-poll-executor.ts:48
- 优先级：LOW
- 详细判断理由：4xx（非 408/429）重试无收益，增加请求量与封禁风险。
- 修复说明：4xx 标记 non-retryable（408/429 除外）；补分类测试。

### A43. refresh 裸 `setTimeout` 不可取消

- 来源：p6_robust
- 位置：src/main/core/scheduler/refresh-service.ts:356
- 优先级：LOW
- 详细判断理由：关机会等待 sleep 结束，拖延退出。
- 修复说明：可取消 sleep（Abort/unref），停止流程中唤醒。

### A44. probe 同类型多头首胜无日志

- 来源：p6_robust
- 位置：src/main/core/connector/probe-executor.ts:78
- 优先级：LOW
- 详细判断理由：重复命中选择不可见，配置错误难发现。
- 修复说明：重复命中记 debug（带头名），不改选择逻辑。

### A45. observation 读行无校验直接 cast

- 来源：p6_robust
- 位置：src/main/core/observation/observation-store.ts:123
- 优先级：LOW
- 详细判断理由：脏行（历史迁移/外部写入）直达 UI 可能崩溃。
- 修复说明：读侧 `safeParse`，坏行跳过并计入告警；补脏行测试。

### A46. Muse 缺失 `percentUsed` 默认 0 画绿

- 来源：p2_correctness, p6_robust
- 位置：connectors/muse/connector.ts:117-118
- 优先级：MEDIUM
- 详细判断理由：字段缺失本应 unknown，兜底 0 会显示健康绿；`reset_at` NaN 同理。
- 修复说明：缺失/非有限值走 `report_failed` 或标 unknown，不用 0 兜底；补缺失字段测试。

### A47. Muse 逐行 JSON 空吞、最终无上下文

- 来源：p4_perf, p6_robust
- 位置：connectors/muse/connector.ts:48-58
- 优先级：MEDIUM
- 详细判断理由：解析失败静默，返回空订阅时无法判断是解析问题还是真无数据。
- 修复说明：记失败行数/首行长度，最终错误附 status/bytes；区分空订阅与解析失败。

### A48. Muse Cookie 拼接无 CRLF 校验

- 来源：p1_security
- 位置：connectors/muse/connector.ts:42
- 优先级：MEDIUM
- 详细判断理由：vault 中的 cookie 值可含换行导致头部注入。
- 修复说明：拼接前拒绝 `\r\n`（或统一走 header 序列化），非法时报错。

### A49. grok_bot `parse_jwt` 空吞，难分脏 token

- 来源：p6_robust
- 位置：connectors/grok_bot/connector.ts:49
- 优先级：LOW
- 详细判断理由：解析失败无日志，无法判断 token 格式问题。
- 修复说明：记长度/段数（不记值）与失败原因；补畸形 JWT 测试。

### A50. grok_bot `generate_checksum` 32 位移位语义

- 来源：p2_correctness
- 位置：connectors/grok_bot/connector.ts:92
- 优先级：LOW
- 详细判断理由：32 位运算溢出后语义偏差，校验值可能与客户端不一致（当前测试断言过弱）。
- 修复说明：改除法取字节或 BigInt；以已知向量锁定（与 A88 配合）。

### A51. grok_bot logout 两处 vault 删除串行残留

- 来源：p2_correctness
- 位置：src/main/core/auth/grok_bot_oauth_manager.ts:269
- 优先级：LOW
- 详细判断理由：第一步失败则第二步不执行，残留可复用的 refresh token。
- 修复说明：`Promise.allSettled` 并行删除并汇总错误；补失败注入测试。

### A52. GrokBotPkceForm 生命周期缺陷（重入/无超时/卸载取消/手动零校验）

- 来源：p2_correctness, p6_robust
- 位置：src/renderer/components/forms/GrokBotPkceForm.tsx:26-34
- 优先级：MEDIUM
- 详细判断理由：无重入守卫可重复发起；卸载不取消留孤儿 poll；手动输入零校验；任一都会造成状态错乱或无效请求。
- 修复说明：加 statusRef 守卫、卸载 cancel、显式 UI 超时、手动输入预校验；补 cancel/重入用例。

### A53. GrokBotPkceForm 取消空吞与空白账号名

- 来源：p6_robust
- 位置：src/renderer/components/forms/GrokBotPkceForm.tsx:52,63
- 优先级：LOW
- 详细判断理由：取消请求失败被吞且界面以为已取消（实际继续跑）；account_name 空白穿透到 vault。
- 修复说明：`handle_cancel` 失败显示错误并保持 authorizing；account_name `trim() || fallback`。

### A54. WebLoginForm 保存失败吞成通用文案

- 来源：p6_robust
- 位置：src/renderer/components/forms/WebLoginForm.tsx:50
- 优先级：LOW
- 详细判断理由：用户无法区分网络/校验/服务端错误。
- 修复说明：透传错误码与文案，并记日志。

### A55. opencode_go `to_number` 非法归 0

- 来源：p6_robust
- 位置：connectors/opencode_go/connector.ts:48
- 优先级：LOW
- 详细判断理由：非法/缺失值显示 0%，掩盖真实采集问题。
- 修复说明：非法返回 null 并跳过该 metric，记日志。

### A56. opencode_go `limit<=0` 记 0% 且被 UI 丢弃

- 来源：p2_correctness
- 位置：connectors/opencode_go/connector.ts:58
- 优先级：MEDIUM
- 详细判断理由：ratio 回退 `limit:0` 使 UI 丢数据，且错误显示 0%。
- 修复说明：缺 limit 返回 null 跳过该 metric；补边界测试。

### A57. opencode_go monthly 用错重置时间

- 来源：p2_correctness
- 位置：connectors/opencode_go/connector.ts:150
- 优先级：MEDIUM
- 详细判断理由：monthly 取 `endsAt` 而非 meter `resetsAt`，5h/week 映射也可疑，展示倒计时可能错。
- 修复说明：week→week、monthly 优先 meter `resetsAt`；补时间字段映射测试。

### A58. `status_for_pct` NaN 返回 normal

- 来源：p2_correctness
- 位置：src/shared/lib/connector-thresholds.ts:9
- 优先级：MEDIUM
- 详细判断理由：NaN 被当作正常态，异常数据静默变健康。
- 修复说明：`!Number.isFinite` 返回 unknown；补 NaN/Infinity 测试。

### A59. 失败占位 `observedAt:0` / `updatedAt:""` 语义混乱

- 来源：p2_correctness
- 位置：src/renderer/lib/provider-usage.ts:320
- 优先级：LOW
- 详细判断理由：epoch 0 与空串会被相对时间/排序误用。
- 修复说明：显式 `now` 或 `null` 语义并让消费方处理；补占位测试。

### A60. `format` 无效输入显示 NaN 时间

- 来源：p2_correctness
- 位置：src/renderer/lib/utils.ts:26
- 优先级：LOW
- 详细判断理由：脏数据直接渲染 NaN，UI 不优雅且掩盖问题。
- 修复说明：`isNaN` 守卫返回 `--`；补单测。

### A61. net-client 超时 `<=0` 自杀 + NaN bytes 文案

- 来源：p2_correctness
- 位置：src/main/core/connector/net-client.ts:227
- 优先级：LOW
- 详细判断理由：0/NaN 超时导致立即失败或错误文案。
- 修复说明：`<=0`/非有限值走默认；错误文案用实际值。

### A62. AddAccountDialog `local_cli` 未扫描可建空实例

- 来源：p2_correctness
- 位置：src/renderer/components/AddAccountDialog.tsx:191
- 优先级：LOW
- 详细判断理由：允许创建不可用实例，用户之后才遇到空数据。
- 修复说明：要求 status/valid 才放行创建；补用例。

### A63. auto-seed `executablePath` 大小写敏感

- 来源：p2_correctness
- 位置：src/main/core/config/auto-seed.ts:48
- 优先级：LOW
- 详细判断理由：Win/macOS 路径大小写差异导致同一可执行文件重复/丢失识别。
- 修复说明：按平台规范化后比较（win/darwin 忽略大小写）；补平台用例。

### A64. web grok_bot logout 谎报成功

- 来源：p2_correctness, p3_contract
- 位置：src/web/usageboard-web.ts:146
- 优先级：MEDIUM
- 详细判断理由：Web 桩返回成功但未执行真实注销，用户以为已退出；interval/SSE 也无释放。
- 修复说明：调用真实接口或抛 `unsupported` 明确失败；返回 dispose 释放订阅；补 web 契约测试。

### A65. web `get_json` 无 timeout

- 来源：p4_perf
- 位置：src/web/usageboard-web.ts:76
- 优先级：MEDIUM
- 详细判断理由：无 Abort 会永久挂起请求，页面状态卡死。
- 修复说明：`AbortSignal.timeout(15000)`；补超时测试。

### A66. web tokenStats 10s 无条件轮询

- 来源：p4_perf
- 位置：src/web/usageboard-web.ts:51
- 优先级：MEDIUM
- 详细判断理由：页面隐藏仍轮询，浪费资源（渲染进程已有 hidden 暂停先例）。
- 修复说明：`visibilitychange` 暂停，后台降为 60s；补测试（可选）。

### A67. Icon 全量 vendor logo 静态 import 进首屏

- 来源：p4_perf
- 位置：src/renderer/components/Icon.tsx:53-72（cpa 229KB、getoneapi 98KB 等）
- 优先级：MEDIUM
- 详细判断理由：首屏打包体积被大图拖累；多数 logo 只在部分 provider 使用。
- 修复说明：改为动态 import（或压缩为 WebP/SVG \<30KB），保持同步渲染降级；验证图标显示。

### A68. MiMo 未走统一资产（内联超长 SVG 与 mimo.svg 重复）

- 来源：084303/intensive
- 位置：src/renderer/components/Icon.tsx:307-309（`VENDOR_MARKS.mimo` 内联）；src/renderer/assets/vendor_logos/mimo.svg 已存在
- 优先级：LOW
- 详细判断理由：与其他 vendor 不一致，内联数百字符 SVG 易漂移且无主题/缓存管理。
- 修复说明：import `mimo.svg` 注册到 `VENDOR_LOGOS.mimo`，删除内联分支；确认渲染一致。

### A69. Icon `console.warn` 未走 logger

- 来源：084303/intensive, p7_testdoc
- 位置：src/renderer/components/Icon.tsx:191
- 优先级：INFO-LOW
- 详细判断理由：conventions 禁止直接 `console.warn`，renderer 应统一 logger（即使仅 DEV 分支）。
- 修复说明：替换为 `createLogger("renderer:icon").warn(...)` 或保持 DEV 但走共享 logger。

### A70. lodash 死依赖零引用

- 来源：p1_security, p4_perf, p5_arch
- 位置：package.json:119（已验证 src/tests/scripts/connectors 无 import）
- 优先级：LOW
- 详细判断理由：零引用依赖扩大安装面与原型污染讨论面（与 knip 门禁失效相关）。
- 修复说明：`pnpm remove lodash`，跑 typecheck/test 确认无隐性引用。

### A71. DevPanel 挂载即 1000ms 无条件 IPC 轮询

- 来源：084303/intensive
- 位置：src/renderer/views/DevPanelView.tsx:94-96
- 优先级：MEDIUM
- 详细判断理由：idle 或窗口隐藏时仍每秒 `getStatus()`，持续唤醒主进程（085413 未复现该项，保留原结论）。
- 修复说明：按 `state.status` 自适应（scanning 1s，其余 10s）；监听 `visibilitychange` 暂停；补用例。

### A72. `build_secret_param_keys` 漏 `oauth_pkce` REFRESH_TOKEN

- 来源：p1_security
- 位置：src/main/core/config/secret_param_keys.ts:21
- 优先级：MEDIUM
- 详细判断理由：漏键导致导出/脱敏/重录流程遗漏该 secret，存在泄漏或误替换。
- 修复说明：通用化 extra_fields 规则覆盖 OAuth 系 secret（含 REFRESH_TOKEN）；补键集合测试。

### A73. proxy-pool 账密明文进日志

- 来源：p1_security
- 位置：src/main/core/network/proxy-pool.ts:24
- 优先级：MEDIUM
- 详细判断理由：代理 URL 含账密时原样落日志。
- 修复说明：记录前脱敏（仅 host/port 或 `***`）；补日志脱敏测试。

### A74. Windows `icacls` 用环境变量 `$USERNAME` 可欺骗

- 来源：p1_security
- 位置：src/main/core/vault/file-vault-backend.ts:43
- 优先级：MEDIUM
- 详细判断理由：环境变量可被覆盖，导致权限授予错误主体。
- 修复说明：改用 `os.userInfo().username`（或 SID）；补权限设置测试（平台条件）。

### A75. `Math.random` 生成 uuid / instance_id

- 来源：p1_security
- 位置：connectors/grok_bot/connector.ts:84；src/renderer/components/AddAccountDialog.tsx:27
- 优先级：LOW
- 详细判断理由：可预测的 request-id/instance-id 有碰撞与伪造面，替换成本低。
- 修复说明：改用 `crypto.randomUUID()`/`getRandomValues`；补格式测试。

### A76. `accountLabel`/tier/org 直渲染无约束

- 来源：p1_security
- 位置：src/renderer/lib/provider-usage.ts:159
- 优先级：MEDIUM
- 详细判断理由：远端字段可能超长/含控制字符，UI 破版或藏字符。
- 修复说明：zod `max(64)` + 去控制字符（或渲染侧 sanitize）；补长字符串用例。

### A77. manifest 与 plugin-metadata 双 schema 分叉

- 来源：p3_contract, p7_testdoc
- 位置：schemas/plugin-metadata.schema.json:175；src/shared/schemas/manifest.ts（生成源）
- 优先级：HIGH
- 详细判断理由：`additionalProperties:false` 与字段集冲突使合法 manifest 通不过另一 schema，双源无 drift 门禁会持续漂移。
- 修复说明：确定单一权威源（zod 生成或 JSON 手写二选一）并收口；补双向 `safeParse` 测试锁定；纳入导出校验（A81）。

### A78. `pluginResultSchema` 死契约零消费

- 来源：p3_contract
- 位置：src/shared/schemas/plugin-output.ts:107
- 优先级：HIGH
- 详细判断理由：输出契约从未经校验，类型与真实输出可能脱节；要么消费要么删除，避免假契约。
- 修复说明：在输出消费边界（connector 输出/runtime 汇入）加 `safeParse`；若确认无任何路径消费则删除 schema 与导出。

### A79. auto-seed 行为变更无 schemaVersion 迁移

- 来源：p3_contract
- 位置：src/main/core/config/auto-seed.ts:59
- 优先级：MEDIUM
- 详细判断理由：存量空实例不清理且 schemaVersion 未 bump，升级后状态不一致。
- 修复说明：bump schemaVersion + 一次性清理存量空实例 + 补 AC/测试。

### A80. `.env.example` 缺 GROK_BOT/MUSE 占位

- 来源：p3_contract
- 位置：config/env/.env.example:1
- 优先级：LOW
- 详细判断理由：示例与现行配置键不同步，误导部署。
- 修复说明：补占位或注明「交互登录，无需环境变量」。

### A81. schema 双源无 drift 门禁

- 来源：p7_testdoc, p3_contract
- 位置：scripts/export-schemas.ts 与 schemas/\*.json
- 优先级：LOW-MEDIUM
- 详细判断理由：`schema:export` 可手改成漂移，CI 无 `--check`。
- 修复说明：增加 `schema:export --check` 门禁（生成后 diff 退出非零）；补 CI/脚本接入；同时统一 probe/observe 术语（以 domain.md 定义为准）。

### A82. dependency-cruiser 边界规则不足

- 来源：p5_arch
- 位置：.dependency-cruiser.cjs:1（仅 4 条）
- 优先级：MEDIUM
- 详细判断理由：connector/web/ipc 越界无规则看护，架构约束靠自觉。
- 修复说明：补 `no-connector-runtime` / `no-web-from-renderer` / `no-ipc-from-localapi` 等规则；跑 `pnpm arch` 确认零违规或白名单存量。

### A83. README 连接器数量三值分裂（16/17/20）

- 来源：p7_testdoc, 085413/intensive
- 位置：README.md:13（16）；docs/blueprint/architecture.md:73（17）；实际 20
- 优先级：MEDIUM
- 详细判断理由：数字与厂商表不同步，误导范围判断。
- 修复说明：统一为当前实际值并补厂商表缺失行；同步 architecture.md。

### A84. handoff 与 specs_index 滞后超 1 月

- 来源：084303/intensive, p7_testdoc
- 位置：docs/handoff.md:3-5（停在 2026-08-16）；docs/specs_index.md（缺 t507/t508/t492/commandcode）
- 优先级：MEDIUM
- 详细判断理由：交接与索引是接手第一入口，滞后会导致状态误判（AGENTS.md 硬要求）。
- 修复说明：旧 handoff 节迁入 `docs/archive/handoff.md`，追加当前 branch/head_commit 与近期 task 状态；specs_index 补齐已归档 spec 行。

### A85. AGENTS.md 目录权责含幽灵目录（vendors/patches）

- 来源：p7_testdoc
- 位置：AGENTS.md:45（`vendors/` `patches/` 实际不存在）
- 优先级：MEDIUM
- 详细判断理由：目录权责表是 agent 行为入口，幽灵项会造成错误假设。
- 修复说明：删除或标注「预留」；同步检查 `todo/` 等其它幽灵引用。

### A86. README 过期 TODO 与魔法数缺来源注释

- 来源：p7_testdoc
- 位置：README.md:110 附近
- 优先级：LOW
- 详细判断理由：过期占位信息误导；魔法数无注释影响维护（Icon console.warn 部分见 A69）。
- 修复说明：清理过期 TODO，补关键数字来源注释。

### A87. t507 测试变更未记 decisions（TDD 残留）

- 来源：p3_contract, p7_testdoc
- 位置：tests/integration/connector/grok_bot_connector.test.ts:67；decisions.md
- 优先级：MEDIUM（复核后由 H95 降为注记）
- 详细判断理由：47f55abd/d86219e0 同步修改了行为与测试预期，属已声明变更，但裁撤理由未进入 decisions，后人无法追溯。
- 修复说明：在 decisions.md 补一条「grok_bot 双指标→单 weekly」的裁撤决策记录（含 task/commit 引用）。

### A88. 测试 proxy 用例超宽正则假通过

- 来源：p7_testdoc
- 位置：tests/integration/scheduler/refresh-service.test.ts:624
- 优先级：MEDIUM
- 详细判断理由：任何错误都能匹配该正则，代理用例失去鉴别力。
- 修复说明：改本地桩断言命中数/具体错误；补失败对照用例。

### A89. opencode 测试 mock 自身阈值，不直达生产

- 来源：p7_testdoc
- 位置：tests/integration/connector/opencode_go_connector.test.ts:27
- 优先级：MEDIUM
- 详细判断理由：mock 复刻阈值使断言无法暴露生产实现漂移。
- 修复说明：统一走 `ctx.status` 真实现，补 75/90 边界用例。

### A90. grok_bot IPC 测试全 mock manager，伪交互

- 来源：p7_testdoc
- 位置：tests/unit/ipc/grok_bot_auth_ipc.test.ts:20
- 优先级：MEDIUM
- 详细判断理由：只验证了输入回显，未覆盖失败映射与 sender 拒绝路径。
- 修复说明：加失败映射、非法参数、sender 拒绝用例。

### A91. popup 测试全 mock + 存在性断言假绿

- 来源：p7_testdoc
- 位置：tests/unit/renderer/views/popup_view_test_utils.ts:69
- 优先级：MEDIUM
- 详细判断理由：仅断言元素存在，未验证交互传参（instanceId）与共存场景。
- 修复说明：补同卡共存、点击携带 instanceId 的真实断言。

### A92. refresh 并发测试只测同实例且断言过弱

- 来源：p7_testdoc
- 位置：tests/integration/scheduler/refresh-service.test.ts:366（`<= 1`）
- 优先级：MEDIUM
- 详细判断理由：不等式断言掩盖「未并发」与「错误并发」两种缺陷。
- 修复说明：同实例断言 `=== 1`、异实例 `=== 2`；补互斥用例。

### A93. connector cooldown 按 manifest 全局拦截，误伤多实例

- 来源：p2_correctness, p4_perf, p6_robust
- 位置：src/main/core/connector/runtime.ts:148
- 优先级：HIGH（复核降 Medium）
- 详细判断理由：超时冷却 key 仅含 manifest.id，多实例共享同一 manifest 时一个实例失败会连带拦截其他实例刷新。
- 修复说明：cooldown key 加入 `source_instance_id`；补多实例冷却隔离测试。

以下为按「最干净架构 / 最好设计」标准，从原不采纳项转入的设计类采纳项（用户明确不以改动量与成本作为否决理由）。

### A94. 上帝文件拆分（index.ts / server.ts / token-stats-store.ts）

- 来源：p5_arch
- 位置：src/main/index.ts（1655 行）；src/main/core/local-api/server.ts（2052 行）；src/main/core/token-stats/token-stats-store.ts（1980 行）
- 优先级：HIGH
- 详细判断理由：三文件各自混合启动编排、路由、存储与 migration 多重职责，是当前架构最大耦合点；成本高但边界清晰可逐步验证，属干净架构的必做项。
- 修复说明：index.ts 拆 bootstrap/cli_entry/config/oauth/session_history/local_api；server.ts 按路由域拆 routes/\*.ts；token-stats-store 拆 records/rollup/dashboard/sessions/migrations。按独立 task 分步提交，每步跑全量测试与 `pnpm arch` 保持行为不变。

### A95. preload sessionHistory 三栈复制与 route 表工厂化

- 来源：p5_arch
- 位置：src/preload/index.ts:200（40 行三栈复制 + 144 行 route 表）
- 优先级：MEDIUM
- 详细判断理由：复制式分权表是能力蔓延的根源（与 D7/A140 同域），数据驱动化后窗口权限差异显式可测。
- 修复说明：抽 `base + withDisabled` 工厂与数据驱动 route 矩阵；为各窗口生成显式能力表并补权限矩阵单测。

### A96. `perform_request` 11 字段参数对象与派生标签

- 来源：p5_arch
- 位置：src/main/core/connector/net-client.ts:268
- 优先级：MEDIUM
- 详细判断理由：数据泥团降低调用可读性，纯日志标签字段冗余。
- 修复说明：参数收敛为对象；`error_log_label`/`request_log_label` 由 method+kind 派生；补调用点测试。

### A97. web bridge 类型混用与 qs 样板

- 来源：p5_arch
- 位置：src/web/usageboard-web.ts:116
- 优先级：MEDIUM
- 详细判断理由：OAuth 类型混用与重复 query string 构造是 Web/Desktop 语义漂移的温床。
- 修复说明：抽 qs helper，`Pick` 收紧类型，Kimi\* 命名对齐；补 web 契约测试。

### A98. `provider-usage.ts` 按职责拆分

- 来源：p5_arch
- 位置：src/renderer/lib/provider-usage.ts:141（766 行、13 导出）
- 优先级：MEDIUM
- 详细判断理由：gateway 语义、可见性、分组、错误与收敛逻辑混在一处，是 renderer 最重模块。
- 修复说明：拆 group/overview/visible/errors/converge 模块，保持导出面兼容或一次性更新调用点；补现有用例回归。

### A99. CPA 阈值工具在 20 个 connector 的副本收口

- 来源：p5_arch
- 位置：connectors/cpa/connector.ts:34 等
- 优先级：MEDIUM
- 详细判断理由：同一函数 20 份副本，任一处漂移都会造成跨连接器行为不一致。
- 修复说明：runtime 注入 `ctx.util`（阈值/百分比工具），批量替换副本；逐连接器跑集成测试。

### A100. AddAccountDialog 表单分支数据驱动化

- 来源：p5_arch
- 位置：src/renderer/components/AddAccountDialog.tsx:157（7 表单扇出 + 双保存路径）
- 优先级：MEDIUM
- 详细判断理由：分支扇出使新增连接器表单成本高且易漏路径。
- 修复说明：FORM_REGISTRY 数据驱动 + 统一保存路径；补各表单渲染与保存用例。

### A101. common-services 单源 provider 注册

- 来源：p5_arch
- 位置：src/renderer/lib/common-services.ts:5（19 provider 手工同步）
- 优先级：MEDIUM
- 详细判断理由：多份手工同步清单是典型漂移源。
- 修复说明：建立 `provider_registry.ts` 单一来源，其余清单引用生成；补一致性测试。

### A102. Grok weekly 判定双份合一

- 来源：p5_arch
- 位置：src/renderer/lib/provider-usage.ts:210
- 优先级：MEDIUM
- 详细判断理由：两份相同判定逻辑，修一处漏一处会造成展示不一致。
- 修复说明：抽 `is_weekly_like` 共用；补边界用例。

### A103. raw headers 归一化双份合一

- 来源：p5_arch
- 位置：src/main/core/connector/net-client.ts:474
- 优先级：MEDIUM
- 详细判断理由：13 行重复逻辑，多值头处理（与 A134 相关）必须单点维护。
- 修复说明：抽 `normalize_raw_headers` 共用；与 A134 同批完成。

### A104. 文件名与目录 snake_case 全量统一

- 来源：p5_arch, 084303/intensive
- 位置：src/renderer/components/ 等 ~30 处及 `dev-panel`/`local-api`/`main-panel` 等目录
- 优先级：MEDIUM
- 详细判断理由：conventions 规定 snake_case，现状 kebab/Pascal/snake 并存；用户要求最干净架构，全量迁移优于长期例外。
- 修复说明：分批 `git mv` 为 snake_case（先 renderer 后 main），每批同步 import、测试与 snapshot；先冻结新文件命名；更新 conventions 移除例外条款。

### A105. `src/main/core` 目录职责整理

- 来源：p5_arch
- 位置：src/main/core/（dev-panel 拼盘、main-panel 混放、根散文件、connectors 同名）
- 优先级：MEDIUM
- 详细判断理由：目录结构是长期导航与依赖约束的基础。
- 修复说明：按 platform/windows、builtin-connectors 等重命名归位；跑 `pnpm arch` 与新规则校验；分批提交。

### A106. `AccountKey` 字符串拼接改对象

- 来源：p5_arch
- 位置：src/renderer/lib/provider-usage.ts:196
- 优先级：MEDIUM
- 详细判断理由：类型级拼接无转义，分隔符冲突属潜在数据错误。
- 修复说明：改对象键 + 单一 `key_string` 序列化；补碰撞用例。

### A107. host-io 投机泛化字段清理

- 来源：p5_arch
- 位置：src/main/core/connector/host-io.ts:46（`post_raw?`、`signal?` 死字段）
- 优先级：MEDIUM
- 详细判断理由：未消费的 optional 字段扩大契约面，易被误用。
- 修复说明：删除死字段；若 signal 有明确需求则实现为真实能力并补测试，不作半成品保留。

### A108. tests 目录镜像结构对齐

- 来源：p5_arch
- 位置：tests/
- 优先级：LOW
- 详细判断理由：测试结构对齐生产模块是长期可维护性基础。
- 修复说明：按 src 拆 components/lib/views/hooks 镜像；`git mv` + 更新 vitest include；保持全量测试通过。

### A109. net-client 安全边界导出内部化

- 来源：p5_arch
- 位置：src/main/core/connector/net-client.ts:126（`build_request_context` 导出面）
- 优先级：LOW
- 详细判断理由：安全边界函数不应出现在模块导出面，测试可通过测试专用入口访问。
- 修复说明：改内部函数 + 导出测试专用 wrapper（或 `__test__` 命名空间）；更新测试 import。

### A110. Icon 三表注册单源重构

- 来源：p5_arch
- 位置：src/renderer/components/Icon.tsx:75（UI_ICONS/VENDOR_LOGOS/VENDOR_MARKS + 手绘例外）
- 优先级：INFO（按干净架构升级为采纳）
- 详细判断理由：三表并存是 A68/A69 修完后的剩余结构债，单源注册可消除查找顺序与手绘特例。
- 修复说明：合并为单一注册表（组件/资产/内联 mark 统一描述），手绘例外作为注册项；补渲染快照。

### A111. 薄包装与中间层清理

- 来源：p3_contract, p5_arch
- 位置：src/main/core/auth/grok_oauth_manager.ts:44；src/preload/oauth_api.ts:62；src/renderer/lib/utils.ts:1
- 优先级：INFO（按干净架构升级为采纳）
- 详细判断理由：无增值的转发层增加阅读与维护成本。
- 修复说明：保留承担配置声明/类型收窄的包装，删除纯转发与重复导出；更新 import 与测试。

### A112. observation 查询列投影

- 来源：p4_perf
- 位置：src/main/core/observation/observation-store.ts:245（5 处 `SELECT *`）
- 优先级：MEDIUM
- 详细判断理由：显式列是存储层契约清晰化的一部分，配合 A9 索引一起收口。
- 修复说明：显式列投影（含 row 映射同步）；补 store 查询测试。

### A113. stale 复制语义对齐（只复制最新成功观测）

- 来源：p2_correctness（复核保留语义问题）
- 位置：src/main/core/scheduler/refresh-service.ts:371
- 优先级：MEDIUM
- 详细判断理由：实现复制的可能是上一轮 stale 副本，与注释「上次成功观测」不符；无界增长虽证伪，但语义应正确。
- 修复说明：仅复制 `stale=0` 的最新观测；更新注释；补连续失败多轮不产生新副本的测试。

### A114. `list_dir_recursive` 并发化与上限

- 来源：p4_perf
- 位置：src/main/core/connector/net-client.ts:101
- 优先级：MEDIUM
- 详细判断理由：串行遍历大目录会长时间占住连接器执行，配合 A11 上限一起做。
- 修复说明：`p-limit` 类并发（如 16）+ 数量上限截断标记；补大目录测试。

### A115. opencode org 查询 memo 与并行预取

- 来源：p4_perf
- 位置：connectors/opencode_go/connector.ts:119（3 RTT 串行）
- 优先级：MEDIUM
- 详细判断理由：每轮 3 次串行 RTT 是连接器延迟主要来源；memo 与并行是干净的数据获取设计。
- 修复说明：org_id memo（TTL 1h）+ 并行预取 + 单请求超时收敛；与 D11 的 org 策略一起定案。

### A116. web trend 后端 bulk 单查询

- 来源：p4_perf
- 位置：src/web/usageboard-web.ts:874
- 优先级：MEDIUM
- 详细判断理由：前端 fan-out 是无界并发的根因，正确的修复在服务端。
- 修复说明：新增 bulk 查询端点（单 SQL/单响应），前端限并发作为过渡；补契约测试。

### A117. ProviderOverview 渲染优化

- 来源：p4_perf
- 位置：src/renderer/components/ProviderOverview.tsx:55
- 优先级：MEDIUM
- 详细判断理由：父级内联回调导致 memo 失效，是明确的渲染设计问题。
- 修复说明：memo + useMemo + useCallback；用渲染计数测试验证 memo 生效。

### A118. PopupView 高度测量架构重设计

- 来源：p4_perf
- 位置：src/renderer/views/PopupView.tsx:917（live + mirror 双调和 + 第三遍测量）
- 优先级：MEDIUM
- 详细判断理由：mirror 双渲染是当前最重的渲染成本，长期应改为更简洁的测量方案。
- 修复说明：评估以 ResizeObserver/单树测量替代 mirror 的可行路径，先在保持行为不变的测试护栏下做轻量化；分步提交。

### A119. `build_params` vault 并行取数

- 来源：p4_perf
- 位置：src/main/core/scheduler/refresh-service.ts:138
- 优先级：LOW
- 详细判断理由：串行 await 可并行化且无顺序依赖。
- 修复说明：`Promise.all` 并行读取；补顺序无关测试。

### A120. provider-usage 热路径查找优化

- 来源：p4_perf
- 位置：src/renderer/lib/provider-usage.ts:117,546
- 优先级：LOW
- 详细判断理由：indexOf 与三遍遍历是明确可消除的低效模式。
- 修复说明：模块级 Map rank；resolve_convergent 单遍 min/max/sum；补等价性测试。

### A121. `use_popup_derived` O(n²) 消除

- 来源：p4_perf
- 位置：src/renderer/hooks/use_popup_derived.ts:78
- 优先级：LOW
- 详细判断理由：排序内 includes/find 属可消除的低效模式。
- 修复说明：Set + Map 建表；补派生结果等价测试。

### A122. runtime observation 校验 fast-path

- 来源：p4_perf
- 位置：src/main/core/connector/runtime.ts:219
- 优先级：LOW
- 详细判断理由：每轮千次 safeParse 可用廉价前置检查减负而不牺牲边界校验。
- 修复说明：先做字段存在/类型快速检查，失败再走完整 zod；补校验语义测试。

### A123. `script-cache` LRU 与 inflight 去重

- 来源：p4_perf
- 位置：src/main/core/connector/script-cache.ts:28
- 优先级：LOW
- 详细判断理由：无上限缓存与可击穿路径属明确的缓存设计缺口。
- 修复说明：LRU(50) + inflight Map + 错误短 TTL；补缓存行为测试。

### A124. Muse RSC 解析流式化

- 来源：p4_perf
- 位置：connectors/muse/connector.ts:48
- 优先级：LOW
- 详细判断理由：全文 split + 逐行 try parse 可随响应增大而放大开销。
- 修复说明：流式扫描 + 2MB 预检；与 D9/A47 同批处理。

### A125. PopupView reduce 复用与 tick 下沉

- 来源：p4_perf
- 位置：src/renderer/views/PopupView.tsx:670,517；src/renderer/hooks/use-now-tick.ts:3
- 优先级：LOW
- 详细判断理由：每渲染 reduce 与 30s 整树 tick 均为可消除的渲染浪费。
- 修复说明：`useMemo` 化 reduce、spinner 单 interval；relative_time 下沉到 Card 级订阅；补渲染计数测试。

### A126. token-stats 显式列与分页

- 来源：p3_contract
- 位置：src/main/core/token-stats/token-stats-store.ts:405（`SELECT *` + 无界查询面）
- 优先级：MEDIUM
- 详细判断理由：无界查询面是 API 契约隐患，显式列 + LIMIT/分页是干净设计。
- 修复说明：显式列投影 + LIMIT/offset 参数 + 单 item 上限文档；同步 IPC/web 契约与测试。

### A127. IPC 错误码判别联合

- 来源：p3_contract
- 位置：src/main/ipc/grok_bot_auth_ipc.ts:27（字符串匹配）
- 优先级：MEDIUM
- 详细判断理由：字符串错误码易漂移、无法穷举。
- 修复说明：定义 `GrokBotErrorCode` 枚举 + 判别联合，贯穿 IPC/preload/UI；补映射测试。

### A128. connector 外部边界 zod 化

- 来源：p3_contract
- 位置：connectors/grok_bot/connector.ts:140 等（`as` 堆叠 + unknown 直转，100+ 处）
- 优先级：MEDIUM
- 详细判断理由：外部 JSON 无边界校验是系统性风险，按最干净设计应全量收口。
- 修复说明：按连接器分批判 zod schema 并 `safeParse`；优先高风险连接器；每批跑集成测试。

### A129. provider 定义单一来源

- 来源：p3_contract
- 位置：connectors/grok_bot/manifest.json:1（开放 regex 与 TS 闭枚举并存）
- 优先级：LOW
- 详细判断理由：双源必然漂移；单一来源（manifest 驱动）更干净。
- 修复说明：确定 manifest 为权威源，TS 类型由其生成或放宽；更新校验与文档。

### A130. 单 item token 上限决策入 blueprint

- 来源：p3_contract
- 位置：src/main/core/connector/net-client.ts:20
- 优先级：INFO（按干净架构升级为采纳）
- 详细判断理由：上限属契约决策，应有记录而非散落常量。
- 修复说明：在 blueprint 记录单 item 字节上限与理由；与 A10 数值调整同步。

### A131. net-client 超时配置化

- 来源：p6_robust
- 位置：src/main/core/connector/net-client.ts:253（默认 15s 硬编码）
- 优先级：MEDIUM
- 详细判断理由：统一默认合理，但 endpoint 级可配置是连接器协议的一部分。
- 修复说明：移入 endpoint/manifest 可覆盖的默认值，保留全局兜底；补覆盖优先级测试。

### A132. refresh 常量集中管理

- 来源：p6_robust
- 位置：src/main/core/scheduler/refresh-service.ts:244（LOCK 5min/尝试 3/1s/2s）
- 优先级：MEDIUM
- 详细判断理由：散落魔法数应收口到常量模块，便于审计。
- 修复说明：集中到 constants/config 模块并加注释；不改变现有数值。

### A133. logging 配额配置化

- 来源：p6_robust
- 位置：src/main/core/logging.ts:14（7 天/50MB/10 段）
- 优先级：LOW
- 详细判断理由：日志配额是运维参数，配置化后无需改码。
- 修复说明：移入用户 config（带默认值）；补配置读取测试。

### A134. `get_raw/post_raw` 多值头保留

- 来源：p6_robust
- 位置：src/main/core/connector/net-client.ts:466（多值头取首）
- 优先级：LOW
- 详细判断理由：取首静默丢 set-cookie 等信息，数组语义更正确。
- 修复说明：保留数组或按协议拼接；更新类型与消费方；与 A103 同批。

### A135. `background_serve` 启动路径核查

- 来源：p2_correctness
- 位置：src/main/index.ts:148
- 优先级：LOW
- 详细判断理由：报告标注「疑」双启动；按干净设计应显式确认父进程终结路径。
- 修复说明：核查父/子进程生命周期，必要时提前 return；补 CLI serve e2e 回归。

### A136. `max_attempts` 扩界可观测

- 来源：p6_robust
- 位置：src/main/core/scheduler/refresh-service.ts:335
- 优先级：LOW
- 详细判断理由：动态扩界是隐式行为，补显式日志与计数后语义自解释。
- 修复说明：固定默认 + `extra_attempt` 显式日志/指标；补日志断言测试。

### A137. force 刷新语义显式化

- 来源：085413/intensive
- 位置：src/main/core/scheduler/refresh-service.ts（force 路径）
- 优先级：LOW
- 详细判断理由：绕锁需以显式参数与注释固化，避免被当成缺陷反复报告。
- 修复说明：提取显式 `force` 入口与注释/文档说明；补并发语义测试。

### A138. 测试覆盖增强（checksum 向量、muse 分支、oauth race、pkce 表单、auto-seed cpa）

- 来源：p7_testdoc
- 位置：tests/integration/connector/grok_bot_connector.test.ts:101；connectors/muse/connector.ts:48；src/main/core/auth/grok_bot_oauth_manager.ts:151；tests/unit/renderer/components/forms/grok_bot_pkce_form.test.tsx:49；tests/unit/main/core/config/auto-seed.test.ts:151
- 优先级：MEDIUM
- 详细判断理由：这些路径涉及安全与并发，缺测试即为回归风险。
- 修复说明：补已知 checksum 向量、muse 截断/空订阅/success:false、oauth poll-reject/cancel/双 await、pkce cancel/重入、auto-seed cpa 组合用例。

### A139. prepared statements 审计

- 来源：p1_security（Info 40，报告自述待复核）
- 位置：src/main/core/local-api/server.ts:1678（trend/sessions 查询）
- 优先级：LOW
- 详细判断理由：报告未完成核验；按干净设计应全量确认参数化而非留疑。
- 修复说明：审计 local-api 全部 SQL，确认 `prepare + ?` 绑定；如发现拼接立即改为参数化并补注入测试。

### A140. popup `config.save` 字段白名单

- 来源：p1_security
- 位置：src/preload/index.ts:724
- 优先级：HIGH
- 详细判断理由：popup 依赖 `config.save` 持久化 UI 状态，但不能持有全量非密钥配置写权限；白名单是既满足功能又最小权限的干净设计（此前 t140 被 drop，本轮按最干净架构重开）。
- 修复说明：preload popup 分支包装 `save`，仅放行 providerOrder/accountOrders/collapsedAccounts/expandedProviders/accountOverrides（以实际 UI 字段为准），其余字段覆盖为现值；补单测断言白名单外字段不可写。

### A141. 覆盖率阈值重基线并逐步收紧

- 来源：p7_testdoc
- 位置：vitest.config.mts:66（15/25）
- 优先级：MEDIUM
- 详细判断理由：以最干净架构为目标，覆盖率门禁应反映真实基线并朝目标收紧，而非形式阈值。
- 修复说明：先按当前实际覆盖率重基线（分目录阈值），再以 ratchet 方式逐步提高至 ≥60；补门槛文档与 CI 说明。

### A142. 全局测试超时收紧

- 来源：p7_testdoc
- 位置：vitest.config.mts:16（60s）
- 优先级：MEDIUM
- 详细判断理由：60s 全局超时掩盖挂起，收紧后挂起可快速暴露。
- 修复说明：默认 10-15s，长用例单独声明超时；跑全量测试消除 flaky。

### A143. 连接器隔离运行时迁移（isolated-vm/utilityProcess + SHA-256 清单）

- 来源：p1_security, 085413/intensive（原 D2，用户决策 B）
- 位置：src/main/core/connector/manifest-loader.ts:55；src/main/core/connector/runtime.ts:198；electron-builder extraResources 释放路径
- 优先级：CRITICAL
- 详细判断理由：用户选择目标态 B：以真隔离运行时替代 `node:vm`，并为内置连接器建立 SHA-256 清单，根治「用户目录 = 主进程 RCE」；接受必要的工程量与性能验证成本。
- 修复说明：立独立 task 评估 isolated-vm（性能/ABI/跨平台）或 utilityProcess 方案，连接器在隔离进程执行、经 IPC 回传观测；内置连接器生成并校验 SHA-256 清单；分步落地：先默认禁用 user 目录连接器并显式信任（过渡），再完成隔离迁移；补逃逸/性能/兼容测试。

### A144. preload 路由分权：按窗口拆 readonly/settings 两档

- 来源：p1_security, p3_contract（原 D7，用户决策 A）
- 位置：src/preload/index.ts:559
- 优先级：HIGH
- 详细判断理由：用户选择 A：为低权窗口（popup/tray/session）注入最小能力集，与既有 config 分权模型一致。
- 修复说明：拆 readonly/settings 能力档，按窗口类型生成 route 表（与 A95 数据驱动化合并实现）；grok_bot 高阶方法仅 settings 可用；补路由矩阵单测断言 popup/tray 不可达。

### A145. 调度器下限与退避：30-60s + 指数退避 + jitter

- 来源：p4_perf（原 D8，用户决策 A）
- 位置：src/main/core/scheduler/connector-scheduler.ts:32；src/shared/constants.ts:2
- 优先级：HIGH
- 详细判断理由：用户选择 A：默认调度参数本身应安全，避免 5s 下限带来的每分钟 12x 请求与失败风暴。
- 修复说明：`MIN_REFRESH_INTERVAL_SECONDS` 提至 30-60s；连续失败指数退避（带上限）+ jitter，成功即复位；补调度时序与退出取消测试。

### A146. Muse 动态解析 Server Action/Deployment ID（无回退硬编码）

- 来源：084303/intensive, p1_security, p3_contract, p5_arch, p7_testdoc（原 D9，用户决策 A，注明不需要回退）
- 位置：connectors/muse/connector.ts:37-38
- 优先级：HIGH
- 详细判断理由：用户选择 A 且明确不需要回退：请求前动态获取页面并提取 ID，失败抛 `MUSE_ACTION_STALE`；不保留硬编码回退分支，保持实现单一事实源。
- 修复说明：实现页面/HTML 拉取与 ID 提取（含缓存与失效重取）；失败抛明确错误码；删除 `ACTION_ID`/`DEPLOYMENT_ID` 常量与回退；补契约单测（含页面变更场景）；与 A124 流式解析同批。

### A147. 系统代理：默认采纳 + 设置可关闭；补齐 SOCKS5

- 来源：p1_security, p2_correctness（原 D10，用户决策：默认采用系统代理，设置里可以关闭）
- 位置：src/main/index.ts:340
- 优先级：MEDIUM
- 详细判断理由：用户选择保留默认采纳系统代理（含 PAC/WPAD 语义），但要求设置项可关闭；SOCKS 静默丢弃为独立缺陷，一并补齐。
- 修复说明：保留默认采纳，新增设置开关（关闭后忽略系统代理，走直连或用户自定义代理）+ UI 展示当前生效代理；解析支持 `ALL_PROXY`/SOCKS 并转 `socks5://` 交给 undici；补开关与 SOCKS 解析测试。

### A148. opencode_go 全 org 采集（并发控制 + org 维度 account_id）

- 来源：p1_security, p6_robust（原 D11，用户决策 A）
- 位置：connectors/opencode_go/connector.ts:129
- 优先级：MEDIUM
- 详细判断理由：用户选择 A：多组织账号不再静默丢数据，org 作为 account 维度进入数据模型。
- 修复说明：循环全部 org 采集并合并；account_id 含 org_id（或用 account_label 区分）；并发上限 + 失败隔离（单 org 失败不影响其他）；与 A115 memo/并行、A56/A57 数值修复同批；补多 org 集成测试。

### A149. grok_bot 后台定时刷新与 token 轮换处理

- 来源：p7_testdoc, 085413/intensive（原 D12，用户决策 A）
- 位置：docs/blueprint/conventions.md:139；connectors/grok_bot/connector.ts:134；src/main/core/auth/grok_bot_oauth_manager.ts
- 优先级：HIGH
- 详细判断理由：用户选择 A：实现规范承诺的自动刷新（timer/reconcile/rotation），由 manager 统一管理 token 生命周期，而非删文档降级。
- 修复说明：独立 task + spec：manager 内定时刷新（间隔可配、失败退避）+ refresh token 轮换处理（宽限/重登引导）+ 与 401 即时刷新（A7）协同；conventions.md 保持承诺并补实现细节；补轮换与并发测试（与 A6/A26 同域）。

## 不采纳项

### R1. session-shell markdown 疑无 sanitize（复核为误报）

- 来源：p1_security（confidence 60）
- 位置：src/renderer/components/workspace/MarkdownMessage.tsx:1-3
- 优先级：HIGH（原报告）
- 详细判断理由：代码只用 `react-markdown + remark-gfm`，未启用 `rehype-raw`，原始 HTML 默认被转义；URL 亦走 `defaultUrlTransform` 白名单。无 sanitize 属默认安全而非缺口，误报（不引入多余依赖）。

### R2. Icon `dangerouslySetInnerHTML` 渲染 SVG

- 来源：p1_security
- 位置：src/renderer/components/Icon.tsx:361
- 优先级：LOW（原报告）
- 详细判断理由：HTML 来源仅为仓库内硬编码常量，外部 name 只用于字典查找，无用户输入进入 HTML 的路径（与 0726 轮结论一致）；结构清理由 A110 统一处理，无需单独改造。

### R3. t507 spec 承诺 ondemand 双指标缺失

- 来源：p3_contract（CHALLENGED）
- 位置：docs/archive/tasks/t507_grok_bot_usage_connector/spec.md:15
- 优先级：HIGH（原报告）
- 详细判断理由：47f55abd 有意裁撤 ondemand，现行 specs_index 无该行、归档 spec 不再 enforcing；无运行时影响，不按运行时 High 处理（决策记录见 A87）。

### R4. t507 AC 全自动测试声明缺 `[deploy]` 标注

- 来源：p7_testdoc
- 位置：docs/archive/tasks/t507_grok_bot_usage_connector/spec.md:53
- 优先级：MEDIUM
- 详细判断理由：归档 spec 已不再驱动验收，修正无实际消费者；后续新 spec 按现行 conventions 执行即可。

### R5. 084303 目录 10 项零闭环

- 来源：p7_testdoc
- 位置：docs/reviews/review_20260925_084303/review_intensive.md:1
- 优先级：LOW
- 详细判断理由：本轮已把 084303 全部 10 项并入本决策文档（映射见附录），闭环动作即本流程本身，无需额外代码改动。

### R6. auto-seed 抖动

- 来源：085413/intensive（Low 枚举）
- 位置：src/main/core/config/auto-seed.ts
- 优先级：LOW
- 详细判断理由：仅摘要级描述，bundle 无对应证据；A63/A79 已覆盖可验证项，不按未证实现象改动。

### R7. LocalAPI 绑 0.0.0.0 且写端点免认证（用户决策 C：维持现状 + 文档声明）

- 来源：p1_security, 085413/intensive（原 D1，用户决策 C）
- 位置：src/main/core/local-api/server.ts:1987,1283,1703-1771,1861-1874
- 优先级：CRITICAL（原报告）
- 详细判断理由：用户决策维持现状（可信 LAN 面板的既有产品决策，与 web-panel.md/t054 一致），接受 LAN 威胁模型；不改绑定与免认证行为。落地动作仅为文档对齐：核对 README.md:74、architecture.md 与 web-panel.md 的信任前提、免认证端点清单与风险接受说明一致。

### R8. Vault 主密钥明文落盘（用户决策 B：维持现状 + 文档声明）

- 来源：p1_security（原 D3，用户决策 B）
- 位置：src/main/core/vault/file-vault-backend.ts:66
- 优先级：HIGH（原报告）
- 详细判断理由：用户决策维持现状，接受「同机同用户进程可读取」的威胁模型；落地动作仅为文档声明：密钥文件与密文同目录、安全依赖文件权限（`chmod 600`/`icacls`），不引入 safeStorage 迁移。

### R9. SSRF 防护不足（用户决策 C：维持现状）

- 来源：p1_security, p2_correctness（原 D4，用户决策 C）
- 位置：src/main/core/connector/net-client.ts:126
- 优先级：HIGH（原报告）
- 详细判断理由：用户决策维持现有黑名单与私有段放行（本地/自托管场景优先），接受残余风险；如未来 LAN 面板或 endpoint override 策略变化，应重开本项。

### R10. `enableCookieEncryption:false`（用户决策 B：维持 false + 文档声明）

- 来源：p1_security（原 D5，用户决策 B）
- 位置：electron-builder.yml:38
- 优先级：HIGH（原报告）
- 详细判断理由：用户决策维持明文 Cookie（避免 keyring 平台差异与登录保持回归风险）；落地动作仅为文档声明会话 Cookie 的落盘形态与信任前提。

### R11. 配置导入可重定向端点并带走 vault secret（用户决策 C：维持现状）

- 来源：p1_security, 085413/intensive（原 D6，用户决策 C）
- 位置：docs/blueprint/architecture.md:272；`CONFIG_IMPORT` → `endpointOverrides` → `apply_auth` 链路
- 优先级：HIGH（原报告）
- 详细判断理由：用户决策维持现状（依赖已接受的网络与信任模型）；不引入 secret 重录或 diff 预览流程。若后续 R7/R9 策略调整，应同步重评本项。

### R12. `public/` 中文压缩包 + frontend_demo（用户决策 C：维持现状）

- 来源：084303/intensive（原 D13，用户决策 C）
- 位置：public/Kimi_Agent_多会话历史工具.zip、public/Kimi_Agent_多会话查看器.zip、public/frontend_demo/
- 优先级：LOW（原报告）
- 详细判断理由：用户决策维持现状（文件用途为分发/演示资产），接受跨平台打包与目录职责风险；若后续出现 checkout/打包问题再迁移。

## 附录：084303（10 项）映射

|084303 条目|主文档对应|
|---|---|
|1. PopupView 翻转 Bug + 5 测试失败|A1|
|2. Muse 硬编码 Action/Deployment ID|D9（+ A46/A47/A48）|
|3. net-client 本地文件软链逃逸|A11|
|4.`pnpm check` 缺 `pnpm test`|A2|
|5. handoff/specs_index 滞后|A84|
|6. DevPanel 1000ms 无条件轮询|A71|
|7. 目录/文件名 kebab 与 snake 割裂|A104（按最干净架构全量迁移）|
|8.`public/` 中文压缩包 + frontend_demo|D13|
|9. MiMo 图标未走统一资产|A68|
|10. Icon 直接`console.warn`|A69|

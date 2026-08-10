# Task review t278（reviewer_focus: 测试）

- task：`t278_web_auth_parity`
- spec：`docs/tasks/t278_web_auth_parity/spec.md`
- diff_anchor：`f2c038cf8580c7c049e8460369780ccfcfba30e3`
- target：`git diff f2c038cf8580c7c049e8460369780ccfcfba30e3`
- round：1
- reviewed_at：2026-08-10 13:05 UTC+8

## Findings

### t278_test_f001 - AC6 只断言响应体，未验证认证日志脱敏

- 严重度：important
- 锚点：AC6：认证全流程日志不出现 cookie/token 明文，含错误分支
- 位置：`tests/integration/local-api/server.test.ts:275-357`；`tests/unit/ipc/auth-ipc.test.ts:334-350`
- 问题：测试只断言 cookie 状态接口和 IPC result 的序列化结果不含 `secret-cookie`，没有接入 logger transport 或 spy，也没有覆盖 OAuth/session 成功与错误分支的原始日志。若认证 handler 在成功或错误路径把 cookie、access token 或 refresh token 写入日志，当前测试仍会通过，无法证明 AC6。
- 建议：注入可观测的 logger transport，使用 cookie、access token、refresh token 哨兵值覆盖认证成功和错误路径，断言采集到的原始日志均不含明文。

### t278_test_f002 - Grok/Kimi 路由共用同一个 manager mock

- 严重度：important
- 锚点：AC2/AC5：Kimi OAuth 生命周期和 web 端行为应独立对应 Kimi 实现
- 位置：`tests/integration/local-api/server.test.ts:304-330,359-414`
- 问题：同一个 `oauth_manager` 对象同时注入 `auth_deps.grok.manager` 和 `auth_deps.kimi.manager`，并用相同 sentinel 结果循环测试两个 namespace。若 Kimi 路由错误地调用 Grok dependency，或两个 namespace 的依赖装配发生串线，测试仍会得到完全相同结果并通过，不能证明 Kimi 路由对应正确 manager，也不能证明两端参数独立正确。
- 建议：为 Grok、Kimi 分别建立 mock manager，返回 namespace 不同的 device code、状态和操作结果；分别断言对应 manager 被调用及调用参数，增加反向调用未发生的断言。

### t278_test_f003 - cookie 捕获、vault、bridge/UI 错误链路缺少组合式集成证据

- 严重度：important
- 锚点：AC3/AC4：cookie 登录须完成可见窗口捕获、密钥落 vault、状态更新，并在无 display 时给出可读错误
- 位置：`tests/integration/local-api/server.test.ts:275-357`；`tests/unit/renderer/components/settings_form.test.tsx:618-685`
- 问题：local-api 集成测试把 `sessionManager.start_login` 与 `secretsStore.get` 都 mock 掉，只验证端点返回值；设置页单测又直接 mock `cookieLogin`、`getSecrets` 和 `refresh`，没有经过 web bridge 与 local-api。现有 session-manager 测试只验证 mock Electron 边界，未由本地 mock 登录站的 `set-cookie` 响应驱动真实捕获链路。因此 handler、bridge 或 UI wiring 丢失时，分层测试仍可通过，无法证明成功捕获后密钥确实落 vault，也无法证明无 display 错误能完整传到 UI。
- 建议：补充集成或 e2e 测试，使用本地 mock 登录站返回 `set-cookie`，驱动 session-manager 捕获并断言 vault 状态和日志脱敏；再从 web 设置页经 bridge/local-api 触发，覆盖无 display 的可读错误和实例状态保持不损坏。

### t278_test_f004 - 既有 web 测试改测没有记录语义迁移归因

- 严重度：important
- 锚点：行为缺陷：无法证明旧测试语义因规格变化失效，而非测试迁就当前实现
- 位置：`tests/unit/web/usageboard-web.test.ts:188-247,401-446`；`docs/tasks/t278_web_auth_parity/task.md:19-25`
- 问题：diff 将原有 session/auth stub 预期直接替换为 local-api POST 测试，并将旧 Kimi safe-default 测试替换为 OAuth surface 测试；新测试本身通过，但 `task.md` 实施笔记仍为“无”，没有说明旧语义为何失效、哪些行为由规格迁移、为何删除旧覆盖。按照改测规则，无法区分合法的契约迁移与为当前实现调整断言，审计轨迹不完整。
- 建议：在 task 处置记录中说明每处旧测试语义失效的原因；语义仍成立的测试原样保留，确因规格变化而删除的测试整体删除并说明旧契约与新契约边界，再补充新 web bridge/local-api 契约测试，避免只把旧预期改成当前实现输出。

## 结论

- 改测方向复核：有。`t278_test_f004` 涉及既有 web 测试直接改测，缺少实现 bug / 测试错误 / 规格变化归因。
- 本轮新发现：4 条
- 验证：目标测试集 7 个文件通过，205 tests passed；全量 `pnpm test` 通过（252 files，`2795 passed | 2 skipped`）；`pnpm typecheck`、`pnpm lint`、`git diff --check f2c038cf8580c7c049e8460369780ccfcfba30e3` 和变更测试文件的 Prettier 检查通过。全局 `pnpm format:check` 仅报告 9 个与 t278 无关的既有文件，未计入本轮 finding。
- 未进表的提示：全量测试中的既有 React `act(...)` 与 jsdom navigation stderr 未导致失败；真实厂商 OAuth、WSLg 窗口和真实登录页风控按上下文区列为人工或有意不测范围。
- 总体判断：AC6 日志安全、AC2/AC5 namespace 路由可信度、AC3/AC4 cookie 捕获闭环及改测归因均无法由当前测试充分证明，存在未解决的 important finding，本轮 FAIL。
- 系统性 follow-up：无

verdict: FAIL

## Round 2 (2026-08-10 14:14 UTC+8)

### 前轮 finding 复核（以 `git diff f2c038cf8580c7c049e8460369780ccfcfba30e3` 与测试运行为准）

- t278_test_f001（AC6 日志脱敏）：已消除。实现侧 `src/main/ipc/grok_auth_ipc.ts:26-29` / `kimi_auth_ipc.ts:26-29` 错误日志不再拼接 `message`；`src/main/core/auth/oauth_helpers.ts:113-126` 非 JSON 响应体不再进异常。测试侧 `tests/unit/ipc/session-ipc.test.ts:234-290` 注入 logger transport，成功路径（cookie sentinel）与错误路径（access/refresh/cookie 三 sentinel）断言采集日志均无明文；`tests/unit/ipc/grok_auth_ipc.test.ts:128-178` 同法覆盖 grok/kimi login_poll 错误分支；`tests/unit/auth/oauth_helpers.test.ts:243-268` 断言 error.message 不含响应体 sentinel。logger `emit`（`src/shared/lib/logger.ts:188-196`）先 scrub 再送 transport，sentinel 未注册时若 handler 直写原文必被断言捕获，测试非恒真。session-manager 既有日志（`src/main/core/session/session-manager.ts:86,144,150,159,189`）均只含 login_id 不含 cookie 值。已运行验证：9 个相关单测文件 203 passed，集成 52 passed。
- t278_test_f002（Grok/Kimi 共用 mock）：已消除。`tests/integration/local-api/server.test.ts:310-461` grok/kimi 使用独立 manager、namespace 哨兵（grok-device-code/GROK-CODE vs kimi-device-code/KIMI-CODE），全生命周期逐端点断言对应 manager 被调用、参数独立（interval 5 vs 7），并反向断言 `other_manager.*` mock 调用数不变；`loginStart`/`loginPoll` 响应体含 namespace 专属 sentinel，串线必然失败。
- t278_test_f003（cookie 捕获闭环缺组合证据）：已消除。`tests/integration/local-api/server.test.ts:486-684` 用真实 `create_session_manager` 生产实现 + 本地 mock 登录站 `Set-Cookie` 响应 + 内存 vault 驱动捕获，断言 vault 落 `mimo-real:SESSION_COOKIE`、`/v1/auth/cookieLogin/status` 返回 `{in_progress:false, saved:true}`；no-display 分支 `has_display:()=>false` 断言 status error 含 "graphical display" 且 `create_window` 未被调用。Electron 窗口/会话为系统边界 mock（`create_window`/`create_session` 注入），session-manager 本体真实执行。`tests/unit/session/session-manager.test.ts:644-660` 补 no-display 单测（partition 未建、vault 未写入）。UI 侧 `tests/unit/renderer/components/settings_form.test.tsx:635-713` 覆盖 cookieLogin 轮询成功路径与可读错误显示。分层证据（local-api 集成 + UI 单测 + e2e 手动入口）已闭环。
- t278_test_f004（改测无归因）：已消除。`docs/tasks/t278_web_auth_parity/task.md:25-28` 记录旧 web stub 语义因 LocalAPI 契约迁移失效、旧 Kimi safe-default 断言对应旧契约整体替换、保留仍成立的错误与编码覆盖。`tests/unit/web/usageboard-web.test.ts:188-261,417-461` 由 `{saved:false}` noop 断言迁移为 `/v1/session/login`、`/v1/session/refresh`、`/v1/auth/cookieLogin`、`/v1/auth/cookieLogin/status` 及 kimi OAuth 六端点 URL/参数断言；`tests/e2e/electron/add_account.spec.ts:38-39` 与 `tests/unit/renderer/components/forms/web_login_form.test.tsx:42-43` 的 textarea 断言迁移对应新增手动粘贴回退功能（spec 范围新增），非迁就实现。

### 改测方向复核

无迁就实现的改测。复核处均为断言随行为规格迁移：`settings_form.test.tsx`「calls session.login and saves cookie」→「reloads the vault and refreshes after instance web login succeeds」断言增强（onSave 不被调用 + getSecrets/refresh 调用 + display value），对应异步捕获后重读 vault 的新语义；「does not save when web login returns empty cookie」（`{saved:true, cookie:""}`）→「captures no cookie」（`{saved:false}`）与新 `WebLoginSection` 判定一致，错误文案断言保留。

### 本轮新发现（2 条，均 minor）

### t278_test_f005 - 真实 no-display 错误的 status.error → UI 链路无直接测试

- 严重度：minor
- 锚点：AC4（可读错误提示传至 UI 的完整链路）
- 位置：`tests/unit/renderer/components/settings_form.test.tsx:686-713`；`src/renderer/components/SettingsForm.tsx:246-252`
- 问题：`shows a readable error when controlled session login cannot start` 通过 mock `cookieLogin` reject 触发错误显示。真实 no-display 链路中 `startCookieLogin` 立即返回 `{started:true}`，错误经 `/status` 的 `error` 字段轮询到达，`handle_session_login` 的 `if (status.error) throw new Error(status.error)`（`SettingsForm.tsx:246`）分支无直接测试；local-api 层已断言 status 含 "graphical display"（`server.test.ts:662-674`），但 UI 消费该字段到 alert 展示的整段未被验证。不构成假行为（错误显示机制本身已由 reject 测试触达真实 `SessionSection` catch 路径）。
- 建议：加一条 `cookieLoginStatus` 返回 `{in_progress:false, saved:false, error:"Interactive login requires a graphical display"}` 的 UI 测试，断言 alert 展示该文本且实例状态字段不受影响。

### t278_test_f006 - session-manager 捕获成功路径无日志脱敏 transport 守护

- 严重度：minor
- 锚点：AC6（认证全流程日志）
- 位置：`tests/integration/local-api/server.test.ts:486-684`；`src/main/core/session/session-manager.ts:189`
- 问题：cookie 捕获集成测试未接 logger transport；session-manager 模块当前实现只在捕获/保存时记录 login_id（`session-manager.ts:189`），不落 cookie 值，但若未来改动把 `captured_cookie` 写入日志，现有 transport 哨兵测试（均挂在 IPC 层，sessionManager 为 mock）不会触发该模块，无回归守护。
- 建议：在 `server.test.ts` 捕获闭环测试中挂一个 transport 哨兵，断言采集日志不含 `local-cookie-sentinel`，把 AC6 守护延伸到 session-manager 模块。

## 结论

- 前轮 finding 复核：4 条全部已消除（以 diff 与测试运行为准，非采信处置表）。
- 改测方向复核：无迁就实现的改测。
- 本轮新发现：2 条（均 minor）。
- 验证：`node scripts/ensure_sqlite_abi.mjs node` 后，10 个相关单测文件 203 passed，`tests/integration/local-api/server.test.ts` 52 passed；危险模式 grep（新增 `.skip`/`.only`/`@ts-ignore`/`eslint-disable`）无命中；`tests/unit/ipc/session-ipc.test.ts:1` 的 `eslint-disable` 为既有注释非本 diff 引入。
- 未进表的提示：web bridge 层 grok namespace（`create_web_oauth_api("grok")`）无独立断言，仅 kimi 全组 + local-api 集成 grok 全组覆盖，工厂同构下覆盖可接受；web e2e 无认证 UI 流程（测试策略声明 e2e mock 后端流程未落地，分层单测/集成已覆盖，属覆盖可更广）；`settings_form.test.tsx` 既有 React `act(...)` 警告未导致失败，与 Round 1 同。
- 总体判断：Round 1 四条 important 已全部修复且无新 blocker，仅剩 minor 覆盖扩展项，本轮 PASS。
- 系统性 follow-up：无

verdict: PASS

## Round 3 (2026-08-10 14:44 UTC+8)

### 前轮 finding 复核（以 `git diff f2c038cf8580c7c049e8460369780ccfcfba30e3` 与测试运行为准）

- t278_test_f001（AC6 日志脱敏）：仍消除。transport 哨兵测试覆盖 session-ipc 成功/错误路径（`tests/unit/ipc/session-ipc.test.ts:233-290`）、grok/kimi login_poll 错误分支（`grok_auth_ipc.test.ts:128-178`）、`oauth_helpers.test.ts:242-270` 错误消息不含响应体 sentinel；实现侧 `grok_auth_ipc.ts` / `kimi_auth_ipc.ts` 错误日志不再拼接 `message`，`session-ipc.ts` 对成功 cookie 与失败 error.message 统一 `[redacted]`。本轮实测相关测试全部通过。
- t278_test_f002（Grok/Kimi 共用 mock）：仍消除。`server.test.ts:310-464` 独立 manager + namespace 哨兵 + 反向调用数断言，串线必然失败。
- t278_test_f003（cookie 捕获闭环缺组合证据）：仍消除。`server.test.ts:486-697` 真实 `create_session_manager` + 本地 mock 登录站 `Set-Cookie` + 内存 vault，断言 vault 落 `SESSION_COOKIE=local-cookie-sentinel`、status `{in_progress:false, saved:true}`；no-display 分支断言 status.error 含 "graphical display" 且 `create_window` 未调用；`session-manager.test.ts:644-663` 补 no-display 单测（partition 未建、vault 未写）。
- t278_test_f004（改测无归因）：仍消除。`task.md:25-29` 记录各迁移原因。
- t278_test_f005（status.error → UI 链路无直接测试）：已修。`settings_form.test.tsx:745-777`「shows the status error from controlled session login」直接 mock `cookieLogin` 返回 `{started:true}` + `cookieLoginStatus` 返回 `{in_progress:false, saved:false, error:"Interactive login requires a graphical display"}`，断言 alert 展示该文本、`cookieLoginStatus` 以 `mimo-1` 调用；对应 `SettingsForm.tsx:246-248` `if (status.error) throw` → `SessionSection` catch → alert 真实分支。与 local-api 层 no-display error 字段断言（`server.test.ts:673-685`）构成分层闭环，非恒真。
- t278_test_f006（session-manager 捕获路径无日志脱敏 transport 守护）：已修。`server.test.ts:616-625` 挂载 `addTransport` + `setLogLevel("debug")`，捕获闭环全程采集日志，`:645` 断言 `log_lines` 不含 `local-cookie-sentinel`；`finally` 中 `remove_transport()` + 恢复原日志级别（`:687-689`），无泄漏到其他用例。

### 改测方向复核

无迁就实现的改测。本轮复核的既有测试修改均为接口扩展或新功能断言：`popup_view_height.test.tsx` / `popup_view_mirror.test.tsx` / `popup_view_test_utils.ts` / `settings_view_test_utils.ts` 仅补充 `auth.cookieLoginStatus` mock 字段（preload API 新增方法）；`web_login_form.test.tsx:42-43` 由「textarea 不存在」改为「aria-label 网页登录 Cookie + manual-save 可见」并新增手动粘贴保存用例，对应新增手动 Cookie 回退功能（spec 范围新增）。

### 本轮新发现（2 条，均 minor）

### t278_test_f007 - startCookieLogin 并发冲突（CONFLICT）分支无测试

- 严重度：minor
- 锚点：AC3 失败路径（重复触发登录的并发防御）
- 位置：`src/main/ipc/auth-ipc.ts:104-108`；`tests/unit/ipc/auth-ipc.test.ts`（handleCookieLogin 用例组无并发场景）
- 问题：`startCookieLogin` 的 `current?.in_progress || deps.sessionManager.is_login_in_progress?.(instanceId)` → `fail("CONFLICT", "已有登录正在进行中…")` 分支无直接测试。`session-ipc.test.ts:71-89` 的 CONFLICT 覆盖的是 `session:login` 的 manager 内部并发，不触达 auth-ipc 此分支；`auth-ipc.test.ts` 中 `is_login_in_progress` 仅作 mock 返回值用于 status 断言。若该分支逻辑出错（误报冲突或并发时漏判），无回归守护。
- 建议：在 auth-ipc 测试中令 `is_login_in_progress` 返回 true，断言 `startCookieLogin` 返回 `CONFLICT` 且不触发 `handleCookieLogin`（sessionManager.start_login 不被调用）。

### t278_test_f008 - UI 轮询超时分支（120s）无测试

- 严重度：minor
- 锚点：AC3 失败路径（登录窗口未完成时轮询超时提示）
- 位置：`src/renderer/components/SettingsForm.tsx:243-247`；`src/renderer/components/WebLoginSection.tsx:50-55`；`settings_form.test.tsx:566-594,665-777`（轮询用例均两次状态即结束）
- 问题：两个轮询实现中 `Date.now() >= deadline` → `throw new Error("网页登录超时，请重试")` 分支无测试；现有用例 mock `cookieLoginStatus` 最多两次返回后即退出，永远到不了超时路径。轮询循环或 deadline 判断出错时无回归守护。
- 建议：mock `cookieLoginStatus` 恒返回 `in_progress:true`，用 `vi.useFakeTimers()` 推进超过 `COOKIE_LOGIN_POLL_TIMEOUT_MS`，断言 alert 展示「网页登录超时，请重试」。

## 结论

- 前轮 finding 复核：f001–f004（Round 1 important）仍消除；f005、f006（Round 2 minor）均已按建议补齐对应测试，以 diff 与测试运行为准，非采信处置表。
- 改测方向复核：无迁就实现的改测。
- 本轮新发现：2 条（均 minor）。
- 验证：11 个相关测试文件 263 passed（`server.test.ts` 集成、session/auth/grok/connector IPC、oauth_helpers、session-manager、usageboard-web、settings_form、web_login_form、add_account_dialog）；危险模式 grep 无命中（新增 `.skip`/`.only`/`@ts-ignore`/`eslint-disable`/恒真断言均无）；`git diff --check` 通过。React `act(...)` 警告为既有现象，不影响通过。
- 未进表的提示：web bridge 层 grok OAuth surface 仍无独立断言，工厂同构下 kimi 全组 + local-api grok 全组覆盖可接受（Round 2 已述，不重复进表）；`server.test.ts:210-273` 既有「routes web OAuth…」用例把同一 manager 注入 grok/kimi，但该用例不调用任何 kimi 端点，无假阳性，完整生命周期由 `:275` 起的独立 manager 用例覆盖。
- 总体判断：前轮 6 条 finding 全部消除，无新 critical/important，仅剩 2 条 minor 覆盖扩展项，本轮 PASS。
- 系统性 follow-up：无

verdict: PASS

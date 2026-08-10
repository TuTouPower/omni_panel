# Task review t278（reviewer_focus: 代码）

- task：`t278_web_auth_parity`
- spec：`docs/tasks/t278_web_auth_parity/spec.md`
- diff_anchor：`f2c038cf8580c7c049e8460369780ccfcfba30e3`
- target：`git diff f2c038cf8580c7c049e8460369780ccfcfba30e3`
- round：Round 1
- reviewed_at：2026-08-10 13:10 UTC+8

## Findings

### t278_code_f001 - 实例网页登录成功后 UI 误判为未捕获 Cookie

- 严重度：important
- 锚点：AC3；网页登录完成后应捕获成功、密钥落 vault，面板状态转为已连接
- 位置：`src/renderer/components/WebLoginSection.tsx:31-43`；`src/main/core/session/session-manager.ts:149-160`；`src/renderer/components/SettingsForm.tsx:373-397`
- 问题：编辑带 `instance_id` 的网页登录账号（当前 `opencode_go` 的 `auth.method` 为 `web_login`）时，`WebLoginSection` 通过 `/v1/session/login` 调用实例登录。`session-manager` 在存在 `instance_id` 时已将捕获 Cookie 写入 vault，但只返回 `{ saved: true }`，不返回 `cookie`。UI 却同时要求 `result.cookie` 存在；因此成功捕获后进入“未捕获到 Cookie”错误分支，不调用 `onSecrets`，也不会执行 `perform_save` 和 connector refresh，用户看到的登录状态仍可能是未连接/旧状态。
- 建议：实例登录成功分支不要依赖回传明文 Cookie；改为按 `saved` 成功后重新读取实例 secrets 并刷新连接状态，或明确区分匿名登录与实例 vault 登录的结果契约，避免把已落 vault 的成功结果判为失败。

### t278_code_f002 - Cookie 登录状态端点未接入 web bridge，登录流程没有轮询

- 严重度：important
- 锚点：AC3；web 面板点 Cookie 登录后应触发登录并轮询状态，完成后反映捕获结果
- 位置：`src/main/core/local-api/server.ts:647-655`；`src/web/usageboard-web.ts:375-377`；`src/renderer/components/SettingsForm.tsx:234-244`
- 问题：local-api 已提供 `/v1/auth/cookieLogin/status`，可返回 `in_progress` 与 `saved`，但 `UsageboardApi.auth` 只有 `cookieLogin`，web bridge 只实现 POST 触发，设置页单次等待 `cookieLogin` 返回。该 POST 实际等待 `sessionManager.start_login()` 直到窗口关闭；若用户刷新 web 面板、浏览器中止长请求或代理超时，登录窗口仍可继续捕获并写 vault，但页面无法查询状态，重新点击还可能因同一实例仍在 `in_progress` 收到冲突，直到窗口结束。新增状态端点因此成为未使用的死接口，AC 要求的 web 轮询没有实现。
- 建议：把 Cookie 登录拆成可立即返回的触发动作与按 `instanceId` 查询状态的 bridge/API，web 设置页按 `in_progress`/`saved` 轮询并在成功后读取 secrets、刷新 connector；错误和超时路径同时释放登录状态。

### t278_code_f003 - web_login 设置页没有手动粘贴 Cookie 回退入口

- 严重度：important
- 锚点：AC4；无 display 时登录失败应可读，用户仍可手动粘贴 Cookie 并正常采集
- 位置：`src/renderer/components/SettingsForm.tsx:315-319,373-397`；`src/renderer/components/WebLoginSection.tsx:56-82`；`connectors/opencode_go/manifest.json:4-17`
- 问题：`SettingsForm` 在存在 dedicated auth section 时隐藏所有 `secret` 参数，`authMethod === "web_login"` 只渲染 `WebLoginSection`。该组件只有登录按钮、错误提示和说明，没有 Cookie 文本输入；因此 `opencode_go` 这类 `web_login` 连接器在无 display 时虽会收到可读错误，但设置页没有任何可用的手动粘贴路径，无法满足 AC4 的回退要求。
- 建议：为 web 设置页的网页登录 section 增加 Cookie 字符串输入，接入现有 `secret_values`/`perform_save` 链路；自动捕获与手动粘贴共用同一保存和 refresh 逻辑。

### t278_code_f004 - OAuth 非 JSON 错误响应可能把 token 明文写入日志

- 严重度：important
- 锚点：AC6；认证全流程日志不得出现 token 明文，错误分支同样适用
- 位置：`src/main/core/auth/oauth_helpers.ts:113-121`；`src/main/ipc/grok_auth_ipc.ts:24-29,41-51`；`src/main/ipc/kimi_auth_ipc.ts:24-29,41-51`；web 暴露路径为 `src/web/usageboard-web.ts:87-115`
- 问题：HTTP 响应无法解析为 JSON 时，`make_default_http_post` 将响应正文前 200 字节拼进 Error；Grok/Kimi IPC handler 随后把完整 `message` 记录到 error 日志。若 OAuth 端点或代理在异常分支返回 form-encoded `access_token`/`refresh_token`、Cookie 或包含凭据的错误正文，凭据会在写入 vault、被 scrubber 注册前直接落日志；scrubber 不能保证替换尚未注册的上游响应值。t278 将这些 handler 接入 web OAuth 全流程，因此该错误路径属于本 task 的 AC6 范围。
- 建议：非 JSON 响应只记录 HTTP 状态、Content-Type 和内部 trace id，禁止把响应正文放入异常或日志；错误返回给 UI 时也使用固定的非敏感分类消息。

## 结论

- 前轮 finding 复核：Round 1，无前轮报告。
- 本轮新发现：4 条（4 条 important）。
- 未进表的提示：实现文件达到项目文件大小提示阈值：`src/main/core/local-api/server.ts`（1364 行）、`src/main/index.ts`（1277 行）、`src/web/usageboard-web.ts`（677 行）、`src/renderer/components/SettingsForm.tsx`（696 行）、`src/renderer/components/AddAccountDialog.tsx`（421 行）；按审阅提示仅在此列出，不单独制造 finding。`handle_web_auth` 分支复杂度较高，建议后续拆分，但未另列 finding。测试层不属于本代码 reviewer 责任范围。
- 验证记录：针对相关集成/单元测试共 7 个 test files、205 tests 通过；`pnpm typecheck`、修改生产源码的 ESLint、`git diff --check` 均通过。上述通过项不消除四个实现层缺陷。
- 总体判断：AC3 的实例成功反馈与状态轮询、AC4 的手动回退、AC6 的错误日志脱敏均存在未解决 blocking 缺口，当前实现不可信。
- 系统性 follow-up：无；应在当前 task 修复后进入下一轮代码审查。

verdict: FAIL

## Round 2 (2026-08-10 14:20 UTC+8)

## Findings

### t278_code_f005 - web_login 类连接器（opencode_go）web 面板登录仍走阻塞式 session.login，f002 轮询修复未覆盖该路径

- 严重度：important
- 锚点：AC3；web 面板点 cookie 类连接器「登录」后应能反映登录进度并在完成后转为已连接，f002 修复目标（触发与状态轮询拆分）仅覆盖 session 类路径
- 位置：`src/renderer/components/WebLoginSection.tsx:38-52`；对比已修复路径 `src/renderer/components/SettingsForm.tsx:237-263`；状态端点/轮询能力 `src/web/usageboard-web.ts:374-381` 与 `src/main/ipc/auth-ipc.ts:93-143`
- 问题：`WebLoginSection.handle_login` 仍直接 `window.usageboard.session.login({...})`，在 web 桥下等价于 POST `/v1/session/login` 且服务端 `await handleSessionLogin` 阻塞至登录窗口关闭（最多 120s），没有采用本 task 新加的 started 触发 + `cookieLoginStatus` 轮询模式。`opencode_go`（auth.method=`web_login`，spec 上下文区测试策略点名的 cookie 类连接器）在 web 设置页走该组件：① 登录窗口打开期间刷新页面/切换路由/代理中止 → fetch 失败，UI 只显示原始 fetch 错误，无 in_progress 状态可查，窗口仍在捕获、vault 最终落值，但当前页面不轮询也不查询 status，面板状态不自动更新（须手动刷新重开设置）；② 窗口未关时重复点击 → `start_login` 并发拒绝，提示为英文原始消息 `Login already in progress for instance: ...`（session-ipc.ts:58 原样回传），与 session 类路径（`startCookieLogin` 的 `CONFLICT` + 中文「已有登录正在进行中」、轮询、`safe_cookie_login_error` 分类）行为分叉。f002 的修复只接通了 `SessionSection`（session 类），`WebLoginSection`（web_login 类）未接入，属于修不彻底。
- 建议：`WebLoginSection` 在 web 运行环境改用 `cookieLogin` 触发 + `cookieLoginStatus` 轮询（复用 `SettingsForm.handle_session_login` 的 started/轮询/超时模式），桌面环境保留现有 `session.login` 阻塞路径（AC7 桌面行为不变）；错误统一走分类消息，避免上游英文原文直接展示。

## 结论

- 前轮 finding 复核（以 diff 与代码为准，不采信 task.md 处置表）：
    - f001（important）：已消除。`WebLoginSection.tsx:44-52` 不再要求 `result.cookie`，实例登录 `{saved:true}` 时走 `onSaved` → `getSecrets` + `connector.refresh`；`SettingsForm.tsx:237-263` 的 `handle_session_login` 同路径。桌面与 web 编辑场景均不再误判「未捕获到 Cookie」。测试：`settings_form.test.tsx`「reloads the vault and refreshes after instance web login succeeds」。
    - f002（important）：修不彻底，残留见 f005。`SessionSection` 路径（session 类，mimo 等）已实现 started 触发 + 状态轮询 + 中文分类错误；`WebLoginSection` 路径（web_login 类，opencode_go）仍阻塞式 `session.login`，无轮询与中止恢复。
    - f003（important）：已消除。`WebLoginSection.tsx:83-101` 新增受控 Cookie 文本域并接 `secret_values` 保存链路；`WebLoginForm.tsx` 新增手动保存按钮；`SessionSection` 保留既有粘贴入口。无 display 时 `session-manager.ts:79-85` 在创建窗口前返回可读错误，状态不损坏。测试：`web_login_form.test.tsx`「saves a manually pasted cookie」、`session-manager.test.ts` no-display 用例、`server.test.ts` no-display 链路。
    - f004（important）：已消除。`oauth_helpers.ts:120-123` 非 JSON 响应不再拼入正文，只含状态码；grok/kimi IPC 错误日志移除 `message`；`session-ipc.ts` 对 SESSION_LOGIN 结果/错误做 redact（`redact_session_result`，开发期日志同样生效）。哨兵测试：`oauth_helpers.test.ts`、`grok_auth_ipc.test.ts`、`session-ipc.test.ts` 均断言无 sentinel 明文。
- 本轮新发现：1 条（f005，important）。
- 未进表的提示：
    - 文件过大（按审阅规则降级，仅列出）：`src/main/core/local-api/server.ts`（1368 行，本 task 净增约 199）、`src/main/index.ts`（1277，净增约 89 并移动 sessionManager 装配）、`src/web/usageboard-web.ts`（683，净增约 110）、`src/renderer/components/SettingsForm.tsx`（729，净增约 49）、`tests/integration/local-api/server.test.ts`（2016，净增约 476，接近测试 1200 important 阈值）。未发现因过大直接引发的行为缺陷。
    - 复杂度：`handle_web_auth`（server.ts）分支链较长但每支仅转发，按分发函数排除规则不进表。
    - 本地化/体验 minor：无 display 错误、`Login already in progress`、`Login timed out` 在 WebLoginSection/桌面路径以英文原文展示（session 类路径已中文分类）；`WebLoginSection` web 版超时提示亦为英文。
- 总体判断：f001/f003/f004 已消除，f002 修复不彻底（web_login 类连接器 web 面板登录无轮询与状态恢复，且与 session 类路径行为分叉），存在 1 条未解决 important，当前实现仍不可信。
- 系统性 follow-up：无；应在当前 task 内修复 f005 后进入下一轮代码审查。

verdict: FAIL

## Round 3 (2026-08-10 14:48 UTC+8)

## Findings

### t278_code_f006 - web 添加账号场景（无 instance_id）cookie 登录仍为阻塞式、无轮询，与编辑实例路径行为分叉

- 严重度：minor
- 锚点：行为缺陷；web 面板添加 cookie 类账号时点「网页登录」后，登录窗口打开期间刷新/切路由 → 匿名捕获的 cookie 不落 vault 且无状态端点可查，捕获结果丢失，需完整重做
- 位置：`src/renderer/components/WebLoginSection.tsx:42`（`is_web() && instance_id` 才走轮询分支）；`src/renderer/components/forms/WebLoginForm.tsx:60-73`、`src/renderer/components/add_account/SessionForm.tsx:51-64`（添加账号表单内 WebLoginSection 均无 instance_id）；`src/main/core/local-api/server.ts:663-675`（`/v1/session/login` 服务端 `await handleSessionLogin` 阻塞至窗口关闭/120s 超时）
- 问题：web 面板添加 cookie 类账号（opencode_go `web_login`、session 类）时，登录按钮走 `window.usageboard.session.login` → 阻塞式 POST `/v1/session/login`，未采用 f005 修复的 started 触发 + `cookieLoginStatus` 轮询模式。窗口打开期间刷新页面/浏览器中止请求 → 匿名路径捕获的 cookie 仅经响应回传（不落 vault），fetch 中止后 `onSecrets` 不执行，cookie 永久丢失；无状态端点可查（匿名 login_id 为随机 UUID）；重复点击触发 `start_login` 并发拒绝（英文原文）。与编辑实例路径（轮询 + vault 落值 + 中文分类错误）行为分叉。
- 建议：web 添加账号时先建临时会话（或复用实例化后再登录）接入 `cookieLogin`/`cookieLoginStatus` 轮询；或接受该局限并在 web 登录指引中提示「登录期间勿刷新页面，失败后手动粘贴 Cookie」。

### t278_code_f007 - SettingsForm.handle_session_login 与 WebLoginSection web 分支轮询逻辑逐字重复

- 严重度：minor
- 锚点：DRY；两处重复未造成当前行为分叉（消息与阈值一致），但后续修复需双点同步
- 位置：`src/renderer/components/SettingsForm.tsx:237-263`；`src/renderer/components/WebLoginSection.tsx:43-61`
- 问题：250ms 轮询间隔、120s 超时、`started` 触发 + `cookieLoginStatus` 循环、`status.error`/`!status.saved` 处理、超时文案在两处逐字一致；常量 `COOKIE_LOGIN_POLL_INTERVAL_MS`/`COOKIE_LOGIN_POLL_TIMEOUT_MS` 各自定义。若未来调整轮询阈值或状态语义，易漏改一处导致 session 类与 web_login 类连接器行为分叉。
- 建议：提取共享 hook（如 `use_cookie_login_poll(instance_id)`）供两组件复用。

## 结论

- 前轮 finding 复核（以 `git diff f2c038cf8580c7c049e8460369780ccfcfba30e3` 与当前代码/测试为准，不采信 task.md 处置表）：
    - f001（important）：已消除。`WebLoginSection.tsx:62-66` 不再要求 `result.cookie`；实例登录 `{saved:true}` 走 `onSaved` → `getSecrets` + `connector.refresh`，桌面匿名路径 `result.cookie` 存在时走 `onSecrets`。测试：`settings_form.test.tsx` 实例 web 登录成功后 reload vault + refresh 用例通过。
    - f002（important）：已消除。`server.ts:635-655` 提供 POST `/v1/auth/cookieLogin`（`startCookieLogin` 同步返回 `started`）与 GET `/v1/auth/cookieLogin/status`；`auth-ipc.ts` 新增 `startCookieLogin`/`handleCookieLoginStatus`（`cookie_login_states` 状态表、`is_login_in_progress` 并发检查、`safe_cookie_login_error` 中文分类）；web bridge `cookieLogin`/`cookieLoginStatus` 已接真实端点；UI 侧 SettingsForm 与 WebLoginSection 均实现轮询。测试：`auth-ipc.test.ts` status 断言、`server.test.ts` 端点链路通过。
    - f003（important）：已消除。`WebLoginSection.tsx:114-135` 新增受控 Cookie Textarea 并接 `secret_values`/`perform_save` 保存链路；`WebLoginForm.tsx` 新增「添加账号」手动保存按钮；`SessionSection` 保留粘贴入口；`SessionForm` 添加账号场景在 `login_url` 存在时切到 WebLoginSection。测试：`web_login_form.test.tsx` 手动粘贴保存用例通过。
    - f004（important）：已消除。`oauth_helpers.ts:120-123` 非 JSON 响应只含状态码、不再拼入正文；grok/kimi IPC 错误日志移除 `message`；`session-ipc.ts` `redact_session_result` 对成功 cookie 与失败 error.message 打码（开发期日志同样生效）。哨兵测试：`oauth_helpers.test.ts`、`grok_auth_ipc.test.ts`、`session-ipc.test.ts` 均断言 sentinel 不出现。
    - f005（important）：已消除。`WebLoginSection.tsx:42-67` 在 `is_web() && instance_id` 下改用 `cookieLogin` 触发 + `cookieLoginStatus` 轮询（250ms/120s、`status.error`/`saved` 处理、中文错误），桌面环境保留 `session.login` 阻塞路径（AC7 回归不变）。
- 本轮新发现：2 条（f006/f007，均 minor）。
- 未进表的提示：
    - 文件过大（按审阅规则降级，仅列出；未发现因过大直接引发的行为缺陷）：`src/main/core/local-api/server.ts`（1368 行，净增约 199）、`src/main/index.ts`（1277）、`src/web/usageboard-web.ts`（683）、`src/renderer/components/SettingsForm.tsx`（729）、`tests/integration/local-api/server.test.ts`（2029，净增约 489）。
    - 复杂度：`handle_web_auth`（server.ts）分支链较长但每支仅转发一行，按分发函数排除规则不进表。
    - 本地化残留：桌面路径与 web 匿名（添加账号）路径的并发/超时错误仍以英文原文展示（`session-ipc.ts:52-62` 原样回传 `Login already in progress...` / `Login timed out`，WebLoginSection 非 web 分支与 SessionSection 直接展示）；web 编辑实例路径已中文分类。桌面路径为既有行为（AC7 不回归），延续 Round 2 提示。
    - 范围外观察：`grok_oauth_manager.ts:333` `refresh_now failed for ${instance_id}: ${msg}` 的 `msg` 若含上游响应细节可能进日志；属既有代码（非本 task diff），t278 未改动 manager 本体，未标 finding。
- 总体判断：f001-f005 全部消除；本轮 2 条 minor 不阻断。web 认证链路（cookie 轮询、手动回退、OAuth 全组、日志脱敏）实现与 spec 契约区一致。
- 系统性 follow-up：无。

verdict: PASS

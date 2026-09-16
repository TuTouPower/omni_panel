# Task review t492（reviewer_focus: 代码）

- task：`t492_kimi_web_bearer_keepalive`
- spec：`docs/tasks/t492_kimi_web_bearer_keepalive/spec.md`
- diff_anchor：`302fb4be30040b2041fd6eebcdf42c5fe8833659`
- target：`git -C '/Users/testuser/kar/code/omni_panel_t492' diff 302fb4be30040b2041fd6eebcdf42c5fe8833659`
- round：1
- reviewed_at：2026-09-16 09:24 UTC+8

reviewed_scope: d920435360753ea1

## Findings

### t492_code_f001 - kimi_web 登录窗 localStorage 的 refresh_token 在生产环境永远读不到，续期材料入库必为 null

- 严重度：critical
- 锚点：AC-001（Bearer 过期后无需手动重登即可续期）——续期材料缺失时该 AC 无法成立
- 位置：`src/main/index.ts:726-732`（`read_local_storage` 实现）+ `src/main/core/session/session-manager.ts:185-197`（调用点）+ `src/main/core/session/session-manager.ts:292-295`（触发点）
- 问题：`read_local_storage` 只在 `window.on("closed", () => { void save_cookie_on_close(); })` 这条路径被调用，而 Electron 的 `closed` 事件在窗口已销毁后才触发。实现里的守卫 `if (window.isDestroyed()) return null;` 因而必然命中，`captured_refresh_token` 恒为 `null`，落库凭据不含 refresh token。
    - 用仓库自带 Electron v42.2.0 实测（`node_modules/.bin/electron`，脚本复刻 `create_window` 的 webPreferences）：在 `closed` 回调内 `win.isDestroyed()` 返回 `true`，`win.webContents.executeJavaScript(...)` 抛 `Object has been destroyed`。输出：`{"inside_closed_isDestroyed":true,"exec_value":"N/A","exec_error":"Object has been destroyed"}`。
    - 失败场景：kimi_web 全新登录 → 凭据 JSON `refresh_token: null` 入库 → 15 分钟后 Bearer 过期、采集 401 → `refresh_kimi_web_session` 走「无 refresh token」分支 → 现有 Bearer 不可用 → `NO_SILENT_REFRESH` → 回退到交互式登录窗（需用户手动重登）。AC-001 的目标（无人值守续期）实际未达成。
    - 单测为何没有拦住：`tests/unit/session/session-manager.test.ts` 的 `MockWindow.read_local_storage` 无条件返回 localStorage 值（不模拟 `isDestroyed()` 与 `executeJavaScript` 在窗口销毁后的真实行为），断言的是「读键被调用过」，掩盖了真实宿主下的恒 null。
- 建议：修掉读取时机——在窗口销毁前取到 refresh token（例如捕获到 cookie/authorization 后立即读一次，或改在 `close`（销毁前）事件里读，或在 SPA 登录响应/轮询里取），不要依赖 `closed` 后仍可访问页面；`read_local_storage` 保留 `isDestroyed` 守卫但增补可观测告警，且测试必须模拟「窗口销毁后读取失败」的真实宿主行为。

### t492_code_f002 - 生产路径调用 kimi_web 续期 HTTP 时未接代理配置，代理用户续期直达外网必失败

- 严重度：important
- 锚点：AC-001（续期通道对 kimi_web 实例生效）——经代理访问外网的用户续期不可达
- 位置：`src/main/ipc/auth-ipc.ts:375`（`deps.kimi_web_refresh ?? ((token) => refresh_kimi_web_tokens(token))`）+ `src/main/core/auth/kimi_web_token_refresher.ts:37-38,111`（`get_proxy_url?` seam）+ `src/main/index.ts:397-400`（`trySilentCookieRefresh` 调用未传 proxy）
- 问题：`refresh_kimi_web_tokens` 预留了 `get_proxy_url` deps，`make_default_http_post` 也支持 `proxy_url`，但唯一的生产调用点 `auth-ipc.ts:375` 与 `index.ts:397` 都没传代理，实际以直连发送。同仓的 device-code OAuth（`device_code_oauth_manager.ts:100`、`index.ts:369/379`）与连接器请求（`refresh-service.ts:313`）都接了 `resolve_effective_proxy_url`，此处不一致。
    - 失败场景：用户配置/系统检测到代理（直连被墙）。采集请求经代理正常；Bearer 过期后 `sessionLogin → trySilentCookieRefresh → refresh_kimi_web_tokens` 直连 `auth.kimi.com` 失败 → `NO_SILENT_REFRESH` → 回退手动登录。AC-001 对这类用户不成立。
- 建议：把刷新服务/`index.ts` 已有的 `resolve_effective_proxy_url`（或 `resolve_proxy_url`）透传到 `trySilentCookieRefresh` → `refresh_kimi_web_tokens(..., { get_proxy_url })`。

### t492_code_f003 - connector 的 `is_auth_failure` 会在响应字节数含 401/403 时误判非认证失败

- 严重度：minor
- 锚点：行为缺陷——非认证失败被改写成「会话失效」文案并触发重登链
- 位置：`connectors/kimi_web/connector.ts:29-31`（`/(^|\D)40[13](\D|$)/`）+ `connector.ts:114-119`
- 问题：net-client 的错误文案格式固定为 `HTTP <status>: request failed (<N> bytes)`（`net-client.ts:340-351`）。正则对整个字符串扫描，当 `N` 恰为 401/403（例如 `HTTP 500: request failed (401 bytes)`）时命中，于是真正的 5xx 被映射为 `SESSION_EXPIRED_MESSAGE`，被 `is_auth_error` 判为凭证失效 → 触发自动重登而不是按普通失败处理，且掩盖原始错误（原始错误仅进 `ctx.log.warn`）。
- 建议：只匹配状态位，例如 `/\b40[13]\b(?=\s*:)/` 或从 message 前缀解析状态码，避免匹配到 body 字节数。

### t492_code_f004 - 凭证失效文案出现第二份字面量，未复用 `AUTH_ERROR_DISPLAY_TEXT`

- 严重度：minor
- 锚点：DRY（单纯 verbatim 重复，暂无行为分叉）
- 位置：`src/renderer/components/provider_card_states.tsx:43`（`const auth_label = "凭证失效，请重新登录";`）对比 `src/shared/lib/auth-error.ts:28`（`AUTH_ERROR_DISPLAY_TEXT`）
- 问题：本 task 新引入 `AUTH_ERROR_DISPLAY_TEXT` 并在同文件的 `ProviderCardErrorBanner` 使用，但同文件 `ProviderCardState` 的 auth 分支仍硬编码同一文案；此外 `ProviderCardErrorBanner` 的 auth 分支（`provider_card_states.tsx:132-157`）与 `ProviderCardState` 的 auth 分支（`provider_card_states.tsx:42-71`）是几乎逐行相同的 JSX 拷贝。两处文案今天一致，但后续任一改动都会造成用户可见文案分叉。
- 建议：`ProviderCardState` 也改用 `AUTH_ERROR_DISPLAY_TEXT`，并把 auth 分支抽成一个共用组件。

### t492_code_f005 - `docs/specs/connector-session.md` 记录的凭据字段 `access_expires_at` 实现并不写入

- 严重度：minor
- 锚点：文档与实现不一致（文档与规格一致性）
- 位置：`docs/specs/connector-session.md:31`（列举 `cookie`/`authorization`/`session_id`/`device_id`/`refresh_token`/`access_expires_at`）对比 `src/main/core/session/session-manager.ts:199-208` 与 `src/main/ipc/auth-ipc.ts:383-393`
- 问题：实现写入的凭据 JSON 只有 `cookie`/`authorization`/`session_id`/`device_id`/`refresh_token`；`access_expires_at` 已按 `task.md:28` 的取舍删除，但同属「Finalization 时更新的 blueprint」的 `connector-session.md` 仍把它列为字段，读者会以为存在该键。
- 建议：删除 `connector-session.md:31` 中的 `access_expires_at`（或补一句「已移除」）。

### t492_code_f006 - `credential_changed` 比较整份凭据：旧凭据分支里仅 cookie 变化也会被计为「成功换到新 Bearer」

- 严重度：minor
- 锚点：AC-003（未能换到新 Bearer 时该轮不计入成功重登）
- 位置：`src/main/ipc/auth-ipc.ts:357-372`（无 refresh token 分支）+ `auth-ipc.ts:316-322`（`credential_changed = previous !== savedSecret`）+ `src/main/core/scheduler/refresh-service.ts:441-453`
- 问题：`credential_changed` 以整份 JSON 字符串是否变化为准，而非「Bearer 是否变化」。在没有 refresh token 的旧凭据分支（`auth-ipc.ts:357`）里，若分区 cookie 更新但 Bearer 原样保留，`{...parsed, cookie}` 与旧值不同 → `credential_changed=true` → `refresh-service` 把它计为成功重登并用**同一个** Bearer 重试，与本 AC「未换到新 Bearer 不计入成功重登」的语义不符（终态仍是 `failed`，但会多一轮空转重试）。
    - 触发条件较窄：需要旧凭据（无 refresh token）+ 现有 Bearer 仍可解析且未过期（`auth-ipc.ts:360` 放行）+ 服务器仍拒绝该 Bearer + 分区 cookie 与库中不同。故定 minor。
- 建议：把「是否换到新 Bearer」显式化（例如 `refresh_kimi_web_session` 返回本次是否写入了新的 `authorization`），refresh-service 以该位判定，而不是整份凭据字符串。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：本轮为 Round 1，无前轮 finding。
- 本轮新发现：6 条（critical 1 / important 1 / minor 4）。
- 未进表的提示（文件过大 / 复杂度 / 范围外观察）：
    - 文件过大（物理行数 `wc -l`，仅列本 task 触及/新建文件；本 task 均净增这些文件，故达阈值但按「降级规则」只在此列示，不进 finding 表）：`src/main/index.ts` 1525 行、`src/main/core/scheduler/refresh-service.ts` 577 行、`src/main/ipc/auth-ipc.ts` 411 行（实现源码阈值 400）；测试源码 `tests/integration/scheduler/refresh-service.test.ts` 1812 行（≥1200）、`tests/unit/session/session-manager.test.ts` 868 行（≥600）、`tests/unit/ipc/auth-ipc.test.ts` 825 行（≥600）。新增 `kimi_web_token_refresher.ts` 145 行、`connectors/kimi_web/connector.ts` 169 行，均未超阈值。
    - 圈复杂度：本 task 触及的 `refresh-service.ts` 刷新主流程函数体量大、分支多（`>=10`，远超「结论段提示」线），但属 t155/t172 起的既有结构，本 task 只在重登块内新增 1 个 `else if` 分支，未新增可观测缺陷，仅提示拆分可读性风险。
    - 范围外观察（不进 finding 表）：`credential_changed` 门槛作用于**所有** session 连接器，而 spec「非范围」声明「不改其它 session 连接器的凭据格式与刷新语义」；实测对「cookie 未轮换但 401」的场景终态与改前一致（仍 failed），故未按偏航出 finding，建议 spec/ADR 显式承认该共享语义已泛化到全部 session 连接器。
    - 范围外观察：`docs/pending/todo/p236_t471_test_fixtures_missing_manifest_id.md`（本 task 新建）与 `handoff.json`（未跟踪）均为流程/登记产物。已知 p236 覆盖 `auth-ipc.test.ts` 7 例、`refresh-service.test.ts` 6 例因 t471 `manifestId` 迁移未同步 fixture 长期红——其中 `trySilentCookieRefresh > uses instance-scoped partition …` 是本 task 改写断言后的用例，因同一 p236 根因（fixture 缺 `manifestId`）仍红，故 `task.md`「新增与改写用例全绿」的说法在该文件不成立；根因已在 base `302fb4be` 复现，不另开 finding。renderer 项目本机整体 `React.act is not a function`，AC-006 的渲染层断言未能本地执行。
- AC 复验方式：
    - AC-001：`re_verified`——独立重跑 `npx vitest run --project node tests/integration/scheduler/refresh-service.test.ts -t "t492"`（AC-001 用例 2 passed），并审阅 `refresh-service.ts:441-466` 换新凭据重试链。**但** f001 证明真实的 refresh_token 捕获在生产环境恒失败，AC-001 的端到端前提未满足（测试用 MockWindow 掩盖）。
    - AC-002：`re_verified`——重跑 `tests/unit/ipc/auth-ipc.test.ts` 中 4 条 kimi AC-002/legacy 用例（含 refresh token 被拒、无 refresh token 且 Bearer 过期）均 pass，代码见 `auth-ipc.ts:357-382`。
    - AC-003：`re_verified`——重跑 `refresh-service.test.ts -t "t492"`（credential-unchanged 不重试用例 pass），代码见 `refresh-service.ts:441-453`。
    - AC-004：`re_verified`——`tests/unit/ipc/auth-ipc.test.ts` 的 AC-001/004 用例与 `tests/unit/session/session-manager.test.ts` 3 条新用例均 pass（50 passed），确认写回保留 `session_id`/`device_id`、cookie 更新、refresh token 轮换落盘。
    - AC-005：`re_verified`——审阅 diff 确认 t469 假绿用例整体删除（`auth-ipc.test.ts:563-565` 注释 + 新用例），`tests/unit/auth/kimi_web_token_refresher.test.ts` 9 例 pass。
    - AC-006：`re_verified`——`tests/integration/connector/kimi_web_connector.test.ts`（4 passed，401→「…会话已失效」且 `is_auth_error` 为 true）、`tests/unit/shared/auth-error.test.ts`（8 passed，`auth_error_display_text` 映射不含 `HTTP \d{3}`）。渲染层 `provider_card_states.test.tsx` 因本机 `React.act` 故障未复跑，这部分依赖实施侧证据。
    - AC-007：`trust_prior`——`[deploy]`，需真实账号 ≥20 分钟连续采集，依赖 handoff/`task.md` 的部署验收声明，无本地证据。
    - coverage = re_verified / 总 AC 数 = 6 / 7；`trust_prior` 占比 1/7（\<30%）。
- 总体判断：存在 1 条未解决 critical（f001，refresh_token 采集在生产恒失败，AC-001 未真正落地）与 1 条未解决 important（f002，代理用户续期不可达），本轮不可 PASS。
- 系统性 follow-up：已有 `p236`（t471 manifestId fixture 迁移遗留，本 task 已引用）；另建议 follow-up 标题「kimi_web 续期 HTTP 未接代理配置」、slug `t493_kimi_web_refresh_proxy_wiring`，阻断性：非阻断（但影响代理用户 AC-001）。

verdict: FAIL

## Round 2 (2026-09-16 09:36 UTC+8)

reviewed_scope: 2f19ee8835bf8dc3

### 前轮 finding 复核（依据：`git -C '/Users/testuser/kar/code/omni_panel_t492' diff 302fb4be30040b2041fd6eebcdf42c5fe8833659` 与当前代码，不以 `task.md` 自述为准）

- **t492_code_f001（critical）——已消除（实现层）**：原缺陷是 refresh token 只在 `window.on("closed")` 后经 `save_cookie_on_close` 读取，而 `closed` 触发时窗口已销毁（`isDestroyed()` 必为 `true`），`captured_refresh_token` 恒为 `null`。现改为在页面存活时读取：kimi_web 分支在捕获到 `authorization` 的同一请求里调用 `capture_refresh_token()`（`src/main/core/session/session-manager.ts:296-301`、`session-manager.ts:146-172`），落库前只 `await refresh_token_read` 等在途读取（`session-manager.ts:220-222`）。触发点与「捕获 Bearer」同源——s039 实测（`docs/spikes/s039_kimi_web_bearer_mint_probe/report.md:56`）登录后首个带 Bearer 的请求 `apiv2/...UserService/GetCurrentUser` 立即出现且 origin 为 `www.kimi.com`，等于 `login_url` 的 origin，故只要登录能捕获到 Bearer，就必然在窗口存活期内触发 refresh token 读取。「销毁后读取必失败」这条确定性失败路径已结构性移除。`MockWindow.read_local_storage` 现于 `closed` 时 reject，真实复刻该约束（`tests/unit/session/session-manager.test.ts`），3 条 t492 用例实测通过。残余风险（SPA 落盘时机可能晚于读取）为 spec「风险与回退」已明确接受且有手动重登回退，不作为本轮 finding。
- **t492_code_f002（important）——已消除**：`AuthIpcDeps.get_proxy_url`（`src/main/ipc/auth-ipc.ts:43`）已接入生产路径——`src/main/index.ts:405-409` 构造 deps 时传 `() => resolve_effective_proxy_url(currentConfigSnapshot.proxy?.url, detected_system_proxy)`，`auth-ipc.ts:385-388` 据此调 `refresh_kimi_web_tokens(token, { get_proxy_url })`，与 oauth manager（`index.ts:369-373`/`379-383`）和 connector（`refresh-service.ts:392-393`）同源。代理用户续期不再直连。
- **t492_code_f003（minor）——已消除**：`connectors/kimi_web/connector.ts:34` 改为 `/HTTP\s+40[13]\b/`（另加 `/unauthenticated/i`），不再用整串 `(^|\D)40[13](\D|$)`。`HTTP 500: request failed (401 bytes)` 不再命中（字节数里的 401 前无 `HTTP `）；`tests/integration/connector/kimi_web_connector.test.ts` 新增用例断言该 5xx 保留原错误、不映射为会话失效，实测通过（6 passed）。
- **t492_code_f004（minor）——已消除**：抽出 `AuthRecoveryRow`（`src/renderer/components/provider_card_states.tsx:35-63`），`ProviderCardState`（:80-86）与 `ProviderCardErrorBanner`（:149-155）共用该组件，文案统一取 `AUTH_ERROR_DISPLAY_TEXT`（`src/shared/lib/auth-error.ts:28`）。`grep` 确认 renderer 内已无第二份 `"凭证失效，请重新登录"` 字面量，逐行重复的 JSX 拷贝消除。
- **t492_code_f005（minor）——已消除**：`docs/specs/connector-session.md` 字段列举更新为 `cookie`/`authorization`/`session_id`/`device_id`/`refresh_token`；全仓（除 `docs/archive`、spike 报告与 task/review 记录）已无 `access_expires_at` 引用。
- **t492_code_f006（minor）——已消除**：旧凭据分支显式传 `{ credential_changed: false }`（`src/main/ipc/auth-ipc.ts:374-382`），不再因「仅 cookie 变化」被计成换到新 Bearer；`refresh-service.ts:441-453` 仅在 `saved && credential_changed` 时重试。`tests/integration/scheduler/refresh-service.test.ts > t492 AC-003: credential-unchanged re-login ...` 与 `tests/unit/ipc/auth-ipc.test.ts > t492: 无 refresh token 但 Bearer 仍有效时只更新 cookie` 实测通过。

### 本轮新发现

- 无（0 条）。修复过程未引入新的可观测缺陷：`npx tsc --noEmit` 通过；`eslint` 与 `prettier --check` 对全部改动文件通过；`trySilentCookieRefresh` 的唯一生产调用点已同步新签名（`index.ts:397`），无遗留布尔用法；安全面（localStorage key 经 `JSON.stringify` 转义注入、续期失败日志不含 refresh token、请求体仅走 HTTPS 端点）、契约面（`RefreshServiceDeps.sessionLogin` 新返回 `{saved, credential_changed}` 仅此一处实现，`docs/specs/scheduler.md`/`connector-runtime.md`/`connector-session.md` 已同步）、错误处理面（`capture_refresh_token` 与 `refresh_kimi_web_session` 均显式告警不吞错）均无命中。

## 结论

- 前轮 finding 复核：f001 已消除、f002 已消除、f003 已消除、f004 已消除、f005 已消除、f006 已消除（6/6，均以 diff 与代码为准）。
- 本轮新发现：0 条。
- 未进表的提示（文件过大，`wc -l`；本 task 均净增这些文件，按降级规则只列示）：`src/main/index.ts` 1537 行、`src/main/core/scheduler/refresh-service.ts` 577 行、`src/main/ipc/auth-ipc.ts` 424 行（实现源码阈值 400）；测试 `tests/integration/scheduler/refresh-service.test.ts` 1812 行、`tests/unit/session/session-manager.test.ts` 873 行、`tests/unit/ipc/auth-ipc.test.ts` 860 行（测试源码阈值 600/1200）。新增文件未超阈值：`kimi_web_token_refresher.ts` 145、`connectors/kimi_web/connector.ts` 173、`provider_card_states.tsx` 184。
- 复杂度提示：`refresh-service.ts` 刷新主流程 CC≥10（t155/t172 起的既有结构），本 task 仅加 1 个 `else if` 分支，未新增可观测缺陷；`trySilentCookieRefresh` / `refresh_kimi_web_session` 分支中等（\<15）。
- 范围外观察（不进 finding 表）：①`saved && credential_changed` 门槛对所有 session 连接器生效（Round 1 已记，本 task 未加剧）；②`tests/unit/ipc/auth-ipc.test.ts` 仍 7 例（含改写后的 `uses instance-scoped partition …`）因 fixture 缺 `manifestId` 长期红，根因 `p236` 已在 base 复现；③renderer 项目本机整体 `React.act is not a function`（base 同样），`provider_card_states.test.tsx` 的 AC-006 渲染断言无法本地执行；④`SilentRefreshResult` 导出但仅模块内使用，属类型文档化导出，无碍。
- AC 复验方式：
    - AC-001：`re_verified`——重跑 `npx vitest run --project node tests/integration/scheduler/refresh-service.test.ts -t t492`（2 passed，含 401→`sessionLogin` 换新凭据→重试成功）+ 审阅 `refresh-service.ts:441-467`；登录窗取 refresh token 的时机由 s039 实测（`report.md:56/105`）与 `session-manager.ts:146-172/296-301` 佐证。
    - AC-002：`re_verified`——重跑 `tests/unit/ipc/auth-ipc.test.ts -t t492`（7 passed）与 `tests/unit/auth/kimi_web_token_refresher.test.ts`（9 passed）。
    - AC-003：`re_verified`——重跑 `refresh-service.test.ts -t t492`（credential-unchanged 不重试用例 pass）+ 审阅 `auth-ipc.ts:374-382`、`refresh-service.ts:441-453`。
    - AC-004：`re_verified`——`auth-ipc.test.ts -t t492` 断言写回保留 `session_id`/`device_id`、cookie 更新、refresh token 轮换落盘；`session-manager.test.ts` 3 例通过。
    - AC-005：`re_verified`——审阅 diff 确认 t469 两条「原样保留过期 authorization」假绿用例整体删除并替换；`kimi_web_token_refresher.test.ts`（9）/`kimi_web_connector.test.ts`（6）/`auth-error.test.ts`（8）通过。
    - AC-006：`re_verified`（文案与判定链）——`kimi_web_connector.test.ts` 断言 401 映射为「Kimi 网页会话已失效…」、不含 `HTTP \d{3}` 且 `is_auth_error` 仍为 true；`auth-error.test.ts` 断言映射文案。渲染层「重新登录」入口断言因本机 `React.act` 故障未能执行（依赖实施侧证据 `provider_card_states.test.tsx`）。
    - AC-007：`trust_prior`——`[deploy]`，需真实账号 ≥20 分钟连续采集，依赖 handoff/`task.md` 的部署验收声明，无本地证据。
    - coverage = re_verified / 总 AC 数 = 6 / 7；`trust_prior` 占比 1/7（\<30%）。
- 总体判断：Round 1 的 1 critical（f001）+ 1 important（f002）均已随本 diff 消除，本轮无新增 critical/important，可 PASS。
- 系统性 follow-up：已有 `p236`（t471 fixture 迁移遗留，本 task 已引用）；Round 1 建议的「kimi_web 续期 HTTP 接代理」已由本 diff 落地，无需另开 follow-up。

verdict: PASS

## Round 3 (2026-09-16 09:41 UTC+8)

reviewed_scope: b7e27fe30c043923

### 本轮变更确认（依据：`git -C '/Users/testuser/kar/code/omni_panel_t492' diff 302fb4be30040b2041fd6eebcdf42c5fe8833659` 与文件 mtime）

- 相对 Round 2（报告落盘 09:36）唯一改动：`tests/unit/ipc/auth-ipc.test.ts` 新增用例「t492: 实例没有任何 kimi 凭据时不报成功也不写入」（`tests/unit/ipc/auth-ipc.test.ts:766-773`）。mtime 佐证：全部交付文件中仅该文件在 09:36 之后被写（09:37:33），其余 22 个改动文件均早于 Round 2 落盘。据此 **代码（非测试）面相对 Round 2 完全未变**。
- 新增用例覆盖 `trySilentCookieRefresh` → `refresh_kimi_web_session` 的「vault 无 secret」分支（`src/main/ipc/auth-ipc.ts:343-347`：`existing` 为 null → `NO_SILENT_REFRESH`）：断言 `{refreshed:false, credential_changed:false}` 且 `kimi-absent:SESSION_COOKIE` 未被写入。用例走真实 `trySilentCookieRefresh`（仅 configStore/secretsStore/cookie store 为 fake），未 patch 被测逻辑，且未提供 `kimi_web_refresh` 时该分支在触网前即返回。实测通过。

### 前轮 finding 复核（代码面自 Round 2 未变，逐条确认修复仍在位）

- **t492_code_f001（critical）——仍已消除**：`capture_refresh_token`（`session-manager.ts:146-172`）仍在页面存活期由带 `authorization` 的请求触发；`read_local_storage`（`src/main/index.ts:735-745`）保留 `isDestroyed()` 守卫。原「closed 后读取必失败」路径未回归。
- **t492_code_f002（important）——仍已消除**：`src/main/index.ts:405-409` 仍向 `trySilentCookieRefresh` 传 `get_proxy_url`；`auth-ipc.ts:385-388` 仍据此调 `refresh_kimi_web_tokens(token, {get_proxy_url})`。
- **t492_code_f003（minor）——仍已消除**：`connectors/kimi_web/connector.ts:34` 仍为 `/HTTP\s+40[13]\b/`。
- **t492_code_f004（minor）——仍已消除**：`AuthRecoveryRow`（`provider_card_states.tsx:35-63`）仍为共用组件，文案取 `AUTH_ERROR_DISPLAY_TEXT`；renderer 内无第二份「凭证失效，请重新登录」字面量。
- **t492_code_f005（minor）——仍已消除**：`docs/specs/connector-session.md` 字段列举仍不含 `access_expires_at`。
- **t492_code_f006（minor）——仍已消除**：旧凭据分支仍显式传 `{credential_changed:false}`（`auth-ipc.ts:374-382`）；`refresh-service.ts:441-453` 仍仅 `saved && credential_changed` 才重试。

### 本轮新发现

- 代码轴：0 条。本轮 delta 为测试层（属 test reviewer 职责），代码（非测试）面与 Round 2 一致，未引入新的可观测缺陷；新增用例本身未见 mock 误用（走真实 `trySilentCookieRefresh`，未替换被测逻辑）。

## 结论

- 前轮 finding 复核：f001–f006 全部仍已消除（代码面自 Round 2 未变，以 diff 与 mtime 佐证）。
- 本轮新发现：0 条。
- 未进表的提示（文件过大，`wc -l`；本 task 均净增，按降级规则仅列示）：`src/main/index.ts` 1537、`src/main/core/scheduler/refresh-service.ts` 577、`src/main/ipc/auth-ipc.ts` 424（实现源码阈值 400）；测试 `tests/integration/scheduler/refresh-service.test.ts` 1812、`tests/unit/session/session-manager.test.ts` 873、`tests/unit/ipc/auth-ipc.test.ts` 870（测试源码阈值 600/1200）。新增文件未超阈值：`kimi_web_token_refresher.ts` 145、`connectors/kimi_web/connector.ts` 173、`provider_card_states.tsx` 184。
- 复杂度提示：`refresh-service.ts` 刷新主流程 CC≥10（t155/t172 起的既有结构），本 task 仅加 1 个 `else if`；其余函数 \<15。同 Round 2，未新增可观测缺陷。
- 范围外观察（不进 finding 表）：①`tests/unit/ipc/auth-ipc.test.ts` 7 例、`tests/integration/scheduler/refresh-service.test.ts` 6 例因 t471 `manifestId` fixture 迁移未同步长期红（根因 `p236`，base `302fb4be` 已复现）；本轮复跑确认 `auth-ipc.test.ts` 仍 7 红 / 16 绿，新增 t492 用例不在红区。②renderer 本机整体 `React.act is not a function`（base 同样），`provider_card_states.test.tsx` 的 AC-006 渲染断言无法本地执行。两者均与本轮测试层 delta 无关。
- AC 复验方式：
    - AC-001：`re_verified`——重跑 `npx vitest run --project node tests/integration/scheduler/refresh-service.test.ts -t t492`（2 passed，含 401→续期换新 Bearer→重试成功）；代码 `refresh-service.ts:441-467`。
    - AC-002：`re_verified`——重跑 `tests/unit/ipc/auth-ipc.test.ts -t t492`（8 passed，含本轮新增「无凭据」用例）与 `tests/unit/auth/kimi_web_token_refresher.test.ts`（9 passed）。
    - AC-003：`re_verified`——`refresh-service.test.ts -t t492` credential-unchanged 用例 pass；`auth-ipc.ts:374-382`、`refresh-service.ts:441-453`。
    - AC-004：`re_verified`——`auth-ipc.test.ts -t t492` 断言写回保留 `session_id`/`device_id`、cookie 更新、refresh token 轮换落盘。
    - AC-005：`re_verified`——审阅 diff 确认 t469 假绿用例整体删除并替换；`kimi_web_token_refresher.test.ts`（9）/`kimi_web_connector.test.ts`（6）/`auth-error.test.ts`（8）通过。
    - AC-006：`re_verified`（文案与判定链）——`kimi_web_connector.test.ts`（6 passed）断言 401 映射为「Kimi 网页会话已失效…」且 `is_auth_error` 仍为 true；`auth-error.test.ts`（8 passed）断言映射文案。渲染层「重新登录」入口因本机 `React.act` 故障未本地执行，依赖实施侧证据。
    - AC-007：`trust_prior`——`[deploy]`，需真实账号 ≥20 分钟连续采集，依赖实施侧部署验收声明，无本地证据。
    - coverage = re_verified / 总 AC 数 = 6 / 7；`trust_prior` 占比 1/7（\<30%）。
- 总体判断：本轮 delta 仅为一条 auth-ipc 测试用例，代码（非测试）面与 Round 2 一致，Round 2 的 6 条 finding 修复仍全部在位，无新增 critical/important，本轮可 PASS。
- 系统性 follow-up：已有 `p236`（t471 fixture 迁移遗留）；本轮无新增建议。

verdict: PASS

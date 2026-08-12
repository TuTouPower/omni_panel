# Task review t337（reviewer_focus: 代码）

- task：`t337_opencode_web_login_cookie_validate`
- spec：`docs/tasks/t337_opencode_web_login_cookie_validate/spec.md`
- diff_anchor：`f828251c17ec9ac6891943c67b2d237d3d30cddf`
- target：`git diff f828251c17ec9ac6891943c67b2d237d3d30cddf`
- round：1
- reviewed_at：2026-08-13 04:06 UTC+8
  reviewed_scope: 7d3e1f47bd33b04c

## Findings

### t337_code_f001 - auth-ipc cookieLogin 轮询路径丢弃 reason，web 编辑态登录态无效仍显示「未捕获到 Cookie」歧义文案（AC-004 部分未达）

- 严重度：important
- 锚点：AC-004（renderer 在登录态无效时显示可读提示，非「未捕获到 Cookie」歧义文案）
- 位置：`src/main/ipc/auth-ipc.ts:105-114`（110-111 硬编码 `state.error`）、`src/renderer/lib/cookie_login_poll.ts:116-121`、`src/renderer/components/WebLoginSection.tsx:51,67-74`
- 问题：`sessionManager.start_login` 有两条 IPC 入口，reason 只贯通了 session-ipc（`SESSION_LOGIN` 阻塞路径）→ WebLoginSection（`WebLoginSection.tsx:67-74`）。auth-ipc `handleCookieLogin`（`AUTH_COOKIE_LOGIN`，经 `startCookieLogin` 轮询）在 `auth-ipc.ts:108-111` 只判 `result.data.saved`，`result.data.reason` 被丢弃，`!saved` 一律硬编码 `state.error = "未捕获到 Cookie，请完成登录后再关闭窗口"`。该路径被 `WebLoginSection.handle_login` 的 web 编辑态（`is_web() && instance_id`，`WebLoginSection.tsx:51`）与 SettingsForm/SessionSection 共用的 `poll_cookie_login`（`cookie_login_poll.ts:99,116-120`）消费。复现路径：web 编辑态登录 opencode_go，回跳首请求带匿名 cookie 被判 `invalid_cookie`，用户看到的仍是歧义的「未捕获到 Cookie」，AC-004 要求的两类文案区分仅覆盖桌面阻塞路径。
- 建议：`auth-ipc.ts:110-111` 判 `result.data.reason === "invalid_cookie"` 时置 `state.error = "登录态无效，请重新登录或手动粘贴 Cookie"`（与 `COOKIE_LOGIN_MESSAGES.invalid_cookie` 同文案）；或让 `poll_cookie_login` 透传 reason。

### t337_code_f002 - is_valid_opencode_login 判定较 connector 宽松，存在「判有效但采集仍失败」残余窗口

- 严重度：minor
- 锚点：上下文区「探测复用 connector /auth 判定」（表述与实现不一致，近似判定）
- 位置：`src/main/core/session/session-manager.ts:277-279`；对照 `connectors/opencode_go/connector.ts:34-37,355-358`
- 问题：verify 用 `location?.includes("workspace") === true`，connector 用 `/\/workspace\/([^/?#]+)/` 提取 workspace id 并强校验。任何 3xx 且 Location 含 "workspace" 子串、但不含 `/workspace/<id>` 形态的响应（如 `302 → /login?next=workspace`、`302 → /workspace` 落地页），会被 verify 判有效并落库，随后 connector `/auth` 判定失败——p148 症状经另一入口复现。
- 建议：把 connector 的 workspace-id 提取逻辑抽出共用，verify 判定与 connector 保持一致，或至少匹配 `/workspace/` 前缀形态。

### t337_code_f003 - verify_cookie 对全部 provider 无条件套用 opencode 专用启发式

- 严重度：minor
- 位置：`src/main/index.ts:602-620`（单例注入 `SessionManagerDeps.verify_cookie`，`session-manager.ts:44,159`）
- 问题：`verify_cookie` 是 deps 上单一实现，对所有调用 `start_login` 的 provider 无条件生效（`session-manager.ts:159-171` 无 provider 过滤）。当前仅 opencode_go 为 `web_login`（grok/kimi 为 oauth_device、mimo auth=None，不触发 start_login），无现成回归；未来新增 web_login provider 时 3xx+workspace 启发式会被误套。`is_valid_opencode_login` 命名正确标记了 opencode 专用性，但注入点未按 provider 分派。
- 建议：注入处按 `provider === "opencode_go"` 分派，或把 provider 传入 verify_cookie 内部过滤，其余 provider 缺省跳过（行为与无注入一致）。

### t337_code_f004 - verify_cookie fetch 无超时，探测挂死时长时间占用 in_progress 登录锁

- 严重度：minor
- 位置：`src/main/index.ts:602-619`（`fetch` 无 AbortController/timeout）
- 问题：`save_cookie_on_close` 在 `await deps.verify_cookie` 期间不清锁（`session-manager.ts:159-171`，锁在 `finally` 才 `release_lock`）。`fetch` 无超时，若 `/auth` 慢或网络挂死（无 OS 层错误），`in_progress` 锁被长占，用户重登被「already in progress」拒绝。spec 上下文区「探测的超时/重试细节有意不测」指测试覆盖，不豁免机制缺超时；spec 风险区「探测失败按无效处理」也不覆盖挂死场景。
- 建议：fetch 加 `AbortController` 超时（如 10s），超时按无效处理（符合 spec 回退语义）。

## 结论

- 前轮 finding 复核：无（round 1）
- 本轮新发现：4 条（f001 important；f002/f003/f004 minor）
- 未进表的提示：
    - 文件过大：`src/main/index.ts` 1335 行（本 task 净增 24），主入口单体，超重要阈值系既有存量，非本 task 导致；`tests/unit/session/session-manager.test.ts` 661→752 行（净增 91），测试源码超 600 minor 阈值，本 task 新增 4 用例未拆分；均无伴随可观测缺陷，按降级规则只列路径与行数。
    - 复杂度：`save_cookie_on_close` 手算 CC≈6，未超阈值；`format_cookie_login_error` 分支多但为本 task 未改动存量。
    - 范围外观察：无。
- 总体判断：FAIL——reason 贯通在 auth-ipc 轮询路径缺失（f001），AC-004 仅部分落地，存在未解决 important；f002-f004 为 minor。
- 系统性 follow-up：建议标题「verify_cookie 按 provider 分派（opencode 专用判定与 connector 判定统一）」，slug `opencode_login_verify_provider_scoped`，非阻断。

### AC 复验披露

- AC-001：`re_verified`——代码 `session-manager.ts:159-170`（verify false → resolve `{saved:false, reason:"invalid_cookie"}`，resolve 前无 vault.set）+ 测试「cookie 未通过有效性校验时不保存」通过。
- AC-002：`re_verified`——测试「回跳首请求带匿名 cookie 时有效性校验拦截」通过，复用 p148 时序（auth 匿名 → IdP → 回调匿名 → invalid_cookie，vault 空）。
- AC-003：`re_verified`——代码 `session-manager.ts:173-184`（verify 通过 → vault.set → `saved:true`）+ 测试「cookie 通过有效性校验时正常保存」通过。
- AC-004：`re_verified`（部分）——桌面/web add 阻塞路径经 `web_login_section.test.tsx` 两个新用例（invalid_cookie 文案 + no_cookie 回归）通过；web 编辑态路径 reason 丢失，见 f001。
- AC-005：`re_verified`——手动粘贴走 SettingsForm `perform_save`（config/secrets 保存 + refresh），不触 `start_login`；verify_cookie 仅在 `start_login` 内生效，代码审视确认无改动。
- AC-006：`re_verified`——`session-manager.test.ts` 新增有效/无效/匿名时序 + `is_valid_opencode_login` 纯函数共 4 用例，跑通（该文件 29 tests 全绿）。
- 覆盖率：`coverage = re_verified / 6`（AC-004 部分）。

verdict: FAIL

## Round 2 (2026-08-13 04:20 UTC+8)

reviewed_scope: 15baf016f7e37515

### 前轮 finding 复核（以当前 diff 为准）

- **t337_code_f001（important）已修**：`src/main/ipc/auth-ipc.ts` `handleCookieLogin` 返回类型扩为 `IpcResult<{ saved: boolean; reason?: "invalid_cookie" | "no_cookie" }>`；`startCookieLogin`（auth-ipc.ts:110-114）按 `result.data.reason === "invalid_cookie"` 置「登录态无效，请重新登录或手动粘贴 Cookie」，否则回退原 no_cookie 文案。`cookie_login_poll.ts` 经 `status.error → format_cookie_login_error`（中文透传，cookie_login_poll.ts:88）把文案抛给 renderer。AC-004 web 编辑态链路（WebLoginSection `is_web()&&instance_id` → poll_cookie_login → cookieLogin → cookieLoginStatus.error）闭环。新增 `cookie_login_poll.test.ts`「透传登录态无效错误文案」+「未捕获到 Cookie 回归」两用例，连同 `web_login_section.test.tsx` 两个 AC-004 用例全部通过。
- **t337_code_f002（minor）已修**：`session-manager.ts` `is_valid_opencode_login` 改用 `/\/workspace\/([^/?#]+)/` 正则，与 connector `extract_workspace_id` 同口径；`session-manager.test.ts` 补 302+null、302+"" 边界用例（均 false）。
- **t337_code_f003（minor）按决策接受**：用户确认「接受当前实现」——当前仅 opencode_go 为 web_login provider，全局注入但仅 opencode.ai 命中 workspace 判定。minor 非阻断。注：task.md 处置表将 f003 标「已修」且 rationale 写「补 3xx+null/空 location 边界单测」，该 rationale 实际对应 f002 的 null-location 边界，与 f003 本体的 provider 分派无关；处置归属 implementer，不构成复核问题。
- **t337_code_f004（minor）已修**：`src/main/index.ts` verify_cookie fetch 加 `AbortController` + 10s `setTimeout(abort)`，`finally { clearTimeout(timer) }` 覆盖成功与异常路径；超时/异常 → catch 返回 false → 按无效处理不落库，锁在 `save_cookie_on_close` finally 释放。

### 本轮新发现

0 条。已扫 round-2 修复 diff：auth-ipc 返回类型放宽无消费方破坏（typecheck 通过，AUTH_COOKIE_LOGIN handler 结构兼容）；startCookieLogin 四分支（saved/!saved+invalid/!saved+其他/!ok）全覆盖；AbortController 无 timer 泄漏、无新竞态；regex 改动无新边界遗漏。

### 未进表的提示

- 文件过大：同 round 1（`src/main/index.ts` 1335 行、`tests/unit/session/session-manager.test.ts` 752 行，均既有存量，本 round 净增有限）。
- 复杂度：round-2 新增分支（auth-ipc startCookieLogin 三元 reason 判定、index.ts 内层 try/finally）均为低 CC，未超阈值。
- 范围外观察：无。

### 总体判断

PASS——f001（唯一 important）已修复并经测试验证，AC-004 双路径（桌面阻塞 + web 编辑态轮询）均达；f002/f004 minor 已修；f003 minor 按用户决策接受，均非阻断。round-1 无未解决 critical/important。

### AC 复验披露（Round 2）

- AC-001：`re_verified`——`session-manager.test.ts`「cookie 未通过有效性校验时不保存」通过，verify false → `{saved:false,reason:"invalid_cookie"}`，vault 无写。
- AC-002：`re_verified`——「回跳首请求带匿名 cookie 时有效性校验拦截」通过，p148 时序（auth 匿名 → IdP → 回调匿名）→ invalid_cookie，vault 空。
- AC-003：`re_verified`——「cookie 通过有效性校验时正常保存」+ `is_valid_opencode_login` 纯函数用例通过。
- AC-004：`re_verified`（全路径）——桌面/web add 阻塞路径经 `web_login_section.test.tsx` 两用例；web 编辑态轮询路径经 `cookie_login_poll.test.ts` 两用例，reason 已贯通。
- AC-005：`re_verified`——手动粘贴走 SettingsForm `perform_save`，不触 start_login，verify_cookie 仅在 start_login 内生效。
- AC-006：`re_verified`——`session-manager.test.ts` 新增有效/无效/匿名时序 + 纯函数边界共 5 用例，该文件 29 tests 全绿。
- 覆盖率：`coverage = re_verified / 6`。

verdict: PASS

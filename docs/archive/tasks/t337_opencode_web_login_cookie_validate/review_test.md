# Task review t337（reviewer_focus: 测试）

- task：`t337_opencode_web_login_cookie_validate`
- spec：`docs/tasks/t337_opencode_web_login_cookie_validate/spec.md`
- diff_anchor：`f828251c17ec9ac6891943c67b2d237d3d30cddf`
- target：`git diff f828251c17ec9ac6891943c67b2d237d3d30cddf`
- round：1
- reviewed_at：2026-08-13 04:20 UTC+8

## Findings

### t337_test_f001 - AC-004 在 web 编辑态（cookieLogin）路径未贯通 reason，该路径无效 cookie 仍显示歧义文案且无测试钉住

- 严重度：important
- 锚点：AC-004「renderer 在登录态无效时显示可读提示（非「未捕获到 Cookie」歧义文案），引导重新登录或手动粘贴」
- 位置：
    - `src/main/ipc/auth-ipc.ts:108-111`（`startCookieLogin` 结果处理：`result.ok && result.data.saved` 分支删 error，`result.ok` 且未 saved 时无条件 `state.error = "未捕获到 Cookie，请完成登录后再关闭窗口"`，丢失 `reason`）
    - `src/renderer/lib/cookie_login_poll.ts:119-121`（`if (!status.saved) throw new Error(COOKIE_LOGIN_MESSAGES.no_cookie)` / 第 125-127 行同，无 `reason` 分支）
    - 测试侧 `tests/unit/renderer/components/web_login_section.test.tsx:198-227`（AC-004 两用例只钉 `session.login` 桌面/添加路径）
- 问题：web 编辑态（`is_web() && instance_id`）经 `auth.cookieLogin` → `startCookieLogin` → `start_login`（`src/main/ipc/auth-ipc.ts:79-85`），本轮新增的 `verify_cookie` 同样执行；无效时 `start_login` 返回 `{saved:false, reason:"invalid_cookie"}`，但 `startCookieLogin`（auth-ipc.ts:108-111）把 `reason` 丢弃，恒写成 no_cookie 文案；`handleCookieLoginStatus` 回传该 error，`poll_cookie_login` 直接 throw no_cookie。用户在此可达路径看到「未捕获到 Cookie，请完成登录后再关闭窗口」——正是 AC-004 要消除的歧义文案。该路径本轮无测试钉住：新增 AC-004 测试 mock 的是 `window.usageboard.session.login`（桌面/添加分支），settings_form.test.tsx 的 web 编辑用例（`tests/unit/renderer/components/settings_form.test.tsx:579-607`）只测成功与 CONFLICT 失败，无 invalid_cookie 场景。AC-004 覆盖仅在一条 renderer 路径成立，另一条可达路径行为不满足该 AC。
- 建议：`startCookieLogin` / `handleCookieLoginStatus` 贯通 reason——`result.data.reason === "invalid_cookie"` 时 `state.error` 写 `COOKIE_LOGIN_MESSAGES.invalid_cookie`（或等效中文文案），`poll_cookie_login` 对 status.error 直接透传（现 `format_cookie_login_error` 对中文文案原样返回，可复用）；补 web 编辑态测试：mock `cookie_login` 返回 `{started:true}` + `cookie_login_status` 返回 `{in_progress:false, saved:false, error: COOKIE_LOGIN_MESSAGES.invalid_cookie}`（或 mock `cookie_login` 直接返回 `{saved:false, reason:"invalid_cookie"}`），断言渲染 `web-login-error-*` 显示 invalid_cookie 文案而非 no_cookie。

### t337_test_f002 - session-ipc reason 透传无测试

- 严重度：minor
- 锚点：AC-004（reason 贯通链契约）
- 位置：`tests/unit/ipc/session-ipc.test.ts`（13 用例均 mock `start_login` 返回无 `reason` 的 `{saved:true}` / `{saved:false}`）
- 问题：`handleSessionLogin` 透传 reason 靠 `ok(result)` 一行（`src/main/ipc/session-ipc.ts:55`），renderer AC-004 测试 mock 的是 `window.usageboard.session.login` 桥，IPC 层若将来剥离 `reason` 字段，组件测试不报红而真实链路 AC-004 静默失效。属「覆盖可更广」，不阻断。
- 建议：`tests/unit/ipc/session-ipc.test.ts` 补一用例 mock `start_login` resolve `{saved:false, reason:"invalid_cookie"}`，断言 `result.ok && result.data.reason === "invalid_cookie"`，闭环 reason 贯通链。

### t337_test_f003 - is_valid_opencode_login 边界未测（3xx 且 Location 为 null）

- 严重度：minor
- 锚点：AC-003 / AC-006（判定函数边界）
- 位置：`tests/unit/session/session-manager.test.ts:744-751`
- 问题：判定测试覆盖了 3xx+workspace 真、200 真、302+login 假、400+workspace 假，但未覆盖「3xx 且 Location 头缺失（null）」——`location?.includes("workspace") === true` 对 null 为 `undefined === true` → false，属真实重定向无 Location 头的场景；status 恰好 300/399 亦未测。均为 trivial 边界，不阻断。
- 建议：补 `is_valid_opencode_login(302, null)` → false，及 300/399 边界各一例。

## 结论

- 前轮 finding 复核（Round 1）：无
- 改测方向复核：无「迁就实现」改测。7 处 `{saved:false}` → `{saved:false, reason:"no_cookie"}`（`tests/unit/session/session-manager.test.ts:265,288,310,397,419,439,456`）是生产契约本意新增 `reason` 字段后的断言收紧（`toEqual` 精确匹配，旧断言本就失效），非弱化非反转，方向正确。
- 本轮新发现：3 条（f001 important，f002/f003 minor）
- 未进表的提示：
    - `verify_cookie` 注入为全局（`src/main/index.ts:599-616`），但实测仅 `connectors/opencode_go/manifest.json` 用 `web_login` 捕获路径（mimo 等非 web_login），生产无其它 provider 误伤，属代码层观察不计 finding。
    - AC-004 桌面测试未断言 invalid 时 `onSecrets` 不被调用（生产 early-return 已保证，且 AC-001 在 manager 层钉了不落库），可选加强。
- 总体判断：AC-001/002/003/005/006 测试完整且真触达生产逻辑（run 全绿：session-manager 29、web_login_section 9、session-ipc 13、auth-ipc 15、settings_form 39）；AC-004 覆盖不全——web 编辑态可达路径上 reason 被生产丢弃且无测试。未解决 important 1 条 → FAIL。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：re_verified——重跑 `tests/unit/session/session-manager.test.ts`（29 绿），用例断言 `{saved:false, reason:"invalid_cookie"}`、vault 不写、`verify_cookie` 以 `("session=invalid","https://opencode.ai/auth")` 被调。
- AC-002：re_verified——重跑通过；逐行追踪通配时序（auth 页匿名 → IdP → 回跳 `/auth/callback` 匿名），anon cookie 确在回跳后才捕获、再被 verify 拦截，复现 p148 场景且不再判成功。
- AC-003：re_verified——重跑通过；`saved:true` + vault 写入 + `verify_cookie` 被调；`is_valid_opencode_login` 判定矩阵逐例核对。
- AC-004：re_verified（桌面/添加路径）——重跑 web_login_section 用例断言 invalid_cookie 文案与 not-contains no_cookie；**web 编辑态路径未复验通过**（见 f001，该路径行为不满足 AC-004）。
- AC-005：re_verified——`tests/unit/renderer/components/settings_form.test.tsx:609` 手动粘贴走保存路径（onSave 触发、不经 session.login/cookieLogin），重跑 settings_form（39 绿）。
- AC-006：re_verified——session-manager.test.ts 新增有效/无效/匿名回跳三场景用例，全部重跑通过。

coverage = 6 / 6（其中 AC-004 桌面路径 re_verified，web 编辑态路径存在未解决缺口，见 f001）

reviewed_scope: 7d3e1f47bd33b04c

verdict: FAIL

## Round 2 (2026-08-13 04:25 UTC+8)

## Findings

### t337_test_f004 - auth-ipc startCookieLogin 的 reason→文案映射无直接单测

- 严重度：minor
- 锚点：AC-004（web 编辑态路径链的中间环节）
- 位置：`src/main/ipc/auth-ipc.ts:108-115`（`startCookieLogin` 中 `result.data.reason === "invalid_cookie" ? "登录态无效…" : "未捕获到 Cookie…"`）；测试侧 `tests/unit/ipc/auth-ipc.test.ts`（grep `invalid_cookie`/`reason`/`登录态无效` 零命中）
- 问题：f001 修复后，web 编辑态整链为 `start_login(reason) → handleCookieLogin → startCookieLogin(reason→state.error 文案) → cookieLoginStatus → poll_cookie_login(透传) → WebLoginSection 显示`。poll 层透传已由 `tests/unit/renderer/lib/cookie_login_poll.test.ts` 两用例钉住，但 auth-ipc 的 reason→文案映射本身无单测——若该映射被改坏（再次丢弃 reason），`cookie_login_poll.test` 因直接 mock window 桥的 `status.error` 仍全绿，web 编辑态会静默回归 no_cookie 歧义文案。生产当前正确（逐行核对映射），属「覆盖可更广」，不阻断。
- 建议：`tests/unit/ipc/auth-ipc.test.ts` 补一用例——mock `start_login` resolve `{saved:false, reason:"invalid_cookie"}`，调 `startCookieLogin` 后再调 `handleCookieLoginStatus`，断言返回 `error` 为「登录态无效，请重新登录或手动粘贴 Cookie」，闭环 auth-ipc 映射环节。

## 结论

- 前轮 finding 复核（Round 2，以 diff 为准）：
    - t337_test_f001（important）已修：生产 `auth-ipc.ts:108-115` 贯通 reason 并按 invalid_cookie/no_cookie 区分文案；`cookie_login_poll.ts` 走 `status.error` 透传中文；`cookie_login_poll.test.ts` 新增「透传登录态无效」「未捕获仍 no_cookie」两用例真触达 `poll_cookie_login` 生产逻辑。AC-004 web 编辑态路径行为已满足。
    - t337_test_f002（minor）已修：`session-ipc.test.ts` 新增「透传 start_login 的 reason」用例，断言 `result.data` `toEqual({saved:false, reason:"invalid_cookie"})`。
    - t337_test_f003（minor）已修：`session-manager.test.ts` 新增 `(302,null)→false`、`(302,"")→false` 边界断言；实现同步改为 `/\/workspace\/([^/?#]+)/`（对齐 `connectors/opencode_go/connector.ts:356-358` 同正则 + 3xx 判定），既有断言（含 `(301,"https://opencode.ai/workspace/wrk_123")`）在新语义下仍绿，非迁就实现。
- 改测方向复核：无「迁就实现」改测。`cookie_login_poll.test.ts` 仅 1 处 timeout 用例 mock 单行化重排，非断言变更。
- 本轮新发现：1 条（f004 minor）。
- 未进表的提示：
    - Round 1 `reviewed_scope` 行值 `7d3e1f47bd33b04c` 非脚本口径（`sha1(diff_bytes)[:16]` + 固定排除集）实算值，系 Round 1 笔误；本轮以脚本同口径实算 `15baf016f7e37515` 为准。
    - `verify_cookie` 新增 10s AbortController 超时（`src/main/index.ts:599-620`）属 spec「有意不测」的超时细节，不出 finding。
    - `is_valid_opencode_login` 现要求 `/workspace/<id>` 形态（比 spec 文案「含 workspace」更严格），但完全对齐 connector 判定，真实回跳 URL 带 id（`session-manager.test.ts:235` `https://opencode.ai/workspace/workspace-1`），无行为分叉。
- 总体判断：f001/f002/f003 全部消除，AC-001~006 生产行为与测试均成立（本轮重跑 6 套件 115 用例全绿）；仅剩 f004 一条 minor 覆盖扩展建议，无未解决 critical/important → PASS。
- 系统性 follow-up：无

### AC 复验方式（Round 2）

- AC-001/002/003/005/006：re_verified——维持 Round 1 复验，重跑全部相关套件仍绿（session-manager 29、web_login_section 9、settings_form 39、session-ipc 14、auth-ipc 15、cookie_login_poll 9）。
- AC-004：re_verified——桌面/添加路径由 web_login_section.test.tsx 钉住；web 编辑态路径生产贯通逐行核对（auth-ipc.ts:108-115 映射 + cookie_login_poll.ts `status.error` 透传），poll 层透传由 cookie_login_poll.test.ts 两用例钉住并重跑通过。auth-ipc 映射环节无直接单测（见 f004，trust_prior，依赖代码逐行核对 + poll 层测试间接验证）。

coverage = 6 / 6（AC-004 含一项 minor 覆盖扩展建议，不阻断）

reviewed_scope: 15baf016f7e37515

verdict: PASS

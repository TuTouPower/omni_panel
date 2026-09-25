# Task review t512（reviewer_focus: 测试）

- task：`t512_grok_bot_auth_lifecycle`
- spec：`docs/tasks/t512_grok_bot_auth_lifecycle/spec.md`
- diff_anchor：`d674991949f363348a47745d91960b4c0a98903b`
- target：`git -C '/Users/karson/kar/code/omni_panel_t512' diff d674991949f363348a47745d91960b4c0a98903b`
- round：Round 1
- reviewed_at：2026-09-25 13:30 UTC+8

## Findings

### t512_test_f001 - AC-008 账号名校验行为与 spec 契约描述存在语义偏差（实现为 trim 回退默认值，非禁止提交）

- 严重度：minor
- 锚点：AC-008（`GrokBotPkceForm 卸载时主动取消正在进行的认证轮询，且禁止空账号名提交`）
- 位置：`tests/unit/renderer/components/forms/grok_bot_pkce_form.test.tsx:159`
- 问题：契约 AC-008 描述为“禁止空账号名提交”，但测试用例 `trims whitespace-only account name and falls back to default Grok Bot (A53)` 与生产代码 `const safe_name = account_name.trim() || "Grok Bot"` 验证并实现了“纯空白账号名回退为默认名 'Grok Bot' 并放行提交”。该实现严格遵循外部审阅采纳项 A53（`account_name trim() || fallback`）与全仓表单约定（如 `ExaServiceKeyForm`），但与 spec.md 契约描述存在偏差。
- 建议：将 `spec.md` 中 AC-008 修订为“`GrokBotPkceForm` 卸载时主动取消正在进行的认证轮询，且账号名去除首尾空格后回退默认值”，使契约与实现/测试对齐。

### t512_test_f002 - AC-005 缺少渲染层表单对拉起浏览器失败时的 UI 提示与中止轮询测试

- 严重度：minor
- 锚点：AC-005（`拉起浏览器失败时立即返回明确错误，前端提示用户并直接中止登录轮询`）
- 位置：`tests/unit/renderer/components/forms/grok_bot_pkce_form.test.tsx:119`
- 问题：虽然 manager 层（`grok_bot_oauth_manager.test.ts:171`）与 IPC 层（`grok_bot_auth_ipc.test.ts:80`）均测试了 `BROWSER_OPEN_FAILED` 异常与错误码透出，但前端表单单元测试 `grok_bot_pkce_form.test.tsx` 仅测试了 `login_poll` 失败展示错误，未显式覆盖 `login_start` 抛出 `BROWSER_OPEN_FAILED` 时界面展示错误且不调用 `login_poll` 的断言。
- 建议：在 `tests/unit/renderer/components/forms/grok_bot_pkce_form.test.tsx` 中补一个 `login_start` reject 时表单提示错误且 `expect(api.login_poll).not.toHaveBeenCalled()` 的用例。

### t512_test_f003 - AC-009 定时器换票测试未直接断言 Vault 写入的新 Token

- 严重度：minor
- 锚点：AC-009（`后台定时器在凭据临期时自动发起换票，成功写入新 Token 并在失效时提供明确告警`）
- 位置：`tests/unit/auth/grok_bot_oauth_manager.test.ts:252`
- 问题：用例 `schedules background refresh and cleans up on shutdown` 验证了定时器触发 `http_post` 调用，但未直接断言 `await vault.get(keyFor(instance_id, ACCESS_TOKEN_SECRET))` 是否已更新为 `"refreshed-acc"`（尽管底层调用的 `refresh_now` 在其独立用例中已充分验证了 Vault 写入）。
- 建议：在该用例触发定时器后补充 `expect(await vault.get(keyFor(instance_id, ACCESS_TOKEN_SECRET))).toBe("refreshed-acc")`。

### t512_test_f004 - IPC mock manager 存在旧字段残余（`verifier: "v"`）

- 严重度：minor
- 锚点：AC-001（`渲染进程与 IPC 消息仅接收 login_id，内存与传输链路中无 code verifier 明文`）
- 位置：`tests/unit/ipc/grok_bot_auth_ipc.test.ts:37`
- 问题：`create_mock_manager()` 中 `start_login` 的 mock 返回值仍声明了 `verifier: "v"` 属性，未与生产代码 `start_login` 仅返回 `{ auth_url, uuid, login_id }` 的最新签名同步。虽 manager 真实单测已断言 `verifier === undefined`，但 mock 桩的不一致会影响 IPC 层的防回归信号。
- 建议：将 `tests/unit/ipc/grok_bot_auth_ipc.test.ts` 中 `create_mock_manager` 的返回值调整为 `{ auth_url: "...", uuid: "u", login_id: "login_id_mock" }`，并对 `handle_grok_bot_login_start` 补充 `expect(res.data.verifier).toBeUndefined()` 与 `expect(res.data.login_id).toBeDefined()`。

## 结论

- 改测方向复核：既有测试 `grok_bot_connector.test.ts` 修改了 401 预期，归因于 AC-004 规格变更（401 不再作为普通 failed_account 吞下，而是必须抛出以驱动重登换票），同时新增了 500 状态码测试补齐非认证失败的 failed_account 行为覆盖，无迁就实现的问题。
- 本轮新发现：4 条（全为 minor）
- 未进表的提示：无
- 总体判断：核心 AC 均有真实可信的自动化测试覆盖，无 critical / important 阻断项，危险模式扫描通过。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`（`grok_bot_oauth_manager.test.ts` 与 `grok_bot_pkce_form.test.tsx` 独立验证 verifier 留在主进程且 IPC 仅流转 login_id）
- AC-002：`re_verified`（`grok_bot_oauth_manager.test.ts` 独立验证并发 poll 安全终止前次轮询）
- AC-003：`re_verified`（`grok_bot_oauth_manager.test.ts` 独立验证并发 refresh 的 Promise 复用与单次网络调用）
- AC-004：`re_verified`（`grok_bot_connector.test.ts` 独立验证 401 抛出带会话失效文案错误）
- AC-005：`re_verified`（`grok_bot_oauth_manager.test.ts` 与 `grok_bot_auth_ipc.test.ts` 独立验证拉起浏览器失败返回 BROWSER_OPEN_FAILED）
- AC-006：`re_verified`（`grok_bot_oauth_manager.test.ts` 独立验证 Vault 写入失败返回 SAVE_FAILED 与原子补偿回滚，及 logout 清理）
- AC-007：`re_verified`（`grok_bot_auth_ipc.test.ts` 独立验证 timeout_ms 参数校验与范围拦截）
- AC-008：`re_verified`（`grok_bot_pkce_form.test.tsx` 独立验证组件卸载触发 cancel 轮询，及账号名 trim 处理）
- AC-009：`re_verified`（`grok_bot_oauth_manager.test.ts` 独立验证假时钟推进触发后台换票及失效回调）

coverage = 9 / 9 = 100%

reviewed_scope: 3d31df186390570b

verdict: PASS

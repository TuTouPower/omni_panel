# Task review t504（reviewer_focus: 代码）

- task：`t504_web_session_keepalive_unification`
- spec：`docs/tasks/t504_web_session_keepalive_unification/spec.md`
- diff_anchor：`c01c5e0613564e916458ca2ef6829d28c4e008e7`
- target：`git -C '/Users/testuser/kar/code/omni_panel_t504' diff c01c5e0613564e916458ca2ef6829d28c4e008e7`
- round：Round 1
- reviewed_at：2026-09-20 04:02 UTC+8

## Findings

Round 1 零 finding。

## 结论

- 本轮新发现：0 条
- 未进表的提示：无
- 总体判断：代码改动精准内聚，完全消除了针对 `kimi_web` 的硬编码分支，对所有 `capabilities: ["session"]` 连接器建立了一致的凭据失效判定、后台隐藏窗口自愈、换新凭据自动关窗与 30s 安全超时管线，未引入范围外改动或架构反模式。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`，代码见 `src/shared/lib/auth-error.ts:24-26`，单测 `tests/unit/shared/auth-error.test.ts` 覆盖 OpenCode 与 MiMo 会话失效文案。
- AC-002：`re_verified`，代码见 `src/main/core/scheduler/refresh-service.ts:469` 与 `src/main/index.ts:418-425`，集成测试 `tests/integration/scheduler/refresh-service.test.ts` 验证 OpenCode 与 MiMo 错误自动进入 sessionLogin 并重试成功。
- AC-003：`re_verified`，代码见 `src/main/ipc/auth-ipc.ts:148`，`options.auto === true` 时无条件传 `hidden: true`，单测 `tests/unit/ipc/auth-ipc.test.ts` 断言参数。
- AC-004：`re_verified`，代码见 `src/main/core/session/session-manager.ts:206-258`，比对凭证差异及 `verify_cookie` 探测，单测 `tests/unit/session/session-manager.test.ts` 断言自动关窗并落库。
- AC-005：`re_verified`，代码见 `src/main/ipc/auth-ipc.ts:149` 设 30s 超时，超时走 `finish_with_error` 销毁窗口并由上层置 `failed`，单测覆盖。
- AC-006：`re_verified`，代码重构消除了 `auth-ipc.ts` 和 `session-manager.ts` 的 `provider === "kimi_web"` 专属分支，kimi_web 既有 25 项测试全部回归绿灯。
- AC-007：`re_verified`，在 `tests/unit/session/session-manager.test.ts` 与 `tests/integration/scheduler/refresh-service.test.ts` 中新增覆盖 OpenCode 与 MiMo 的专项测试。

coverage = 7 / 7 = 100%

reviewed_scope: db6f61d114e38da8
verdict: PASS

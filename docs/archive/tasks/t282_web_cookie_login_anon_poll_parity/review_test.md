# Test review — t282

reviewed_scope: 558c997cabf70eac

## Round 1 (2026-08-10 21:20 UTC+8)

### 范围

新增/扩展测试：

- `tests/unit/renderer/lib/cookie_login_poll.test.ts` — 错误映射 + poll 成功/超时/冲突
- `tests/unit/renderer/components/web_login_section.test.tsx` — web edit poll、冲突中文、120s 超时、web 匿名指引、桌面 session.login 回归、匿名冲突中文
- `tests/unit/ipc/auth-ipc.test.ts` — `startCookieLogin` CONFLICT（is_login_in_progress / state.in_progress）
- `tests/unit/renderer/components/settings_form.test.tsx` — 120s 超时 + CONFLICT 中文
- `tests/unit/renderer/components/forms/web_login_form.test.tsx` — 超时文案对齐中文（语义更新，非改弱断言）

### AC 测试覆盖

| AC | 证据 | 结论 |
| -- | ---- | ---- |
| AC-001 | `web_login_section` 断言 anon guide + 手动粘贴入口仍在 | 覆盖 |
| AC-002 | 两组件测试均走 cookieLogin/status；共享模块单测 | 覆盖 |
| AC-003 | auth-ipc CONFLICT；UI 两处 CONFLICT 无英文原文 | 覆盖 |
| AC-004 | poll 单测 + WebLoginSection/SettingsForm fakeTimers 超时 | 覆盖 |
| AC-005 | desktop path `session.login` 且不调 cookieLogin；既有 settings_form web_login 桌面路径 | 覆盖（单元）；electron e2e 未跑（build 成本，AC 已单测触达生产逻辑） |

### 质量

- 超时用例用 `fireEvent` + `vi.advanceTimersByTimeAsync`，避开 userEvent+fakeTimers 挂死。
- 假绿风险：poll 单测直接调用生产 `poll_cookie_login`，非 mock 掉被测逻辑。
- `startCookieLogin` 断言 `start_login` 不触发 / CONFLICT 中文，触达 auth-ipc 生产分支。

### Findings

无。

### 结论段提示（不进表）

- electron e2e `add_account.spec.ts`（opencode_go web-login 表单）未在本轮跑；AC-005 由单元路径保证桌面仍 `session.login`。若需 E2E 加固可 follow-up。

verdict: PASS

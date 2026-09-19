# Task review t505（reviewer_focus: 代码）

- task：`t505_session_login_preemption`
- spec：`docs/tasks/t505_session_login_preemption/spec.md`
- diff_anchor：`08c00e9137a4d1dd4a5705441fbcf5d98b28d825`
- target：`git -C '/Users/testuser/kar/code/omni_panel_t505' diff 08c00e9137a4d1dd4a5705441fbcf5d98b28d825`
- round：Round 1
- reviewed_at：2026-09-20 04:52 UTC+8

## Findings

Round 1 零 finding。

## 结论

- 本轮新发现：0 条
- 未进表的提示：无
- 总体判断：锁结构由无差别 Set 升级为 Map\<string, ActiveLoginSession>，实现了前台可见登录对后台隐藏会话的干净抢占（cancel、window.close、释放锁、启动新窗口），同类型与前台并发防护完备，无资源泄漏或死锁风险。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`，代码见 `src/main/core/session/session-manager.ts:133-143`，单测 `tests/unit/session/session-manager.test.ts` 验证前台登录不再抛出 CONFLICT。
- AC-002：`re_verified`，代码见 `src/main/core/session/session-manager.ts:138` 调用 `existing.cancel()` 并关闭窗口，单测验证后台 promise reject 且窗口 closed=true。
- AC-003：`re_verified`，代码见 `src/main/core/session/session-manager.ts:144`，前台并发时仍正常抛出 CONFLICT，单测覆盖。
- AC-004：`re_verified`，代码见 `src/main/core/session/session-manager.ts:144`，后台并发时仍正常抛出 CONFLICT，单测覆盖。
- AC-005：`re_verified`，单测验证抢占后前台窗口正常捕获 Cookie 并落库至 Vault。
- AC-006：`re_verified`，`tests/unit/session/session-manager.test.ts` 与 `tests/unit/ipc/auth-ipc.test.ts` 新增全量通过。

coverage = 6 / 6 = 100%

reviewed_scope: 3b10b4354bdd4413
verdict: PASS

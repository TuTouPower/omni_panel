# Task review t155（reviewer_focus: 代码）

- task：`t155_auth_error_no_retry`
- spec：`docs/tasks/t155_auth_error_no_retry/spec.md`
- diff_anchor：`73785a2838839268d8283e05ff56130ce825ba9d`
- target：`git diff 73785a2838839268d8283e05ff56130ce825ba9d`
- round：2
- reviewed_at：2026-07-27 03:32 UTC+8

## Findings

无。

## 结论

- 前轮 finding 复核：
    - `t155_code_f001`：已修。`is_auth_error` 中 "invalid key" 的匹配已收紧为 `/\binvalid\b.*\bkey\b/`，"key" 不再作为其他单词子串被误判。
    - `t155_code_f002`：已修。`last_success_snapshot` 与 `is_auth_error` 之间仅保留 1 个空行，风格一致。
- 本轮新发现：0 条
- 总体判断：实现覆盖全部 4 条 AC。认证错误命中后立即 `break`，单次刷新只发 1 次请求；session 连接器在首次 auth error 时仍触发 `sessionLogin`，重登录成功后 `continue` 进入下一次 attempt；5xx / 非认证错误仍走原有重试路径；`execute_connector` seam 使单测可断言调用次数。代码通过 `typecheck` / `eslint`，相关测试通过。

验证命令与结果：

- `pnpm typecheck` — 通过
- `pnpm eslint src/main/core/scheduler/refresh-service.ts --max-warnings=0` — 通过
- `pnpm vitest run tests/unit/scheduler/error-classification.test.ts tests/unit/scheduler/refresh-service.test.ts` — 9 tests 通过
- `pnpm vitest run tests/integration/scheduler/refresh-service.test.ts -t "re-login"` — 3 tests 通过

verdict: PASS

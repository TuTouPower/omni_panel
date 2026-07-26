# Task review t155（reviewer_focus: 测试）

- task：`t155_auth_error_no_retry`
- spec：`docs/tasks/t155_auth_error_no_retry/spec.md`
- diff_anchor：`73785a2838839268d8283e05ff56130ce825ba9d`
- target：`git diff 73785a2838839268d8283e05ff56130ce825ba9d`
- round：2
- reviewed_at：2026-07-27 03:31 UTC+8

## Findings

本轮无新 finding。

## Round 1 findings 复核

### t155_test_f001 - AC1 未按 spec 要求提供 unit test 断言 connector 调用次数

- 严重度：important
- 状态：已修
- 证据：`tests/unit/scheduler/refresh-service.test.ts:91-107` 新增 unit test，mock `execute_connector` 抛出 `HTTP 401` 后直接断言 `toHaveBeenCalledTimes(1)`，并验证 `runtimeStore` status 为 `failed`。AC1 的 unit-test 层级要求已满足。

### t155_test_f002 - AC2 未直接覆盖 5xx / 网络错误的 3 次重试

- 严重度：minor
- 状态：已修
- 证据：`tests/unit/scheduler/refresh-service.test.ts:127-143` 对 `HTTP 500 internal`、`tests/unit/scheduler/refresh-service.test.ts:145-161` 对 `ECONNRESET` 分别断言 `toHaveBeenCalledTimes(3)` 且最终 status 为 `failed`。AC2 的两类具体场景已由 unit test 直接覆盖。

## 结论

- 前轮 finding 复核：f001 已修；f002 已修。
- 本轮新发现：0 条
- 总体判断：针对三个目标文件的改动完整覆盖了 spec 的四条 AC：auth error 单次调用、非 auth/5xx/连接错误保持 3 次重试、session re-login 未破坏、`is_auth_error` 覆盖 403/key 变体。`pnpm vitest run tests/unit/scheduler/refresh-service.test.ts tests/unit/scheduler/error-classification.test.ts tests/integration/scheduler/refresh-service.test.ts` 全部通过（39/39）。

verdict: PASS

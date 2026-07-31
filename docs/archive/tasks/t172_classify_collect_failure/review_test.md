# Task review t172（reviewer_focus: 测试）

- task：`t172_classify_collect_failure`
- spec：`docs/tasks/t172_classify_collect_failure/spec.md`
- diff_anchor：`82b0db63138940357918ff5de4eeaaffc792fd36`
- target：`git diff 82b0db63138940357918ff5de4eeaaffc792fd36`
- round：1
- reviewed_at：2026-07-31 21:24 UTC+8

## Findings

### t172_test_f001 - AC3「历史观测标 stale」未在单元层断言

- 严重度：minor
- 锚点：AC3（「行为退化为现有路径：历史观测标 stale、状态按失败处理」）
- 位置：`tests/unit/scheduler/refresh-service.test.ts:271`（测试名 `falls back to failed state when refresh fails (AC3)`）
- 问题：该测试断言 `oauth_refresh` 1 次、`execute_connector` 1 次、状态 `failed`，但 `create_observation_store()`（`tests/unit/scheduler/refresh-service.test.ts:62-73`）的 `list_by_source_instance_id` 恒返 `[]`，没有预置历史观测，因此 AC3 的「历史观测标 stale」分支（`src/main/core/scheduler/refresh-service.ts:497-506` 插入 stale 副本）在本轮新增测试中无法触发、无断言。测试策略明确列出「断言调用次数、重试采集与 stale 标记」，stale 标记只在 AC2 侧（`stale: false`）有断言；AC3 侧的 stale 标记仅由通用失败路径的集成测试（`tests/integration/scheduler/refresh-service.test.ts:1115`）覆盖，非 t172 新链路。
- 建议：AC3 刷新失败测试预置一条历史观测（`list_by_source_instance_id` 返回有值），断言失败后插入 `stale: true` + `last_error` 的副本，或至少断言调用过 `observationStore.insert`。

### t172_test_f002 - OAuth 抛错路径即时刷新（正向）无测试

- 严重度：minor
- 锚点：AC2 行为（「OAuth poll 连接器采集因 auth 错误失败时触发即时 refresh_now」）的次级实现分支
- 位置：`src/main/core/scheduler/refresh-service.ts:442-466`（catch 块内即时刷新兜底）；相关测试 `tests/unit/scheduler/refresh-service.test.ts:316`（`does not trigger oauth refresh for non-oauth (apikey) connector auth errors (t155 regression)`）
- 问题：新增测试覆盖了 `failed_accounts` 路径（grok/kimi 生产连接器脚本经 `report_failed_account` 上报，见 `connectors/grok/connector.ts:165`，是该路径的正向覆盖），但 catch 抛错路径只测了非 oauth（apikey 抛 401 → 不刷新）的负向；oauth_device 连接器执行器抛 401 后「刷新 + 重试」的正向分支无任何测试。该分支是脚本式连接器以 `result.error` 形式返回 401 时的兜底，逻辑上存在但无回归护栏。
- 建议：补一条 `execute_connector` 抛 `Error("HTTP 401: request failed (37 bytes)")` + `oauth_definition()` 的用例，断言 `oauth_refresh` 1 次、`execute_connector` 2 次、刷新成功后状态 `ready`。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：本轮为 Round 1。
- 改测方向复核：唯一的既有测试改动是 `tests/unit/renderer/components/provider_account_row.test.tsx:93-111`——error 字符串从 `"HTTP 401 unauthorized"` 改为真实 net-client 文案 `"HTTP 401: request failed (37 bytes)"`。断言（按钮渲染 + 点击回调）未变，两种输入在新共享 `is_auth_error` 下均为 true；旧渲染层判定对真实 401 文案不匹配（正是 t172 修复的 bug），新判定匹配。该改动是用真实生产文案覆盖修复后行为，属强化而非迁就实现。无迁就实现改测。
- 本轮新发现：2 条（均 minor）
- 未进表的提示：测试夹具 `oauth_definition()`（`refresh-service.test.ts:166-190`）不含真实 grok manifest 的 `script` 字段，因 `execute_connector` 为注入 seam 不影响被测逻辑，仅提示夹具保真度；AC1 组件测试按策略只断言按钮显隐，未断言非凭证错误下「已过期」badge 仍显示（badge 机制本身在非范围，且既有 `marks stale accounts` 测试已覆盖 badge 存在性）。
- 总体判断：AC1/AC2/AC3 均有对应测试且经实跑验证通过（3 文件 27 测试全绿）；两个 minor 为覆盖扩展建议，无未解决 critical / important。
- 系统性 follow-up：无

verdict: PASS

# Task review t172（reviewer_focus: 代码）

- task：`t172_classify_collect_failure`
- spec：`docs/tasks/t172_classify_collect_failure/spec.md`
- diff_anchor：`82b0db63138940357918ff5de4eeaaffc792fd36`
- target：`git diff 82b0db63138940357918ff5de4eeaaffc792fd36`
- round：1
- reviewed_at：2026-07-31 21:35 UTC+8

## Findings

### t172_code_f001 - 即时刷新发生在最后尝试轮时，刷新成功却不再重试采集，实例按失败/stale 收尾

- 严重度：minor
- 锚点：AC2「刷新成功后本轮重新采集，成功则观测不标 stale」的边界偏离
- 位置：`src/main/core/scheduler/refresh-service.ts:302-307`（failed_accounts 路径）与 `:454-459`（throw 路径）
- 问题：`max_attempts = 3`。当前两轮尝试以非认证错误失败（如连续两次连接错误）后，第 3 轮（attempt == 2）抛/报认证错误 → 触发即时 `refresh_now` 且成功 → 因 `attempt < max_attempts - 1` 不成立跳过 delay 后 `continue` → 循环自然退出 → 落入 `:494` 起的「全部观测标 stale + status failed」收尾。结果是 token 已成功刷新、下一轮可用，但本轮观测仍被标 stale、状态 failed，AC2 要求的「刷新成功后本轮重新采集」未发生，且该次 token 刷新调用成为空转。
- 建议：进入 oauth 即时刷新块前增加 `attempt < max_attempts - 1` 守卫（刷新与重试必须消费一次尝试预算）；或在刷新成功但无剩余尝试时，跳过最终 stale/failed 收尾（token 已刷新，不应对本轮标失败）。两种方向任选其一，并补对应边界用例。

### t172_code_f002 - throw 路径的 OAuth 即时刷新兜底无测试覆盖

- 严重度：minor
- 锚点：测试策略「AC2/AC3：refresh-service 集成测试…断言调用次数、重试采集与 stale 标记」的实现缺口
- 位置：`tests/unit/scheduler/refresh-service.test.ts`（新增 4 例）与 `src/main/core/scheduler/refresh-service.ts:440-466`
- 问题：新增用例只覆盖 `failed_accounts` 结果路径（grok/kimi 主路径）；`:440-466` 抛错路径的「oauth_device 连接器 run_connector throw 认证错误 → refresh 成功重试 / 失败退化」未被任何测试触达。t155 回归用例仅断言非 oauth（apikey）连接器不触发 refresh，未验证 oauth_device 抛错时确实刷新并重试。该分支为本次 diff 新增的可执行代码，属防御性兜底（d003 已确认 grok/kimi 主路径走 failed_accounts），缺测不影响生产主路径，但修复遗漏风险未闭环。
- 建议：补一个 `execute_connector` 以 `mockRejectedValue(new Error("HTTP 401: request failed"))` + oauth_device definition + `oauth_refresh` mock 的用例，断言 refresh 调用一次、`execute_connector` 共两次、成功后续状态 ready 且不标 stale。

### t172_code_f003 - 成功路径与 throw 路径的 OAuth 即时刷新块近 verbatim 重复

- 严重度：minor
- 锚点：DRY（重复逻辑存在维护分叉风险）
- 位置：`src/main/core/scheduler/refresh-service.ts:270-308` 与 `:440-466`
- 问题：两处「`!oauth_refresh_done` 守卫 → `oauth_refresh_done = true` → try/catch 调 `deps.oauth_refresh` → 成功则 delay + continue」逻辑约 35 行近乎逐字重复，仅成功后的 fall-through 控制流不同。当前行为一致未分叉，但后续任一处的修复（如 f001 的 attempt 守卫）若只改一处即产生行为漂移。
- 建议：将「尝试即时刷新并返回是否成功」抽为局部函数（如 `try_immediate_oauth_refresh(): Promise<boolean>`），两处调用，attempt 守卫统一收敛。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：3 条（均 minor）
- 未进表的提示：
    - 文件过大：`src/main/core/scheduler/refresh-service.ts` 551 行（本 task 净增 68 行，numstat 83/15），≥ 400 minor 阈值；`src/main/index.ts` 995 行（本 task 仅 +13，未达「本 task 仍净增堆大」条件不计）。refresh-service 复杂度：`refresh()` 函数本 task 新增 4 个分支 + 2 个 try/catch，McCabe 估算已 ≥ 15 且继续增大，建议下个动此文件的 task 拆分（如把 oauth 兜底抽为独立函数）。
    - 范围外观察：`is_auth_error` 合并后同时改变 `ProviderCard.tsx:96` 的卡片 auth 态分类（此前裸 `HTTP 401: request failed` 不命中 → 现在命中；裸 `token`/`auth` 子串不再命中）。属 spec「依赖 `is_auth_error` 作为唯一判定口径」的预期副作用，方向与 A11 防误报一致，无真实文案回归证据，不进 finding。
- 总体判断：AC1/AC2/AC3 主路径实现与测试齐备（401/403 与超时/5xx 分类、failed_accounts 路径即时刷新成功重试/失败退化/每轮至多一次，均有用例且实测通过）；无未解决 critical / important；3 条 minor 为边界与测试覆盖优化。
- 系统性 follow-up：无

verdict: PASS

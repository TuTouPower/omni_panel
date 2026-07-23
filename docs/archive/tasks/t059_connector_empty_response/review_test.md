# Task review t059（reviewer_focus: 测试）

- task：`t059_connector_empty_response`
- spec：`docs\tasks\t059_connector_empty_response/spec.md`
- diff_anchor：`00e1f2167815e1e9b844bcf98582f34ba2715502`
- target：`git diff 00e1f2167815e1e9b844bcf98582f34ba2715502`
- round：1
- reviewed_at：2026-07-23 18:52 UTC+8

## Findings

### t059_test_f001 - CPA 空响应路径无单测覆盖（spec AC 未覆盖）

- 严重度：important
- 位置：`tests/integration/connector/cpa-connector.test.ts`（缺失新增用例）；被测分支 `connectors/cpa/connector.ts:524-534`
- 问题：spec 验收标准中 `[ ] cpa 上游非 2xx → report_failed_account` 与 `[ ] 单测覆盖空体/非 2xx 路径` 两条均无 cpa 侧测试覆盖。实际实现路径：`parse_api_body`（`connectors/cpa/connector.ts:102-113`）在非 2xx 或 body 非 JSON 时静默返回 `{}`；main 循环 `keys.length === 0` 时调 `ctx.report_failed_account` 后 `continue`（line 526-534）。这正是本 task 修复目标（review_20260723_opus 的 P1 / I5 项）。`task.md` 过程记录中「cpa：未加空响应测试（fetch_provider 多分支 cache/retry，mock 空 body 难精确触发）」理由不成立：既有测试 `cpa-connector.test.ts:42-97` 的 `create_ctx` 已在系统边界 mock `ctx.http.post_json`，只需让其返回 `{ status_code: 500, body: {} }`（非 2xx）或 `{ status_code: 200, body: {} }`（空体）即可精确命中 `parse_api_body → {} → keys.length === 0 → report_failed_account`。缺测试后果：`parse_api_body` 恢复静默 return、或 main 移除 `keys.length === 0` 检查时无任何闸门拦截回归。
- 建议：在 `cpa-connector.test.ts` 新增至少一个用例：用 `ctx.http.post_json` mock 返回 `{ status_code: 500, body: {} }`（auth file provider 任意），断言 `result.observations=[]` 且 `result.failed_accounts` 长度为 1、`provider` 与 auth 文件一致、`error` 字段含「上游返回空响应」或实现所选措辞。推荐补第二例覆盖 body 为非 JSON 字符串的 `parse_api_body` catch 分支。另需一例验证 AC `[ ] 合法零值（真零用量）仍返回观测，不误报失败`（例如 `used_percent: 0` 的 codex 场景已在 line 326-377 存在，但不断言 `failed_accounts` 为空，建议补断言以区分「真零用量」与「空响应」）。

## 结论

- 前轮 finding 复核：N/A（Round 1）
- 本轮新发现：1 条（t059_test_f001，important）
- mimo / minimax 新加断言可信度：两条新增用例（`mimo-connector.test.ts:290-304`、`minimax-connector.test.ts:138-145`）均通过公共入口 `run_connector` 验证 `result.failed_accounts` 集合行为，未 mock 内部函数；断言组合 `observations=[]` + `failed_accounts.length===1` + `provider` 精确匹配，无恒真、弱化或删断言。`create_ctx` 里 `report_failed_account: () => undefined` 被 `runtime.ts:148-158` 的 collector wrapper 覆盖，收集逻辑可信。
- 范围外提示（不进 finding 表）：`minimax-connector.test.ts:172-178`「returns empty when no model_remains provided」与新增 line 138-145 用例输入完全相同（`create_ctx([])`），但仅断言 `error===null && observations===[]`，在新行为下未验证 `failed_accounts`，语义不完整。建议合并两用例或给旧用例补 `failed_accounts` 断言以保持一致。
- 总体判断：mimo / minimax 空响应覆盖到位；但 cpa 空响应路径是本 task 修复的 P1 核心（review_20260723_opus I5 静默 return `{}`），实现层已加 `keys.length === 0` 检查却无任何单测守护，spec 两条 AC 未覆盖，不可放行。

verdict: FAIL

## Round 2 (2026-07-23 19:30 UTC+8)

### 前轮 finding 复核

- **t059_test_f001（important）→ 已修**：`tests/integration/connector/cpa-connector.test.ts:100-109` 新增 `it("reports failed_account when upstream returns non-2xx (empty body)")`。mock 覆写点为 `ctx.http.post_json`（系统边界，非内部模块），返 `{status_code:500, body:{}}`，精确命中 `connectors/cpa/connector.ts:102-103` 的 `parse_api_body` 非 2xx 分支 → 返 `{}` → `keys.length===0` → `report_failed_account`。回归闸门有效：若删除 `connector.ts:526-534` 的 `keys.length===0` 守护，`parse_claude` 会从空 body 生成 2 条 used=0 observation，`expect(result.observations).toEqual([])` 与 `failed_accounts.length>0` 同时失败。AC1（cpa 上游非 2xx → report_failed_account）覆盖到位。
    - 修不彻底项（不复活 f001，仅说明）：R1 建议的「补 body 为非 JSON 字符串的 catch 分支」与「codex used_percent=0 用例补 `failed_accounts` 为空断言」未跟进。这两条与 non-2xx 共享 `parse_api_body→{}`→`keys.length===0` 同一入口与同一 main 守护，回归保护等价，非强制。

### 本轮新发现

### t059_test_f002 - `failed_accounts.length > 0` 弱于精确值，漏检 disabled filter 回归

- 严重度：minor
- 位置：`tests/integration/connector/cpa-connector.test.ts:107`
- 问题：断言 `expect(result.failed_accounts.length).toBeGreaterThan(0)`。`create_ctx` 的 `get_json` mock 返回 2 个 claude auth file：`auth-11111111-user@example.com-pro.json`（enabled）与 `auth-disabled@example.com.json`（`disabled:true`）。`connectors/cpa/connector.ts:517` 的 `if (auth_file.disabled) continue;` 过滤后者，故 failed_accounts 应恰为 1。用 `> 0`（等价 `>= 1`）替代 R1 建议的 `=== 1`，若 line 517 的 disabled 过滤被破坏（删条件/disabled 字段语义改变），disabled account 会进入主循环并同样触发 report_failed_account，failed_accounts 变为 2，`> 0` 仍通过，回归漏检。
- 建议：将断言改为 `expect(result.failed_accounts).toHaveLength(1)`，并可选追加 `expect(result.failed_accounts[0]?.account_id).toBe("claude-auth")` 精确锁定到 enabled account。无需引入新用例。

## 结论

- 前轮 finding 复核：t059_test_f001 已修（核心要求满足；次要建议未跟进但与主路径等价）。
- 本轮新发现：1 条（t059_test_f002，minor，断言精度）。
- 总体判断：R1 的 P1 核心（cpa 空响应无测试）已补齐，测试能在 keys.length===0 守护被破坏时拦截回归；但 `length > 0` 选择了较 R1 建议更弱的形式，漏掉 disabled filter 回归这一边界场景，应精确化。

verdict: FAIL

# Task review t051（reviewer_focus: 测试）

- task：`t051_tikhub_connector`
- spec：`docs\tasks\t051_tikhub_connector\spec.md`
- diff_anchor：`f307af7502aa8f32bd60509aad52d50df6e35797`
- target：`git diff f307af7502aa8f32bd60509aad52d50df6e35797` + 未跟踪新文件 `connectors/tikhub/`、`tests/integration/connector/tikhub_connector.test.ts`
- round：1
- reviewed_at：2026-07-23 16:50 UTC+8

## Findings

### t051_test_f001 - 阈值边界值（ratio=0.1、0.2 恰好点）未覆盖

- 严重度：minor
- 位置：`tests/integration/connector/tikhub_connector.test.ts:115-133`（"balance status reversed: low -> critical" / "balance status warning when 0.1 < ratio <= 0.2"）
- 问题：spec AC「balance status 余额反向（≤0.1 critical / ≤0.2 warning）」用闭区间定义阈值，但现有用例取 mid-range 值（ratio=0.05 critical、0.15 warning、0.5 normal），未覆盖临界点。`connector.ts:26-31` 用 `ratio <= 0.1` / `ratio <= 0.2`。若重构误把 `<=` 改成 `<`，三条用例仍全过，回归不被捕获。可复现场景：balance=20/LIMIT=200（ratio 恰好 0.1）当前应 critical，被改成 `< 0.1` 后变 warning；balance=40/LIMIT=200（ratio 恰好 0.2）当前应 warning，改成 `< 0.2` 后变 normal——两种回归现有测试都漏。
- 建议：补两条边界用例——`balance=20, LIMIT=200` 断言 critical；`balance=40, LIMIT=200` 断言 warning。可选再补 `balance=41, LIMIT=200` 断言 normal 以锁定上开区间。

## 结论

- 本轮新发现：1 条（minor）
- AC 覆盖核对：
    - manifest 注册 + 参数齐全：`manifest-contract.test.ts:13,52` 覆盖（API_KEY secret/label 校验 + provider 在 EXPECTED_PROVIDERS 与 api_key_providers 列表）。LIMIT 参数未在该契约测试显式断言，但 LIMIT 为非必需参数且实现层已用 `parse_limit` 容错，非缺口。
    - balance + free_credit 两条 observation：`tikhub_connector.test.ts:79-113` 覆盖。
    - account_id = email：`tikhub_connector.test.ts:91` 覆盖；email 缺失回退 `tikhub` 于 `:142-149` 覆盖。
    - balance 余额反向三档 + free_credit unknown：`:115-140` 覆盖三档 + LIMIT missing→unknown；free_credit 始终 unknown 于 `:103-112` 覆盖。临界点见 f001。
    - code != 200 / user_data 缺失 throw：`:159-175` 覆盖（不静默空数组）。
    - email 缺失回退：`:142-149` 覆盖。
    - http 错误传播：`:177-185` 覆盖 `result.error` + 空观测。
- 测试可信：所有用例经真实 `run_connector` 执行 `connector.ts`（`tikhub_connector.test.ts:70-72`），mock 仅置于 `http.get_json` 系统边界（`:55-62`），未 mock 被测逻辑本身。断言对 `result.observations` / `result.error` 用户可观察输出，未断言内部状态。
- 危险模式扫描：无 `.skip`/`.only`、无注释断言、无 `expect(true).toBe(true)`、无 `@ts-ignore`/`eslint-disable`、无 `toBeTruthy`/`toBeDefined` 充当 AC 证据、无阈值掩盖、无程序赋值替代交互。`expect.objectContaining` 用于观测对象部分匹配——可接受，因为 `run_connector` 内部 `script_observation_schema.safeParse`（`runtime.ts:181`）已强制完整 shape，测试聚焦语义字段。
- 总体判断：测试结构干净，AC 覆盖充分，无危险模式。仅阈值边界点（`<=` 与 `<` 之分）未被锁定，存在潜在 off-by-one 回归风险，严重度 minor。

verdict: FAIL

## Round 2 (2026-07-23 17:10 UTC+8)

### 前轮 finding 复核

- `t051_test_f001`（阈值边界未覆盖，minor）：**已修**。`tests/integration/connector/tikhub_connector.test.ts:135-143` 新增 `balance=20, LIMIT=200`（ratio 恰为 0.1）断言 `critical`；`:145-153` 新增 `balance=40, LIMIT=200`（ratio 恰为 0.2）断言 `warning`。两条均经真实 `run_connector` 执行 `connector.ts`，对 `connector.ts:28-29` 的 `ratio <= 0.1` / `ratio <= 0.2` 闭区间形成精确锁。若误把 `<=` 改成 `<`，两条用例立即红——回归保护有效。建议中可选的 `balance=41 → normal`（锁开区间上端）未补，非必需，不构成本轮 finding。

### 本轮新发现

0 条。新增边界用例无危险模式：无 `.skip`/`.only`、无注释/弱化/恒真断言、无 `@ts-ignore`、mock 仍只置于 `http.get_json` 系统边界（`:55-62`），未 mock 被测逻辑。断言对 `result.observations[].status`（用户可观察输出），非内部状态。

### 总体判断

R1 唯一 finding 已彻底修复，本轮无新问题，测试可信与 AC 覆盖维持。

verdict: PASS

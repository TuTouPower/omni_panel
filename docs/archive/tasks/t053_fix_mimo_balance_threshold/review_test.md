# Task review t053（reviewer_focus: 测试）

- task：`t053_fix_mimo_balance_threshold`
- spec：`docs\tasks\t053_fix_mimo_balance_threshold\spec.md`
- diff_anchor：`b2969af6990a7e420423a77ec967d9497167d0fd`
- target：`git diff b2969af6990a7e420423a77ec967d9497167d0fd`
- round：1
- reviewed_at：2026-07-23 17:25 UTC+8

## Findings

### t053_test_f001 - AC `limit<=0 → normal` 未覆盖

- 严重度：important
- 位置：`tests/integration/connector/mimo-connector.test.ts:117-150`（新增用例）
- 问题：spec 验收标准第 1 条明确列出 `limit<=0 → normal`。新增测试仅覆盖三档阈值,所有调用都经 `create_ctx`（line 45）硬编码 `LIMIT: "100"`,无任何用例传入 `LIMIT="0"` / `"-1"` / 非法值。若 `status_for_balance` 将 `limit <= 0` 误写为 `limit < 0`、或漏掉该分支,测试全绿但 AC 违反。
- 建议：补一条用例,显式 `params: { SESSION_COOKIE: "...", LIMIT: "0" }`（或 "-1"）,任意 balance 值断言 `status === "normal"`。

### t053_test_f002 - 阈值边界点 0.1 / 0.2 精确语义未验证

- 严重度：important
- 位置：`tests/integration/connector/mimo-connector.test.ts:121-149`
- 问题：测试用 balance=5（ratio 0.05）、15（0.15）、75.5（0.755）,均为各档位中段,不触达 `<=0.1` 与 `<=0.2` 的边界点。若实现把 `ratio <= 0.1` 误写为 `ratio < 0.1`（或 `<=0.2` 写为 `<0.2`）,balance=10/100 与 20/100 会落到错误档位,但当前测试无法捕获。spec 的 `<=` 语义恰好是最易写错处,缺边界断言等于未验证。
- 建议：补 balance=10（临界 critical）、balance=20（临界 warning）、可选 balance=20.01（临界 normal）三组断言。

### t053_test_f003 - spec 点名场景「余额 0.01」未覆盖

- 严重度：minor
- 位置：`tests/integration/connector/mimo-connector.test.ts:117-150`
- 问题：spec 验收标准第 2 条点名三场景「余额 0.01 / 充足 / limit 缺失」。新增用例覆盖「充足」（75.5→normal）与 critical 档（5/100,行为同 0.01）,但未直接用「0.01」值验证「即将耗尽」语义。行为等价于 f001 中 critical 档,风险低。
- 建议：将 critical 用例的 balance 由 5 改为 0.01,或在断言中追加一组 balance=0.01 断言 critical。

## 结论

- 前轮 finding 复核：N/A（Round 1）。
- 本轮新发现：3 条（2 important + 1 minor）。
- 总体判断：测试方向正确（反向 status,非 legacy `>=0 normal`）,无危险模式,但 AC 覆盖存在硬缺口——`limit<=0` 分支零覆盖,阈值边界点 `<=` 语义未验证,两者均为 spec 显式 AC。

verdict: FAIL

## Round 2 (2026-07-23 18:05 UTC+8)

### 前轮 finding 复核

- **t053_test_f001（important → 撤回）**：核实 `connectors/mimo/connector.ts:41-43` `parse_limit` 为 `value > 0 ? value : DEFAULT_LIMIT`，传入 `LIMIT="0"` / `"-1"` / 非法值均被替换为 100，`status_for_balance`（line 60）的 `limit<=0` 分支经由 params 不可达。撤回理由成立（修复需改 `parse_limit`，超出 t053 spec 范围）。**已撤回**。
- **t053_test_f002（important，边界 0.1/0.2）**：`tests/integration/connector/mimo-connector.test.ts:152-175` 新增 `balance threshold boundaries 0.1/0.2 locked (<= semantics)`，断言 balance=10 → critical、balance=20 → warning，严格 `toBe`，未弱化。若实现误写 `ratio < 0.1` / `< 0.2`，10/20 会落入错误档位并被捕获。**已修**。
- **t053_test_f003（minor，0.01）**：`tests/integration/connector/mimo-connector.test.ts:177-191` 新增 `balance near zero (0.01) -> critical`，断言 balance=0.01 → critical，直接覆盖 spec 点名场景。**已修**。

### 本轮新发现

0 条。

### 新改动危险模式扫描

- 无 `.skip` / `.only` / `@ts-ignore` / `eslint-disable`
- 无恒真断言、无注释断言、无删 expect
- 断言均为严格 `toBe("critical" / "warning" / "normal")`，未弱化为 `toContain` / 正则 / `>=`
- mock 仅在 http 边界（`create_ctx` 的 `http.get_json`），未 mock 被测 `run_connector` 或内部函数
- 异步路径：`await run_connector(...)` 全部 await，无 race / 遗漏 timeout

### 测试执行

`pnpm vitest run tests/integration/connector/mimo-connector.test.ts` → PASS (8) / FAIL (0)。

### 总体判断

前轮 3 条 finding：1 条撤回（举证成立）、2 条修复到位且未换形式弱化；本轮新改动无危险模式、无新缺口。

verdict: PASS

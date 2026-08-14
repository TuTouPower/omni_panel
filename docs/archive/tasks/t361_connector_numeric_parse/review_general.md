# Task review t361（reviewer_focus: 通用）

- task：`t361_connector_numeric_parse`
- spec：`docs/tasks/t361_connector_numeric_parse/spec.md`
- diff_anchor：`1d2fb0e51def0b06c00095e9f6650bfff5be5003`
- target：`git diff 1d2fb0e51def0b06c00095e9f6650bfff5be5003`
- round：1
- reviewed_at：2026-08-14 03:15 UTC+8

## Findings

### t361_gen_f001 - AC-004 未实现：非数字 balance 仍静默当 0，mimo 恒真守卫保留

- 严重度：important（AC-004 门禁未满足）
- 锚点：AC-004 + 范围 bullet 3
- 位置：`connectors/mimo/connector.ts:44-47`、`connectors/mimo/connector.ts:141-143`、`connectors/getoneapi/connector.ts:66`
- 问题：
  - 范围 bullet 3 明确「mimo `to_number` 对非数字返回 NaN 或先校验 typeof」，diff 未触碰 `connectors/mimo/connector.ts`（该文件零改动）。
  - AC-004：「非数字 balance/limit 不静默当 0（跳过或报 failed），守卫非恒真」。现状两者均不满足：
    - `connectors/mimo/connector.ts:44-47` `to_number`：`Number.isFinite(parsed) ? parsed : 0`，非数字归一为 0。
    - `connectors/mimo/connector.ts:141-143`：`const balance = to_number(balance_result.data.balance); if (Number.isFinite(balance)) {...}`。`to_number` 恒返回有限数，该守卫恒真；非数字 balance（如 `"abc"`）→ `used: 0` 照常产出观测，若 LIMIT 参数存在，status 经 `for_balance(0, limit)` 呈现正常档位，掩盖解析失败——正是「静默当 0」。
    - `connectors/getoneapi/connector.ts:66`：`const balance = round2(to_number(data["balance"]))`，非数字 balance 同样静默 → 0（`used: 0`）。
  - 测试策略「各 connector 测试补『非数字 balance』用例」未落地：新增 getoneapi 测试 `tests/integration/connector/getoneapi_connector.test.ts:135-144` 用 `balance: 1.88`（数值），无任何非数字 balance fixture；mimo 测试文件未改。
  - handoff 自述「mimo to_number 已 isFinite 守卫（非数字→0，非 NaN 泄漏）」把 AC-001 的 NaN 泄漏与 AC-004 的「不静默当 0」混淆：返回 0 满足 AC-001（无 NaN 泄漏），但恰是 AC-004 禁止的静默当 0。AC-004 的括号限定「跳过或报 failed」明确排除了回退为 0。
  - 已实现的仅是 AC-004 的 getoneapi code 部分（`connectors/getoneapi/connector.ts:52` `Number(code)`），「非数字 balance」主体未覆盖。
- 建议：在 `to_number` 前对原始 balance 做 typeof/isFinite 校验（或 `to_number` 对非数字返回 NaN 后在 push 前判非有限即跳过），非数字 balance 时跳过该观测或 `report_failed_account`；getoneapi 同理。补非数字 balance fixture 测试，断言跳过或 failed，而非 `used: 0`。

### t361_gen_f002 - firecrawl 无时区日期显式 ISO8601 处理未实现（范围项缺漏）

- 严重度：minor（范围项，非 AC 门禁）
- 锚点：范围 bullet 2
- 位置：`connectors/firecrawl/connector.ts:35`
- 问题：范围 bullet 2 明确「无时区日期显式按 ISO8601 处理」，但 `extract_usage` 仍是 `const reset_at_ms = typeof period_end === "string" ? Date.parse(period_end) : Number.NaN;`（diff 未触碰该行）。无时区日期（如 `"2026-08-03T11:54:41"`）由 `Date.parse` 按本地时区解析，与带 `Z`/offset 的解析不一致，`reset_at` 随运行机器时区偏移。现有 fixture 全部带 `Z`（`tests/integration/connector/firecrawl_connector.test.ts:29-47`），未暴露该行为。本次 diff 只做了分指标 reset_at，未做时区归一。
- 建议：对无时区字符串显式补 UTC 处理后再解析（如规范化追加 `Z`），或在此 task 内明确放弃该项并登记 pending。

### t361_gen_f003 - firecrawl 分指标 reset_at 修复无区分性测试，断言不触达修复目标

- 严重度：minor
- 锚点：测试可信
- 位置：`tests/integration/connector/firecrawl_connector.test.ts:29-47`、`:113-141`
- 问题：修复点（tokens 观测不再复用 credits.reset_at）在两个 fixture 中 `billing_period_end` 完全相同（均为 `"2026-08-03T11:54:41.999Z"`），断言只验证两观测 `reset_at` 都等于同一 `EXPECTED_RESET_AT`。即使回退到旧行为（tokens 复用 credits.reset_at），该测试依旧通过，无法捕获本次修复的回归。handoff 将 firecrawl 分指标组装列为 AC-001 证据，但无任何测试能区分新旧行为。
- 建议：credits/tokens fixture 用不同 `billing_period_end`，断言各观测 `reset_at` 分别等于各自日期。

## 结论

- 前轮 finding 复核：无（round 1）
- 本轮新发现：3 条（f001 important / f002 minor / f003 minor）
- 未进表的提示：
  - `connectors/minimax/connector.ts:78-89` period_key 时间戳缺失守卫正确（缺失/非正/end<=start → period_generic，修复了原 end<=start 误判 period_5h 的 bug），但无直接测试：现有 `tests/integration/connector/minimax-connector.test.ts:106-126` 的 end<start 用例仅断言 `cycleDurationMs`（来自 main 的独立计算），未断言 label/period；旧/新 period_key 下该测试均通过。非 AC 范围项，未作 finding。
  - codex/deepseek 出现在 review 来源行号但不在范围/AC 内，diff 未触碰，符合范围。
- 总体判断：AC-001/002/003 及 getoneapi code 容错实现正确、有测试且全绿（tsc/eslint 干净，`npx vitest run tests/integration/connector` 21 文件 226 passed，与 implementer 自述一致）；但 AC-004「非数字 balance 不静默当 0、守卫非恒真」主体未实现，属门禁 AC 未满足，必须补齐。
- 系统性 follow-up：无

verdict: FAIL

---

## Round 2 复核

- round：2（finding 全局续编，前轮 f001-f003）
- diff_anchor：`1d2fb0e51def0b06c00095e9f6650bfff5be5003`（不变）
- reviewed_at：2026-08-14 03:12 UTC+8

### 前轮 finding 复核

#### t361_gen_f001（important，AC-004 非数字 balance 静默当 0）— 已消除（残留边界转 f004）

- mimo `to_optional_number`（`connectors/mimo/connector.ts:51-55`）：`null`/`undefined`/`""` 及非数字一律返回 `null`；`main()` 中 `if (balance !== null)` 跳过余额观测（`:151-152`），守卫不再恒真，符合 AC-004「跳过或报 failed」。
- 真实 0 不误跳过：实测 `to_optional_number(0)` 与 `to_optional_number("0")` 均返回 0，`balance !== null` 成立，正常产出余额观测（0 是合法余额，未跳过）。
- getoneapi 守卫（`connectors/getoneapi/connector.ts:67-70`）：非数字垃圾串 `"not-a-number"` → `to_number` 归一 0，而 `Number(data["balance"])` = NaN ≠ 0 → 抛错报 failed，不产出观测；实测合法 string `"1.88"`、真实 `0`、string `"0"` 均 `Number()` 强转与 `to_number` 一致，不抛错且 balance 正确。
- 测试触达修复目标：mimo `skips non-numeric balance...`（`tests/integration/connector/mimo-connector.test.ts:326`）断言无 balance 观测且 failed_accounts=1；getoneapi `reports failed on non-numeric balance`（`:148`）断言 error 含「非数字」且 observations 空。既有 `balance: "75.5"` 合法串用例（mimo）仍通过。
- 残留：getoneapi 守卫对 `null`/`""`/`" "` balance 不抛错（`Number(null)=0` 与 `to_number(null)=0` 相等，`Number("")=0` 同理），静默归一 0；与 mimo 显式跳过 null/"" 不一致。此为 f001 范围内残留，转新 finding f004。

#### t361_gen_f002（minor，firecrawl 无时区日期 ISO8601）— 已消除

- `normalized_end`（`connectors/firecrawl/connector.ts:35-41`）：正则 `/([zZ]|[+-]\d{2}:?\d{2})$/` 对带时区字符串（`Z`、`+08:00`、`+0800`、`-07:00`）不补 Z，对无时区字符串补 `Z` 按 UTC 解析。实测 6 类输入全部符合预期：带时区原样保留且 `Date.parse` 正确，无时区补 Z 后得到同一 UTC 时刻。
- 既有 fixture 全带 `Z`，`normalized_end === period_end`，`Date.parse` 结果不变，无回归；firecrawl 9 个测试全绿。
- 无时区补 Z 分支无直接测试（属可加 case，非缺口，见结论提示）。

#### t361_gen_f003（minor，firecrawl 分指标 reset_at 无区分测试）— 已消除

- 新增测试（`tests/integration/connector/firecrawl_connector.test.ts:156-185`）：credits/tokens 用不同 `billing_period_end`（`2026-08-03...` vs `2026-08-10...`），断言各观测 `reset_at` 分别等于各自日期，并断言二者不等。旧行为（tokens 复用 credits.reset_at）下该测试必失败，具备新旧行为区分性，直接触达修复目标。

### Round 2 新发现

#### t361_gen_f004 - getoneapi balance 守卫对 null/空串仍静默归一 0（AC-004 残留）

- 严重度：minor
- 锚点：AC-004「非数字 balance/limit 不静默当 0（跳过或报 failed）」
- 位置：`connectors/getoneapi/connector.ts:67-70`
- 问题：守卫 `!Number.isFinite(balance_raw) || Number(data["balance"]) !== balance_raw` 仅拦截非数字垃圾串（`"not-a-number"` → NaN ≠ 0）。对 `null`、`""`、`" "` 的 balance，`Number(null)=0`、`Number("")=0`、`Number(" ")=0`，均与 `to_number` 结果 0 相等，不抛错，balance 静默为 0（实测确认）。`typeof null === "object"`，属 AC-004 字面「非数字」范围；且与 mimo `to_optional_number` 显式把 `null`/`undefined`/`""` 映射为 null 跳过的语义不一致。`!("balance" in data)` 仅拦截 key 缺失，key 存在但值为 null/空串时放行。
- 建议：对原始 balance 先做 null/空串判定（如 `raw == null || (typeof raw === "string" && raw.trim() === "")`）时抛错或跳过，与 mimo 对齐。

## 结论（Round 2）

- 前轮 finding 复核：f001 主场景已消除（mimo 跳过 / getoneapi 报 failed，均有区分性测试；真实 0 与合法串不误判），残留 null/空串边界转 f004；f002 已消除（实测时区正则正确、既有 fixture 无回归）；f003 已消除（区分性测试落地）。
- 本轮新发现：1 条（f004 minor）
- 未进表的提示：
  - firecrawl 无时区补 Z 分支无直接测试（可加 case，非缺口）。
  - mimo balance 真实 0 无显式测试（有 0.01 临界用例），行为经实测确认不误跳过。
- 总体判断：f001-f003 均按建议修复且测试触达，`npx vitest run tests/integration/connector` 21 文件 229 passed（前轮 226，净增 3 条覆盖新修复）；仅剩 getoneapi null/空串 balance 静默当 0 的 minor 残留，无未解决 critical/important。
- 系统性 follow-up：无

verdict: PASS

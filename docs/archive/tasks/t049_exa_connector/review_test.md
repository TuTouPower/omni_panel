# Task review t049（reviewer_focus: 测试）

- task：`t049_exa_connector`
- spec：`docs\tasks\t049_exa_connector\spec.md`
- diff_anchor：`08ebd8a931e25a72a0cc994806eda0186c8ba6c3`
- target：`git diff 08ebd8a931e25a72a0cc994806eda0186c8ba6c3`（含 untracked：`connectors/exa/`、`tests/integration/connector/exa_connector.test.ts`）
- round：1
- reviewed_at：2026-07-23 15:19 UTC+8

## Findings

### t049_test_f001 - 缺 AC「非 200 错误码（throw）」契约用例

- 严重度：critical
- 位置：`tests/integration/connector/exa_connector.test.ts`（整个文件缺该用例）
- 问题：spec AC 第 5 条明确「契约测试覆盖正常 / 零用量 / 非 200 错误码（throw）」。现有用例覆盖正常（L94-142）与零用量（L157-171），但无任何错误路径用例：
    - `connectors/exa/connector.ts:54-55` 有 `if (!is_record(response)) throw new Error("Exa API 返回格式异常...")`，未测；
    - 非 2xx HTTP 由 `src/main/core/connector/net-client.ts` 抛出，经 `runtime.ts:193-198` 包装为 `{ error: message, observations: [] }`，未测。
    - 对比同目录 `firecrawl_connector.test.ts:167-173`、`175-183` 均有 throw 用例，exa 缺失致 AC 错误路径看似覆盖实则未验证，属 critical（测了假行为 / AC 关键路径无证据）。
- 建议：补两条用例：(1) `get_json` 返回非对象（如 `null`）→ 断言 `result.error` 含「返回格式异常」、`observations` 为 `[]`；(2) `get_json` 抛 `new Error("HTTP 404")` → 断言 `result.error` 含「HTTP 404」、`observations` 为 `[]`。

### t049_test_f002 - 「LIMIT 缺失/≤0 时 unknown」AC 被反向断言

- 严重度：critical
- 位置：`tests/integration/connector/exa_connector.test.ts:189-197`（用例「uses default limit 100 when LIMIT missing or invalid」）
- 问题：spec AC 第 3 条要求「LIMIT 缺失/≤0 时 unknown」。实现 `connectors/exa/connector.ts:12-15` `parse_limit` 将缺失/`≤0`/非数一律替换为 `DEFAULT_LIMIT=100`，于是 `status_for_cost(45.67, 100)` 走 ratio 分支返回 `"normal"`，**违反 AC**。本测试进一步将此遗留行为固化：
    ```ts
    expect(total?.limit).toBe(100); // 与 AC 矛盾：AC 要求 status=unknown
    ```

    - 用例标题写「missing or invalid」实际仅测 missing（无 `LIMIT:"0"` / `"-5"` / `"abc"` 用例），标题/ body 不一致；
    - 「LIMIT 缺失/≤0」整个分支无任何 `status === "unknown"` 断言；
    - 测试断言的是实现当前（违反 AC 的）行为，而非期望行为，属「断言遗留 bug」critical（参考本项目 MEMORY：tests must assert desired behavior, not legacy broken behavior）。
- 建议：(1) 实现侧修：`parse_limit` 在缺失/`≤0` 时返回 `0` 或 `null`，使 `status_for_cost` 走 `limit<=0 → "unknown"` 分支；(2) 测试侧改为断言 `status === "unknown"`、`limit` 字段语义随之；(3) 补 `LIMIT="0"`、`LIMIT="-5"`、`LIMIT="abc"` 三种 invalid 输入的断言。

### t049_test_f003 - 「≥0.75 warning」阈值未覆盖

- 严重度：important
- 位置：`tests/integration/connector/exa_connector.test.ts:144-155`（仅有 critical 用例）
- 问题：spec AC 第 3 条列三档：`≥0.9 critical`、`≥0.75 warning`、`LIMIT ≤0 unknown`。现有用例仅覆盖 critical 分支（`limit=50, used=45.67, ratio≈0.913`）。warning 阈值（如 `limit=100, used=80, ratio=0.80` 期望 `status:"warning"`）与 normal/warning 边界（`ratio=0.749` vs `0.75`）无任何测试。三档中两档无证据，warning 又是用户实际触发的常见档位，故 important。
- 建议：新增用例 `limit=100, total_cost_usd=80` → 断言 `status:"warning"`；可选补 `limit=100, total_cost_usd=70` → `status:"normal"` 锁定 normal/warning 边界。

## 结论

- 本轮新发现：3 条（critical 2、important 1）
- 总体判断：AC 第 3 条（status 三档）与第 5 条（错误路径 throw）严重欠覆盖，且 f002 的现有断言与 AC 反向，单看测试会误以为已实现「unknown」分支实则没实现；测试在通过界面/接口/存储效果说话这一点上本身合规（走 `run_connector`，mock 只在外部 HTTP 边界），但断言的对象是违反 AC 的实现行为，不可放行。

verdict: FAIL

## Round 2 (2026-07-23 15:34 UTC+8)

### 前轮 finding 复核

- `t049_test_f001`（critical）：已修。`tests/integration/connector/exa_connector.test.ts:247-253` 断言非对象（null）经 runtime 包装后 `result.error` 含「Exa API 返回格式异常」、`observations` 为 `[]`；`:255-270` 用 `mockRejectedValue(new Error("HTTP 401 Unauthorized"))` 断言 HTTP 错误经 runtime 包装为 `result.error` 含「HTTP 401」、`observations` 为 `[]`。两条均通过外部 HTTP 边界 mock，未 mock 内部逻辑，断言用户可观察行为。
- `t049_test_f002`（critical）：已修。
    - 实现侧 `connectors/exa/connector.ts:20-24` `parse_limit` 缺失/空/非数/≤0 一律返回 0；`L45` limit=null；`L90` 走 `limit_num > 0 ? status_for_cost(...) : "unknown"` 分支，符合 AC「LIMIT 缺失/≤0 时 unknown」。
    - 测试侧 `:193-201`（LIMIT missing）、`:203-218`（"0" / "-5"）、`:220-229`（"abc"）三类输入均断言 `status === "unknown"` 与 `limit === null`，断言期望行为而非遗留实现。
- `t049_test_f003`（important）：已修。`:166-175` LIMIT=60、used=45.67（ratio≈0.761）断言 `status === "warning"`、`limit === 60`，warning 阈值有证据。

### 本轮新发现

0 条。

### 危险模式扫描

- 恒真断言：无。
- 删/反转 expect：无。
- 注释断言：无。
- 弱化断言：无新增（`objectContaining` 在结构化观测断言中合法）。
- 删测试：无。
- `.skip` / `.only`：无。
- `@ts-ignore` / `eslint-disable`：无。
- mock 误用：mock 仅在外部 HTTP 边界（`get_json`），未 mock 被测逻辑本身。
- 阈值掩盖：无。
- 条件跳过：无。
- 程序赋值替代真实交互：不适用（无 UI 交互）。
- 存在即通过：无。

### 结论

- 前轮 finding：3/3 全部已修（critical 2、important 1）。
- 本轮新发现：0 条。
- 总体判断：三条 finding 全部修到位，且未发现新反模式或新欠覆盖。测试通过外部 HTTP 边界 mock，断言均为期望行为（status/limit/observations/error），AC 第 3 条与第 5 条现已齐全。

verdict: PASS

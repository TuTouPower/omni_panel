# Task review t160（reviewer_focus: 测试）

- task：`t160_fix_grok_zero_percent_omission`
- spec：`docs\tasks\t160_fix_grok_zero_percent_omission/spec.md`
- diff_anchor：`d9cf0499d7600b814f44bbadda660494e16f4bb6`
- target：`git diff d9cf0499d7600b814f44bbadda660494e16f4bb6`
- round：1
- reviewed_at：2026-07-29 04:20 UTC+8

## Findings

### t160_test_f001 - `currentPeriod` 来源与有效性未被隔离验证

- 严重度：important
- 位置：`tests/integration/connector/grok_connector.test.ts:51-64`、测试 `interprets an omitted weekly creditUsagePercent as zero usage`
- 问题：零用量 fixture 同时提供 `currentPeriod.end` 与值完全相同的遗留 `billingPeriodEnd`，未知响应测试则完全不提供 `currentPeriod`。因此，实现即使继续从 `billingPeriodEnd` 取 `reset_at`，或只检查 `currentPeriod` 对象存在而不校验 `type/start/end`、日期有效性与 `end > start`，当前测试仍会通过。该漏网实现违反“`reset_at` 精确取 `currentPeriod.end`”及“只有完整有效周期才把省略字段解释为 0%”两项 AC。
- 建议：零用量 fixture 删除 `billingPeriodEnd`，或将其设置为与 `currentPeriod.end` 不同的哨兵值；再参数化覆盖缺少 `type/start/end`、非法日期、`end <= start`、非 weekly type，均断言零 observations + 一个 failed account。

### t160_test_f002 - “显式与省略结果相同”仅比较部分字段

- 严重度：important
- 位置：`tests/integration/connector/grok_connector.test.ts:281-320`、测试 `treats explicit and omitted zero percentages identically`
- 问题：该测试没有比较两条路径的完整 observation，而是分别用 `expect.objectContaining` 匹配同一子集。若省略路径输出错误的 `display_style`、`cycleDurationMs`、标签、source/stale 字段，或与显式路径存在其他可观察差异，测试仍通过；两边同时上报相同 failed account 也会通过最后一条相等断言。测试名与 AC 要求的“相同结果”均未被真实证明。
- 建议：固定时钟或移除 `observed_at` 后直接比较两条路径的完整 observations，并分别断言 `failed_accounts` 为空。

### t160_test_f003 - deprecated 防线未覆盖与有效周周期共存场景

- 严重度：important
- 位置：`tests/integration/connector/grok_connector.test.ts:323-348`、测试 `does not map deprecated monthly cent fields to weekly usage`
- 问题：deprecated fixture 只有 `monthlyLimit/used` 与遗留 billing period，没有有效 `currentPeriod`；零用量 fixture 又没有 `monthlyLimit/used`。因此，错误实现若仅在“有效 weekly `currentPeriod` + 省略 `creditUsagePercent` + deprecated 字段存在”时计算 `used / monthlyLimit`，两组测试都会通过，但真实组合会把 0% 错显为 89.56%，直接违反 deprecated 字段不得作为 weekly 数据源的 AC。
- 建议：在有效 weekly 零用量 fixture 中同时加入 `monthlyLimit: { val: 15000 }` 与 `used: { val: 13434 }`，断言总额度仍为 `used=0`、`limit=100`，且不产生 89.56% observation。

## 结论

- 本轮新发现：3 条
- 总体判断：专项测试 11/11 通过，危险模式扫描未命中；旧失败断言改为期望 0% 有 spec 根因归因，属于合法修正，但 `currentPeriod` 校验、两种 0% 路径等价性及 deprecated 共存防线仍缺可信覆盖。

verdict: FAIL

## Round 2 (2026-07-29 04:56 UTC+8)

### 前轮 finding 复核

- `t160_test_f001`：已修。`billing_response_zero_usage` 已将 `billingPeriodEnd` 设为不同哨兵值，主断言证明总额度取 `currentPeriod.end`；参数化测试覆盖缺少 `type/start/end`、非字符串日期、非法日期、非递增日期及未知 type，均断言零 observations + 一个 failed account。
- `t160_test_f002`：已修。显式与省略路径分别断言无 failed account、恰有一条 observation，并在仅归一化 `observed_at` 后用 `toEqual` 比较完整 observation，未换成另一种弱化断言。
- `t160_test_f003`：已修。有效 weekly 0% fixture 已同时包含 `monthlyLimit.val=15000`、`used.val=13434`，仍断言唯一总额度 `used=0`、`limit=100`，可阻止 deprecated 比值在真实共存形状中被误映射。

### Findings

#### t160_test_f004 - 缺少 `currentPeriod` 的显式百分比兼容路径无回归测试

- 严重度：important
- 位置：`tests/integration/connector/grok_connector.test.ts:111-243`、测试 `parses billing response into total + per-product observations` / `reports status as ...`；`tests/integration/connector/grok_connector.test.ts:356-423`
- 问题：所有显式有限 `creditUsagePercent` 用例都同时携带有效 `currentPeriod`：19/74/75/95 继承 `billing_response.config.currentPeriod`，25 使用显式 monthly period，0 使用 weekly 零用量 fixture。基线行为可在没有 `currentPeriod` 时直接解析显式有限百分比；错误实现若改为“任何总额度都强制要求有效 `currentPeriod`”，当前 23 条测试仍可全部通过，却会丢弃原本可解析的显式非零响应，违反“显式非零 `creditUsagePercent` 现有行为保持不变”AC。
- 建议：增加 `creditUsagePercent: 19`、省略 `currentPeriod`、保留 legacy `billingPeriodEnd` 的响应，断言生成 `window="week"`、`used=19`、正确 legacy reset 且无 failed account；可同时覆盖显式 0 的同类兼容路径。

### 结论

- 前轮 finding 复核：f001、f002、f003 全部已修。
- 本轮新发现：1 条
- 总体判断：专项 23/23、完整测试 184 files / 1878 tests 通过，危险模式扫描未命中；但显式百分比缺少 `currentPeriod` 的既有兼容路径仍无回归保护。

verdict: FAIL

## Round 3 (2026-07-29 05:33 UTC+8)

### 前轮 finding 复核

- `t160_test_f004`：已修。测试 `preserves an explicit percentage with a %s currentPeriod` 分别覆盖 `currentPeriod` 缺失与 type 无效两种响应，均保留显式 `creditUsagePercent=19`，断言无 failed account，并验证 legacy `window="week"` 与 `billingPeriodEnd` reset；未通过弱化断言规避兼容路径。

### Findings

#### t160_test_f005 - 省略零值与 monthly type 映射未做组合覆盖

- 严重度：important
- 位置：`tests/integration/connector/grok_connector.test.ts:264-337`、测试 `interprets an omitted weekly creditUsagePercent as zero usage`；`tests/integration/connector/grok_connector.test.ts:405-437`、测试 `maps a valid monthly currentPeriod to a monthly observation`
- 问题：省略 `creditUsagePercent` 的正常用例只覆盖 weekly；monthly 用例则显式提供 `creditUsagePercent=25`。错误实现若仅在显式百分比路径读取 `currentPeriod.type`，但省略字段 fallback 始终硬编码 `window="week"` / 7 天周期，两组测试及显式/省略 weekly 等价测试仍会全部通过。该漏网实现不满足“字段省略时按 0% 解释”与“window 按 `currentPeriod.type` 映射”两项 AC 的组合行为。
- 建议：增加完整 monthly `currentPeriod` 且省略 `creditUsagePercent` 的响应，断言唯一 observation 为 `used=0`、`limit=100`、`window="month"`、monthly `cycleDurationMs`、`reset_at=currentPeriod.end`，且无 failed account。

### 结论

- 前轮 finding 复核：f004 已修。
- 本轮新发现：1 条
- 总体判断：专项 26/26、完整测试 184 files / 1881 tests 通过，危险模式扫描未命中；省略零值与 monthly 周期映射组合仍缺回归保护。

verdict: FAIL

## Round 4 (2026-07-29 05:55 UTC+8)

### 前轮 finding 复核

- `t160_test_f005`：已修。测试 `maps an omitted monthly percentage to zero usage` 使用完整 monthly `currentPeriod` 且省略 `creditUsagePercent`，断言无 failed account，并验证唯一 observation 的 `used=0`、`limit=100`、`window="month"`、30 天 `cycleDurationMs` 与 `reset_at=currentPeriod.end`，未通过弱化或间接断言规避组合行为。
- 所有前轮未闭合项：无。`t160_test_f001`–`t160_test_f004` 已在前轮复核为已修，当前 diff 未回退对应覆盖。

### Findings

零 finding。

### 结论

- 前轮 finding 复核：f005 已修；f001–f004 保持闭合。
- 本轮新发现：0 条
- 总体判断：专项 28/28、完整测试 184 files / 1883 tests 通过；危险模式扫描未命中。省略/显式 0、weekly/monthly 周期映射、无效周期、显式百分比兼容、productUsage、状态阈值、unknown failed/stale 与 deprecated 字段防线均有可信回归覆盖；真实刷新视觉证据显示 weekly 0% 与 08.04 07:10 reset 一致。

verdict: PASS

## Round 5 (2026-07-29 06:49 UTC+8)

### 前轮 finding 复核

- `t160_test_f001`–`t160_test_f005`：保持闭合。当前完整 diff 保留 `currentPeriod` 有效性与 reset 来源隔离、显式/省略 0 完整 observation 等价、deprecated 字段共存防线、显式百分比 legacy 兼容及省略 monthly 组合覆盖，未见断言弱化或覆盖回退。

### Findings

零 finding。

### 结论

- 前轮 finding 复核：f001–f005 全部保持闭合。
- 本轮新发现：0 条
- 总体判断：专项 28/28、完整测试 184 files / 1883 tests 通过，`git diff --check` 通过；危险模式与敏感信息扫描未命中。Round 5 真实刷新视觉证据继续显示 Grok weekly `0%` 与 `08.04 07:10` reset，当前测试覆盖可信且满足 spec AC。

verdict: PASS

# Task spec

## 背景

Grok/SuperGrok 每周用量接口为：

```text
GET https://cli-chat-proxy.grok.com/v1/billing?format=credits
```

当前账号在网页显示：

```text
每周 SuperGrok 限额
0% 已使用
重置：2026-08-04 07:10 UTC+8
```

使用同一正式 OAuth bearer 做只读请求后，接口返回 HTTP 200，`config.currentPeriod` 完整存在：

```text
currentPeriod.type  = USAGE_PERIOD_TYPE_WEEKLY
currentPeriod.start = 2026-07-27T23:10:25.819831+00:00
currentPeriod.end   = 2026-08-03T23:10:25.819831+00:00
```

`currentPeriod.end` 换算 UTC+8 后正是网页显示的 `2026-08-04 07:10`，证明该响应就是当前 SuperGrok 每周限额数据。但响应未包含 `creditUsagePercent`。

### 根本原因

该接口使用 proto3 JSON。`creditUsagePercent` 是无显式 presence 的数值标量；值为默认值 `0` 时，proto3 JSON 默认省略字段。因此：

```text
creditUsagePercent = 0
→ JSON 不包含 creditUsagePercent
```

当前 `connectors/grok/connector.ts` 只有在 `typeof config.creditUsagePercent === "number"` 时才生成总额度 observation。字段被省略后产出零 observations：

1. 初版 Grok parser（commit `6a2f83b7`）未覆盖 protobuf 默认零值省略。
2. t039（commit `0dc2833a`）将所有零 observations 改为 `report_failed_account`，避免 `ready + []` 覆盖历史；但没有区分“有效周期内的 0%”与“未知响应”。
3. t159（commit `e381edfa`）又将 `isUnifiedBillingUser=true` 且 on-demand/prepaid 三项为 0 的形状解释为“无可用额度”，进一步把合法 SuperGrok 0% 响应误判为 failed。

正确判据不是 on-demand/prepaid 金额字段，而是 credits 响应是否有完整、有效的 `currentPeriod`。当 `currentPeriod` 存在且 `creditUsagePercent` 缺失时，应按 protobuf 语义解释为 `0%`；连有效周期也缺失时，才保留 t039 的 failed/stale 防线。

### 两个 deprecated 字段

无 `format` 的遗留接口：

```text
GET https://cli-chat-proxy.grok.com/v1/billing
```

返回两个容易误解的字段：

```text
config.monthlyLimit.val
config.used.val
```

两者属于 deprecated `GrokBuildBillingConfig`，`val` 单位为 USD cents：

- `monthlyLimit`：deprecated 月度包含金额预算；官方说明应使用 `creditUsagePercent`。
- `used`：deprecated 当前遗留账期已消费金额；官方说明应使用 `creditUsagePercent`。

本次只读响应中的示例：

```text
monthlyLimit.val = 15000  → USD 150.00
used.val         = 13434  → USD 134.34
```

这两个金额字段不是 SuperGrok 每周限额，不能计算为 weekly usage percent；`13434 / 15000 = 89.56%` 仅是遗留月度金额比值，与网页每周 `0%` 不矛盾。实现不得改用这两个 deprecated 字段作为 weekly credits fallback，也不得把金额比值展示成 SuperGrok 周用量。

## 复现

### 前置条件

- Grok OAuth 正式 instance 已保存有效 `OAUTH_TOKEN`。
- 账号具有 GrokPro/SuperGrok 与 Grok Code 权益。
- 当前 weekly credits 周期用量恰好为 `0%`。

### 步骤

1. 在网页用量页确认“每周 SuperGrok 限额”为 `0%`，记录重置时间。
2. 使用同一 bearer 请求 `/v1/billing?format=credits`。
3. 确认 HTTP 200，`config.currentPeriod.type` 为 `USAGE_PERIOD_TYPE_WEEKLY`，`currentPeriod.end` 与网页重置时间一致。
4. 确认 JSON 中没有 `creditUsagePercent`，on-demand/prepaid 金额字段为 0。
5. 在 OmniPanel 刷新该 Grok instance。

### 当前结果

- connector 产出 0 observations。
- `refresh-service` 将账号标为 failed/stale。
- UI 显示 `billing account has no available quota or usage data`，与网页 `0% 已使用` 冲突。

### 期望结果

- connector 产出总额度 observation：`used=0`、`limit=100`、`remaining=100`。
- `reset_at` 使用 `currentPeriod.end`。
- `window` 按 `currentPeriod.type` 映射；本复现场景为 `week`。
- UI 正常显示 SuperGrok 每周用量 `0%`，不进入 failed/stale。

## 范围

- 修正 Grok credits parser 对 proto3 默认零值省略的解释。
- 解析并校验 `currentPeriod.type/start/end`，用于确认合法周期、设置 `window` 与 `reset_at`。
- 保留显式非零 `creditUsagePercent` 和 `productUsage[].usagePercent` 的现有行为。
- 增加回归测试，覆盖真实脱敏 0% 响应、显式 0、非零、未知响应与 deprecated 字段误用防线。
- 修正文档中 t159 固化的错误“全零即无可用额度”结论，详细记录本 spec 的原因、复现和字段语义。

## 非范围

- 不修改 Grok OAuth、Vault、temp→formal instance 迁移或 scheduler。
- 不更改 `/v1/billing?format=credits` endpoint；该 endpoint 是正确的 weekly credits 数据源。
- 不使用 `/v1/billing` 的 deprecated `monthlyLimit` / `used` 生成 SuperGrok weekly observation。
- 不伪造缺少有效 `currentPeriod` 的未知响应；该情况继续 failed/stale 并保留历史。
- 不新增账号、订阅或支付信息日志。

## 验收标准

- [ ] `creditUsagePercent` 缺失但 `currentPeriod` 完整有效时，Grok connector 生成 `used=0`、`limit=100`、`remaining=100` 的正常总额度 observation。
- [ ] `currentPeriod.type=USAGE_PERIOD_TYPE_WEEKLY` 映射为 `window="week"`，`reset_at` 精确取 `currentPeriod.end`。
- [ ] 显式 `creditUsagePercent=0` 与字段省略得到相同结果。
- [ ] 非零 `creditUsagePercent`、现有 `productUsage` 与状态阈值行为保持不变。
- [ ] `creditUsagePercent` 与有效 `currentPeriod` 均缺失时仍 `report_failed_account`，不得返回 `ready + []` 或清空历史。
- [ ] deprecated `monthlyLimit.val` / `used.val` 不作为 weekly usage percent 数据源；测试防止 `used / monthlyLimit` 被误映射。
- [ ] 使用当前正式登录做真实刷新后，OmniPanel 与网页一致显示 SuperGrok weekly `0%` 及同一重置时间，不再报告“无可用额度”。
- [ ] 日志、fixture、文档不包含 token、Authorization、邮箱、UUID、订阅/支付 ID 或完整真实响应体。

## 依赖与约束

- 遵守 t039：真正未知的 HTTP 200 零观测响应必须 failed/stale，不能写 `ready + []`。
- 遵守 t159 OAuth temp→formal secret 保存规则；本 task 不修改该链路。
- 测试断言期望语义，不锁定历史误判。
- 真实响应 fixture 只保留完成语义验证所需的匿名字段。

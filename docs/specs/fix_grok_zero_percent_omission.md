# fix_grok_zero_percent_omission

> 验证方式：API + Desktop。固化自 t160。

## 契约

Grok/SuperGrok credits 数据源固定为：

```text
GET https://cli-chat-proxy.grok.com/v1/billing?format=credits
```

`config.creditUsagePercent` 是 proto3 无显式 presence 的数值标量。值为默认值 `0` 时，proto3 JSON 可省略该字段：

```text
creditUsagePercent = 0
→ JSON 不包含 creditUsagePercent
```

因此，总额度解析规则为：

1. 字段存在且为有限 number：保留现有显式百分比行为。
2. 字段省略且 `currentPeriod.type/start/end` 完整有效：解释为 `used=0`、`limit=100`。
3. 字段存在但为 `null`、字符串、`NaN` 或 Infinity：视为非法，不按 0 回填。
4. 字段省略且没有完整有效周期：视为未知响应，调用 `report_failed_account`；不得返回 `ready + []` 或清空历史。

周期映射：

| `currentPeriod.type`        | `window` | `cycleDurationMs` | `reset_at`          |
| --------------------------- | -------- | ----------------- | ------------------- |
| `USAGE_PERIOD_TYPE_WEEKLY`  | `week`   | 7 天              | `currentPeriod.end` |
| `USAGE_PERIOD_TYPE_MONTHLY` | `month`  | 30 天             | `currentPeriod.end` |

周期时间必须是合法 RFC3339 字符串，接受标准允许的小写 `t` / `z`；日历日期、时间、时区字段必须有效，且 `end > start`。未知 period type 不参与省略百分比回填。

显式有限百分比兼容旧响应：`currentPeriod` 缺失或无效时，仍使用 legacy `window="week"` 与 `billingPeriodEnd` reset。`productUsage[]` 同样继续使用 legacy weekly/reset 行为，不被总额度 `currentPeriod` 覆盖。

## 根因与回归链

真实 SuperGrok 页面显示 weekly `0%` 时，credits 响应包含完整 weekly `currentPeriod`，其 `end` 与网页重置时间一致，但 JSON 省略 `creditUsagePercent`。旧 parser 只接受显式 number，导致零 observations：

1. 初版 Grok parser 未覆盖 proto3 默认数值省略。
2. t039 将 HTTP 200 零 observations 改为 failed/stale，防止 `ready + []` 清空历史，但没有区分“有效周期内 0%”与未知响应。
3. t159 又把 unified billing 金额字段全零形状解释为无可用额度，使合法 weekly 0% 继续进入 failed。

正确判据是 credits 响应是否具有完整有效 `currentPeriod`，不是 on-demand/prepaid 金额字段。

## deprecated 金额字段

无 `format` 的遗留 endpoint 可能返回：

```text
config.monthlyLimit.val
config.used.val
```

两者属于 deprecated `GrokBuildBillingConfig`，单位为 USD cents：

- `monthlyLimit.val`：遗留月度包含金额预算；
- `used.val`：遗留账期已消费金额。

诊断响应曾出现：

```text
monthlyLimit.val = 15000  → USD 150.00
used.val         = 13434  → USD 134.34
```

`13434 / 15000 = 89.56%` 仅是遗留月度金额比值，不是 SuperGrok weekly usage。实现禁止读取这两个字段生成 weekly observation，也禁止将该比值展示为周用量。

## 复现

1. 在 Grok 网页用量页确认 SuperGrok weekly usage 为 `0%`，记录重置时间。
2. 使用同一正式 OAuth 登录只读请求 `/v1/billing?format=credits`。
3. 确认 HTTP 200、`currentPeriod.type=USAGE_PERIOD_TYPE_WEEKLY`、`currentPeriod.end` 与网页重置时间一致。
4. 确认 JSON 省略 `creditUsagePercent`。
5. 在 OmniPanel 刷新 Grok instance。

修复前：connector 产出零 observations，账号进入 failed/stale。

修复后：connector 产出 `used=0`、`limit=100`、`window="week"`、`reset_at=currentPeriod.end`，UI 显示 weekly `0%` 与同一重置时间。

## 验收与不变量

- 省略 percent + 完整有效 weekly/monthly period 均生成正常 0% observation。
- 显式 0 与省略 0 除采集时间外结果一致。
- 显式非零 percent、状态阈值与 `productUsage[]` 行为不回归。
- 真正未知 HTTP 200 零观测响应继续 failed/stale，保留 t039 防线。
- deprecated 金额字段不作为 weekly usage 数据源。
- 正式 packaged app 刷新结果与网页 0% 和重置时间一致。
- 日志、fixture、文档不得包含 token、Authorization、邮箱、UUID、订阅 ID、支付 ID 或完整真实 billing response body。

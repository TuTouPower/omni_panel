---
tid: t119
slug: kimi_high_usage_reset_alert
---

# Task spec

## 背景

Kimi 周额度已用 83%、数据标签已开启重置监控、全局剩余时间阈值为 20% 时，因距离重置仍约占周期 72.57%，未进入「即将重置」。现有实现只按剩余周期时间筛选，用户无法从高用量 warning 状态获知该受监控额度需要关注。

## 范围

- 将「即将重置」候选规则扩展为：已监控且具备未来 `resetAt` 与有效 `cycleDurationMs` 的数据标签，满足以下任一条件时进入卡片：
    - 剩余周期百分比不大于 `upcomingResetThresholdPercent`；
    - 用量状态为 `warning` 或 `critical`。
- 保留 `upcomingResetThresholdPercent` 的既有时间语义；阈值为空时仍关闭整个卡片。
- 调整卡片/设置说明，明确高用量受监控额度也会进入卡片，避免把用量百分比与剩余时间百分比混淆；空态不得再声明固定「未来 7 天」。
- 补 Kimi 真实链路回归：连接器输出的 `provider=kimi`、`accountKey=<source_instance_id>|kimi`、`raw_label=weekly` 与监控配置能够共同进入筛选；fixture 使用相对当前时间的 `resetTime`。
- 补「83% 已用且距重置超过时间阈值」的回归：已监控时应进入卡片；未监控、阈值为空、`resetAt` 无效时仍不得进入。

## 非范围

- 不改 Kimi API 请求、OAuth 或配额解析字段。
- 不改变用量 warning/critical 阈值（percent 75/90）。
- 不发送系统通知，不变更其他监控开关持久化结构。

## 验收标准

- [ ] 已监控的 Kimi `weekly` 在 `used=83`、`limit=100`、剩余周期大于时间阈值时进入「即将重置」。
- [ ] 仅以时间阈值入选的既有场景保持可用；阈值为空时卡片仍不挂载。
- [ ] 未监控、`resetAt` 为 null/过去时间、周期无效的 Kimi 周额度不进入卡片。
- [ ] 文案准确区分「剩余时间阈值」与「高用量受监控额度」，空态不再承诺固定 7 天窗口。
- [ ] Kimi connector 到 `collect_upcoming_resets` 的组合回归覆盖真实 `weekly` 标签和 poll 源 account key。
- [ ] 定向单元/集成测试、`pnpm typecheck` 与 `pnpm test` 通过。

## 依赖与约束

- 依赖现有 t041 时间阈值和 t043 metric 级监控配置。
- 实现不得为 Kimi 写专属筛选分支；规则适用于所有带 status、重置时间和周期的数据标签。
- 不读取或记录 secret。

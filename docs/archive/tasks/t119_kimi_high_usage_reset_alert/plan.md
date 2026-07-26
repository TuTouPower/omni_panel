---
tid: t119
slug: kimi_high_usage_reset_alert
---

# Task plan

## 步骤与验证

1. 固化「剩余时间或高用量」双入口规则与卡片文案 → 验证：先新增失败的 `collect_upcoming_resets` 用例。
2. 接入通用筛选逻辑，不引入 Kimi 特判 → 验证：定向 renderer 单测转绿。
3. 以 Kimi connector 的真实输出字段组装监控配置与分组 → 验证：新增组合回归覆盖 `weekly`、poll account key、相对 `resetTime`。
4. 更新相关设置/空态文案 → 验证：组件测试断言新说明与空态。
5. 完成全量质量门与运行时 UI 验证 → 验证：`pnpm typecheck`、`pnpm test`，并在测试实例确认 83% Kimi 受监控额度可见。

## 风险与回退

- 风险：第三方 connector 的 `status` 语义不统一，可能扩大卡片候选范围。
- 缓解：只接受既有枚举 `warning`/`critical`，并保留监控、未来 reset、有效周期三道门禁。
- 回退：恢复只按剩余周期时间筛选的条件；不改 config 数据结构。

## Finalization 时更新的 blueprint

- `docs/blueprint/domain.md`：补「即将重置」双入口筛选语义。
- `docs/guides/testing.md`：若新增 Kimi 连接器到 renderer 的组合测试入口，补充对应说明；否则无。

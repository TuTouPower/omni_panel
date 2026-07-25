# Task spec

## 背景

`connectors/kimi/connector.ts` 目前只解析 `/coding/v1/usages` 响应的 `usage`（周用量）与 `limits[].duration==300`（5 小时用量），漏掉了 `boosterWallet`（加油包）、`totalQuota`（总配额）、`user.membership.level`（会员等级）三个字段。

`vendors/kimicodebar` 的 `KimiCodeBarQuotaService.swift:135-221` 提供了完整解析逻辑，含两个关键坑：

1. **余额单位**：`balance.amountLeft` 单位是 **1e-8 元**（`315250700 = ¥3.15`），文档无记载。
2. **启用状态陷阱**：仅当 `status ∈ {STATUS_ACTIVE, STATUS_ENABLED}` 时 `amountLeft` 才是真余额；未启用时该字段返回「月度上限 − 月度消费」的误导值，应显示 0。proto3 的 `false` 会被省略，`monthlyChargeLimitEnabled` 缺省即无限制。

## 范围

- 改 `connectors/kimi/connector.ts`：
    - 解析 `boosterWallet`：新增 metric `kimi:booster_balance`（加油包余额，元，display_style: "number"）。
    - 解析 `totalQuota`：新增 metric `kimi:total_quota`（总配额用量，percent）。
    - 解析 `user.membership.level`：写入 observation 的 `account_label` 或新增只读 metric（按现有 provider 惯例决定）。
    - `status` 判定：加油包余额 metric 不参与 warning/critical 阈值（仅展示）。
- 单测：`tests/unit/connector/kimi-connector.test.ts` 补三条：boosterWallet 启用时正确换算 1e-8、未启用时显示 0、totalQuota 与 membership 字段存在。

## 非范围

- 不做加油包余额的监控重置 bell（后续按需）。
- 不改 UI 展示（`UsageBarList` 已支持 number display_style）。

## 验收标准

- [ ] 加油包启用时余额正确显示（元，两位小数）。
- [ ] 加油包未启用时余额显示 0，不显示误导值。
- [ ] 总配额与会员等级字段正确解析。
- [ ] `pnpm test` 全绿。

## 依赖与约束

- 无前置 task（不依赖 t112 的 OAuth；API Key 路径同样返回 boosterWallet 字段）。

# Task plan

## 步骤与验证

1. 改 `connectors/kimi/connector.ts` 解析 boosterWallet/totalQuota/membership → 验证：`tests/unit/connector/kimi-connector.test.ts` 红→绿。
2. `pnpm test` 全绿 → 验证：CI 命令。

## 风险与回退

- 风险：`status` 枚举值未来新增（如 `STATUS_PAUSED`）导致 `isEnabled` 误判。 → 回退：用 `upperStatus === "STATUS_ACTIVE" || upperStatus === "STATUS_ENABLED"` 白名单，新增状态默认视为未启用（保守显示 0）。

## Finalization 时更新的 blueprint

- `docs/blueprint/domain.md`：「Kimi」小节补 boosterWallet 字段口径与 1e-8 单位说明。

# Task plan

## 步骤与验证

1. 新建 `src/main/core/token-stats/scan-state.ts`，迁移类型 + serde 函数；`save_state`/`load_state` 加 `on_warn` 回调入参 -> 验证：`pnpm typecheck`。
2. `collector.ts` import 共享 serde，删除内联实现，`save_state`/`load_state` 调用处传 `forward_log` -> 验证：`pnpm vitest run tests/unit/main/core/token-stats/collector-state.test.ts` 7 用例全绿。
3. `pnpm test` 全绿 -> 验证：CI 命令。

## 风险与回退

- 风险：`forward_log` 反向依赖（scan-state.ts 不应 import collector.ts）。 -> 回退：serde 函数加 `on_warn?: (msg: string) => void` 入参，collector 调用点传 `forward_log.bind(null, "warn", "collector")`。
- 风险：迁移漏搬常量（`BOOSTER_AMOUNT_DIVISOR` 等不属 serde，勿误移）。 -> 回退：仅搬 serde 相关，逐函数核对。

## Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：「token-stats」小节补一句「serde 独立 `scan-state.ts`」（如该处已有 collector 描述）。

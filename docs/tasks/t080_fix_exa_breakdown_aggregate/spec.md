# Task spec

## 背景

真实 Exa 用量返回（`exa-api-response.json`，用户提供的线上实测）中，`cost_breakdown` 按 `price_id` 拆项，同一 `price_name` 对应多个不同 `price_id`：Search ×3、Contents endpoint ×2、Answer ×2，共 7 项。现 `connectors/exa/connector.ts:94-112` 逐项发 observation（`metric_id=exa:{price_id}`、`normalized_label=price_name`），面板出现 7 行仅 3 个重名标签的指标，显示乱七八糟。既有测试 `tests/integration/connector/exa_connector.test.ts` 的 `USAGE_PAYLOAD` 中 price_name 全唯一，未覆盖真实形态。

## 范围

- `connectors/exa/connector.ts`：`cost_breakdown` 按 `price_name` 聚合后发行（`amount_usd` 求和；同名多项合并为一行）。聚合后 `metric_id` 需稳定且同类唯一（由 price_name 归一化派生，不再用随机的 price_id），保证历史/趋势按稳定 key 累计。
- 根目录 `exa-api-response.json` 脱敏后（`id` / `api_key_id` / `team_id` 换占位值）移入测试目录作 fixture，根目录不保留。
- `exa_connector.test.ts` 用真实形态 fixture 覆盖重名聚合场景；既有唯一名场景保持有效。

## 非范围

- 不改展示层（renderer / web）与阈值语义；不改 `total_cost_usd` 行的 LIMIT/status 逻辑。
- 不改其他连接器。

## 验收标准

- [ ] 真实形态输入聚合为每类一行：Search $0.231 / Contents endpoint $0.004 / Answer $0.010（数额对得上 `exa-api-response.json`），total 行 $0.245 不变。
- [ ] 聚合各类之和 = `total_cost_usd`（舍入误差内），测试显式断言。
- [ ] 聚合后 `metric_id` 稳定（同 price_name 多次请求产出同 id），测试断言无 price_id 混入。
- [ ] fixture 已脱敏并移入测试目录；`pnpm test` / `pnpm typecheck` / `pnpm lint` 全绿。

## 依赖与约束

- 无前置 task；不依赖网络（fixture 离线重放）。
- 密钥规则：fixture 入库前必须脱敏，不得保留真实 key/team 标识。

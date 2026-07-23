# Task spec

## 背景

review_20260723_opus：P1 连接器空响应静默；I5（`connectors/cpa/connector.ts:524-540`）`fetch_provider` 在 manager 转发上游非 2xx 时 `parse_api_body` 静默返回 `{}`，`parse_provider` 返回 `[]`，该账号既无 observation 也未 `report_failed_account`，违反「采集成功但零有效观测视为采集异常」。mimo（`:135-165`）空 items return []；minimax（`:150`）空 models return []。grok 已做正确处置，可作模板。

## 范围

- cpa：`parse_api_body` 非 2xx throw，或 main 检测 `keys.length===0` 时 `report_failed_account`。
- mimo：空 items 时 `report_failed_account`（非静默 return []）。
- minimax：空 models 时 `report_failed_account`。
- 参照 grok 的空响应处置模式推广。

## 非范围

- 不改「真零用量」（如 exa total_cost_usd=0，t049 明确返回 total=0 观测）的语义——本 task 针对「接口异常/空体」非「合法零值」。

## 验收标准

- [ ] cpa 上游非 2xx → report_failed_account（UI 显示采集失败）。
- [ ] mimo/minimax 空响应 → report_failed_account。
- [ ] 单测覆盖空体/非 2xx 路径。
- [ ] 合法零值（真零用量）仍返回观测，不误报失败。

## 依赖与约束

- 需区分「接口异常空」与「合法零值」；与 t049 exa 零用量语义对齐。

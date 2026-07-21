# Adoption T028

owner 自审（observation_mapping error 映射，一行改动 + 单测）。

| 项                                         | decision | rationale                                                                                               | status |
| ------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------- | ------ |
| observation_to_metric_record 加 error 映射 | 采纳     | `...(obs.last_error != null && { error: obs.last_error })`，Observation.last_error → MetricRecord.error | 已修   |
| 单测 3 用例                                | 采纳     | last_error 有/null/absent 三场景                                                                        | 已修   |
| e2e account_error_badge                    | 遗留     | 展开按钮 timeout（Kimi card getByRole("展开") 不匹配）非 T028 scope；待 Part2 data + 展开按钮调试       | 遗留   |

## 处置说明

- observation-mapping.ts L48：加 `...(obs.last_error != null && { error: obs.last_error })`。Observation（observation-store）有 `last_error TEXT`（L55），refresh-service L284 标记 stale 时赋值 `failed.error`。映射后 MetricRecord.error 有值 → T027 badge UI 激活。
- observation_mapping_error.test.ts：3 用例绿（last_error 有值 → error / null → undefined / absent → undefined）。
- e2e badge case：Kimi card 展开按钮 getByRole("展开") timeout（Page snapshot 显示 Kimi card 有 "展开" button，但 getByRole 匹配需排查 accessible name），非 T028 scope。
- vitest 1428 passed。

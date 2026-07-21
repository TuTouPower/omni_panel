# Task plan

## 步骤与验证

1. 派 3 个 sub agent 并行改 7 spec（分组：direct+session / ai-cli-token-stats / cpa+runtime+scheduler+observation-store） → 验证：每 agent 返回改动清单
2. 主控读改动后 spec 抽查关键差距点 → 验证：对照代码 file:line 一致
3. grep 核对无遗留错误描述 → 验证：关键符号命中
4. task.py finish + mv archive + commit

## 风险与回退

- 风险：sub agent 改 spec 时引入新错误 → 主控抽查每 spec 至少 2 个关键点
- 风险：spec 间交叉引用（如 per-account error 在 cpa/runtime/scheduler 都提）口径不一 → 统一用 `ctx.report_failed_account` / `failed_accounts` / `FailedAccount` 术语
- 回退：分支 t033 可整体丢弃

## Finalization 时更新的 blueprint

- 无（specs/ 本身即产物；blueprint 不涉及）

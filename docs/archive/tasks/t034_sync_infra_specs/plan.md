# Task plan

## 步骤与验证

1. 派 3 sub agent 并行：ipc+platform-services / ui-views / config-store+web-panel+window-management → 验证：返回改动清单
2. 抽查关键点（0.0.0.0、tokenStats 通道、maxWidth 1400）→ 验证：grep
3. finish + mv + commit

## 风险与回退

- ui-views 改动面大（8 task 功能）→ 要求 agent 每点附 file:line
- 回退：分支 t034 可丢弃

## Finalization 时更新的 blueprint

- 无

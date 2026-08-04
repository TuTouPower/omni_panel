# Spike report

## 问题

t204 代理面板模型筛选需先核实两个契约：

1. 模型列表（窗口内 distinct model）的准确来源：records 全窗口 distinct 与物化窗口（hour_rollup UNION records edge）distinct 是否一致。
2. model 过滤加到 dashboard 窗口物化（`dashboard_window_union_builder`：hour_rollup 整小时段 + records 边缘小时段两侧）后，聚合结果与 records 全窗口过滤是否一致。

## 成功判据

- 两种来源的 distinct model 数量一致（或给出差异原因与选型依据）。
- model 过滤加在 union 两侧后，calls / 会话数 / tokens 三指标与 records 全窗口过滤完全一致。

## 尝试

用本机真实 token-stats 库（`AppData/Roaming/OmniPanel/observations.sqlite`，530k records）以最近 7d 窗口 `[end-7d, end]`、`end=MAX(timestamp)` 实测，SQL 复刻 store 的 `dashboard_window_union_builder` 结构（整小时段走 hour_rollup、窗口首尾不足小时走 records，`full_start/full_end` 计算同 store）。

## 证据

1. **distinct model**：records 全窗口 distinct = **19**；union 窗口（rollup 整小时段 + records 边缘段）distinct = **19**，一致。`ORDER BY model` 排序稳定，适合作下拉选项。
2. **model 过滤一致性**（`gpt-5.6-sol`）：
    - records 全窗口过滤：calls=12850，sessions=43，tokens=1261048396
    - store 结构 union 两侧加 `AND model=@m`：calls=12850，sessions=43，tokens=1261048396 → **完全一致**。
3. 单独验证：hour_rollup 整小时段 + model 过滤独立聚合（calls=12850/sess=43/tok=1261048396）即等于 records 全窗口（该窗口边缘小时无此模型数据），证明 rollup 侧已含全部聚合量。
4. `SUM(input_tokens+output_tokens+cache_read_tokens+cache_write_tokens)` 与 `COUNT(DISTINCT source||env||session_id)` 在 union 两侧过滤后均正确；calls 须用 `SUM(calls)`（rollup 行已是聚合值，`COUNT(*)` 会双重计数）。

## 结论

- 模型列表来源：从 `token_stats_records` 按 agent/platform/range 过滤查 `SELECT DISTINCT model ORDER BY model` 即可（records 全窗口 distinct = union 窗口 distinct，均 19）。注意该查询**不得含 model 过滤条件**——模型下拉需保持全窗口模型列表，选中某模型后仍能直接切换其他模型（AC1）。
- model 过滤：在 `dashboard_window_union_builder` 的 rollup_part 与 records_part 两侧 WHERE 各加 `AND model = @model`（与 agent/env 过滤并列），并在 `dashboard_records_source`（rollup 未就绪路径）与 `build_dashboard_conditions` 同步加条件；聚合语义与全窗口过滤一致。
- 实验脚本初版（WITH CTE + 全列 SELECT）出现过 sess=1 的误结果，复现 store 的子查询结构后一致——以 store 结构为验证基准。

## 是否采纳

- 决定：是
- 理由：两契约均验证通过，实现路径明确。
- 后续 task：t204

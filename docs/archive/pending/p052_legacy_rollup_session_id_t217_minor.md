# p052 legacy rollup 路径 session 分组仍按裸 session_id（t217 审阅 minor）

- 来源：t217_code_f001
- 内容：legacy `prepareBarDataFromRollup`（chart-data.ts:822）/ `rollup_group_metric`（:985,1012）的 session 轴与去重 key 仍为 `${source}|${session_id}` 不含 env，跨 env 同 session_id 在此两处仍合并。当前 `rollup` prop 恒为 `never[]`（TokenStatsView.tsx:592）不可达，属 p040 复发陷阱。若未来恢复该 fallback 路径须一并补 env。
- 处理：fe80caa2

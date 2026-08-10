# p044 用量面板所有账号 sparkline 恒显「近 7 天数据不足」

- 现象：展开任意账号，token 消耗折线图区恒显「近 7 天数据不足」，无折线。期望：展示该账号近 7 天用量趋势。
- 影响：全账号、全指标（CPA Claude five_hour/seven_day、opencode_go rolling/weekly/monthly、grok、tavily 等）sparkline 全失效；折线图功能整体不可用。回归自 commit 48512085（p022）。
- 根因：`ProviderAccountRow.tsx:112` 把 `period.raw_label`（短标签，如 `five_hour`、`monthly`）当作 `metric_id` 传给 `trend:getBulk` IPC。`trend-ipc.ts` 透传该值给 `observation-store.query_trend_series`，其 SQL `WHERE provider=? AND account_id=? AND metric_id=? AND observed_at>=?` 按 `metric_id` 列精确匹配。但 observation 写入时 `metric_id` 列存的是 connector 构造的完整键，与 raw_label 不一致：
    - CPA Claude: `claude:${account_id}:${key}`（如 `claude:acc-1:five_hour`），raw_label=`five_hour`
    - opencode_go: `opencode_go:${raw_label}`（如 `opencode_go:monthly`），raw_label=`monthly`
    - grok: `grok:product:${raw_label}`，raw_label=产品名
    - tavily: `tavily:monthly_usage`，raw_label=`total-month`
      两者从不相等 → 查询 0 行 → 7 天全 null → `valid_points.length < 2` → 显示占位文案。产品缺陷（前端查询键与存储键不一致）。
- 测试缺口：
    1. `trend-ipc.test.ts` 用 mock store，mock 内 `metric_id === "5h"` 直接匹配传入值，绕开真实 store 的完整键逻辑——无法 catch 键不匹配。
    2. `provider_account_row` 前端测试只断言「调用参数是 raw_label」，不验证端到端数据返回。
    3. 缺集成测试：connector 产出 observation → store.insert → 用前端 bulk 实际传递的键查询 → 断言非空。
       补测方向：加跨层集成测试（真实 store + 前端实际传递的 metric_id 值），或在 trend-ipc 层接真实 store 跑回归。
- 线索：`.scratch/`（本 skill 仅只读探查，未产生 scratch 文件；根因全在源码与 git blame）
- 处理：t207

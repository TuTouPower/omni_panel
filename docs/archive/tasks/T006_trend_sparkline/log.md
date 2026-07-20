# Task log

只记录有追溯价值的进展、踩坑、中途决策、偏离 plan 原因和关键验证结果；不写命令流水账。

## 记录

- **2026-07-20** 实施完成。6 步全部落地:
    - 数据层:`observation-store.ts` 新增 `query_trend_series(provider, accountId, metricId, days)` + 索引 `idx_trend ON observations(provider, account_id, metric_id, observed_at)`(migration)。
    - 归一层:`build_trend_series(records)` 纯函数(见下条落位偏离)。
    - IPC:`src/main/ipc/trend-ipc.ts` 注册 `trend:get`,走 `assert_valid_sender` + 白名单。
    - Web:`src/main/core/local-api/server.ts` 新增 `/v1/trend` 端点。
    - 组件:`TrendSparkline.tsx`(内联 SVG,`--blue`/`--track`)+ `ProviderAccountRow.tsx`(懒查 + `useRef<Map>` 缓存 + 失败不写缓存)。
    - 测试:8 + 6 + 5 + 6 用例(unit/shared + unit/renderer/TrendSparkline + integration/observation-store + unit/preload/route_api)。
- **偏离 plan:`build_trend_series` 落位 `src/shared/lib/trend.ts` 而非 spec 写的 `provider-usage.ts`**。
    - 原因:`trend-ipc.ts`(main 进程)和 `local-api/server.ts`(main 进程)都要调用该函数,`provider-usage.ts` 在 `src/renderer/lib/` 无法跨进程 import;放 `shared/lib/trend.ts` 才能被 main/renderer 双侧复用。
    - 签名调整:去掉 `days` 参数。`days` 由 `query_trend_series(days)` 在 store 层负责 null-fill 出 days 长度,纯函数只做点态归一,去掉 `days` 更内聚。
    - spec/plan 文本未改,本 log 即记录分歧。
- **关键验证**:
    - `pnpm test`:137 文件 / 1396 用例 / 0 失败。
    - `EXPLAIN QUERY PLAN` 集成测断言 `SEARCH observations USING INDEX idx_trend (provider=? AND account_id=? AND metric_id=? AND observed_at>?)` 命中,排除 `idx_lookup`。
    - 配色硬约束:`TrendSparkline.tsx` 与 `globals.css` 均无 `--accent`,只用 `--blue`/`--track`/`--text-3`/`--card-bg`。
- **review**:2026-07-21 两路 sub agent 并行评审,12 finding(code 6 + test 6)。adoption 详见 `adoption.md`。

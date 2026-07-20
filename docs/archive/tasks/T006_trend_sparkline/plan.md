# Task plan

## 步骤与验证

1. 核对 `idx_lookup ON (provider, account_id, metric_id, source_instance_id, observed_at)`（`observation-store.ts:44-45`）**无法**高效覆盖趋势查询--`metric_id`/`source_instance_id` 在 `observed_at` 之前，`WHERE observed_at>=?` 走不到范围扫描；确认需新增 `CREATE INDEX IF NOT EXISTS idx_trend ON observations(provider, account_id, metric_id, observed_at)`。 -> 验证：`EXPLAIN QUERY PLAN` 确认 `idx_trend` 命中。
2. 红测：`build_trend_series` 单元测试（7 点升序、缺日 null、不足、空、ratio 归一）。 -> 验证：`pnpm test` 红。
3. `provider-usage.ts` 实现 `build_trend_series`；纯函数，不直连 store。 -> 验证：转绿。
   4a. `observation-store.ts` 加 `query_trend_series(provider, accountId, metricId, days)` + 新增 `idx_trend` 索引（纳入 migration）；单测验证。 -> 验证：返回 7 点。
   4b. `ipc/` 加 handler `trend:get`；对照 T001 分权模式，明确 `preload/index.ts` / `preload/route_api.ts` 的白名单字段与 route capability 放行 usage/agent。 -> 验证：`pnpm typecheck` 通过；IPC 手测返回。
   4c. `usageboard-web.ts` + `local-api/server.ts` 加 `/v1/trend?provider=&accountId=&metricId=&days=` 端点转发。 -> 验证：web 版手测返回 7 点。
4. `TrendSparkline.tsx`：纯 SVG，参考 demo `data/index.html` 的 `trendSVG`（viewBox 560×150、0/50/100% 网格、渐变面积、折线、数据点圆点），颜色用 **`--blue`/`--track`**（**`--accent` 不存在，禁用**）；<2 点占位。 -> 验证：组件单测 + 视觉快照。
5. `ProviderAccountRow.tsx`：展开态在 `UsageBarList` 下方挂 sparkline；**每 metric 一条纵向排列**；懒查缓存用 `useRef<Map<string, TrendPoint[]>>`，key = `${provider}:${accountId}:${metricId}`，展开时先查缓存命中则不发 IPC，未命中调 `trend:get` 后写回，失败不写缓存以允许重试。 -> 验证：展开/收起交互；失败兜底。
6. 黑盒：`pnpm test` + `test:visual`；web 版 `/v1/trend` 端到端。 -> 验证：全绿。

## 风险与回退

- 风险：observations 表数据量大时查询慢。
    - 回退：步骤 1 新增 `idx_trend`；查询限定 `observed_at >= now - days`。无需其他索引。
- 风险：不同 metric 的 used/limit 单位不一致（百分比 vs 比率），折线失真。
    - 回退：sparkline 统一画 `percent`（0–100），`ratio` 型在 `build_trend_series` 内归一。
- 风险：懒查抖动（展开后空白 -> 数据返回撑高）。
    - 回退：占位区固定 `min-height` 等于 sparkline 高度。
- 风险：IPC 白名单/分权策略漏放 `trend:get`。
    - 回退：对照 `preload/route_api.ts` 现有 usage route 能力补齐，typecheck 兜底。

## Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：数据流补「趋势时序消费支路」+ IPC handler 列表加 `trend:get` + `idx_trend` 索引说明。
- `docs/specs/observation-store.md`：补 `query_trend_series` 查询语义与 `idx_trend`。
- `docs/specs/ipc.md`：补 `trend:get` 端点与 route 能力。
- `docs/specs/web-panel.md`：补 `/v1/trend` 端点。
- 注：`domain.md §6` 产品边界 + `decisions.md` 决策条目由前置 **T007** 落地，本 task 实施时引用 T007 决策编号。

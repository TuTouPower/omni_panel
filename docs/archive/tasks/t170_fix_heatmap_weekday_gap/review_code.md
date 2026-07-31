# Task review t170（reviewer_focus: 代码）

- task：`t170_fix_heatmap_weekday_gap`
- spec：`docs/tasks/t170_fix_heatmap_weekday_gap/spec.md`
- diff_anchor：`fe7313965db211188550164352711b4d662a81db`
- target：`git diff fe7313965db211188550164352711b4d662a81db`
- round：1
- reviewed_at：2026-07-31 15:52 UTC+8

## Findings

### t170_code_f001 - web 构建 getHeatmap 丢弃窗口/平台/agent 过滤，热力图退化为全表聚合

- 严重度：important
- 锚点：AC1「选定任意 >=7d 窗口，热力图窗口内实际有数据的 weekday 列都有着色」、AC3「24h×7 格的热力图数值与 records 全量（无 LIMIT）聚合一致」——web 面板下聚合范围不再受所选窗口/筛选约束，窗口外数据计入格子。
- 位置：`src/web/usageboard-web.ts:202`；`src/main/core/local-api/server.ts:296`
- 问题：渲染器统一以 `window.usageboard.tokenStats.getHeatmap({...env_filter, ...agent_filter, start: currentRange.start, end: currentRange.end})` 获取热力图（`TokenStatsView.tsx:230-235`）。Electron 主链路（preload → IPC → `store.query_heatmap`）过滤正确。但 web 构建的 `getHeatmap` 实现为 `() => get_json("/v1/heatmap")`，完全丢弃入参；`/v1/heatmap` 路由也只转发 `env`/`start`/`end`（`server.ts:296-306`），不读 `agent` 查询参数。结果 web 面板（`pnpm build` 经 `vite.web.config.ts` 产出，浏览器访问桌面 local-api 的既有发布面，`App.tsx:15` 经 hash `agent` 可达）的热力图聚合整张 `token_stats_records`（全时间 × 全平台 × 全 agent），与所选 preset 窗口/平台/agent 无关。t170 前 web 热力图走 `currentRecords`（客户端 `filtered` 按窗口裁剪，`TokenStatsView.tsx:303-306`），小库下窗口语义正确；本次改动使 web 热力图在任意窗口尺寸下都失去窗口裁剪，属于对既有正确行为的回归，且宽窗口 AC 修复在 web 面不生效。
- 建议：`getHeatmap` 按 `trend.get` 方式用 `URLSearchParams` 传 `env/agent/start/end`；`/v1/heatmap` 读取并转发 `agent`（`start`/`end` 沿用 `Number()` 处理）。补 web 侧过滤透传测试。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无（Round 1）
- 本轮新发现：1 条（t170_code_f001，important）
- 未进表的提示：
    - 文件过大（实现源码 >400 行且本 task 净增，均 <800 未达 important 阈值，且无由此直接引发的可观测缺陷，按降级规则仅在结论段列出）：
        - `src/renderer/lib/token-stats/chart-data.ts` 723 行（净增 +38）
        - `src/renderer/views/TokenStatsView.tsx` 676 行（净增 +24）
        - `src/main/core/token-stats/token-stats-store.ts` 535 行（净增 +39）
        - `src/main/core/local-api/server.ts` 530 行（净增 +11）
        - `src/preload/index.ts` 474 行（净增 +7）
        - `src/shared/types/ipc.ts` 455 行（净增 +4）
    - 复杂度：无 ≥15 CC 新函数。`query_heatmap` 约 5（4 个条件 if），`prepareHeatmapFromCells` 约 2。
    - 范围外观察：
        - 热力图时区由「渲染器本地时区」（旧 `new Date().getDay()/getHours()`）改为固定 UTC+8（`strftime ... '+8 hours'`）。与 spec「时区固定 UTC+8」决策一致（d002/s003），主平台（UTC+8）行为不变；注意热力图按 UTC+8 而 buckets 的 `bucket_date` 按 UTC 日界，属已批准决策，非本次引入问题。
        - `prepareHeatmapData` 现仅被测试引用（作为全量 records 聚合参照），保留符合 spec 测试策略，不算死代码。
        - AC3「SQL 聚合 == 全量 records reduce」在单元测试中未直接对拍（store 测试对拍手工期望值、chart-data 测试对拍手工 cell）。直接对拍时需注意 `prepareHeatmapData` 用运行环境本地时区、SQL 用 UTC+8，非 UTC+8 环境对拍会不一致——属 test reviewer 关注面，仅提示。
- 总体判断：Electron 主链路（IPC → SQL 聚合 → renderer `(weekday+6)%7` 转换）正确、类型与三 metric 口径一致，store/renderer/IPC 测试齐全且全部通过；唯一 blocker 是 web 构建的 heatmap 过滤透传缺失，导致 web 面板热力图窗口/筛选失效。
- 系统性 follow-up：无

verdict: FAIL

## Round 2 (2026-07-31 16:10 UTC+8)

### 前轮 finding 复核

- t170_code_f001（important，web heatmap 过滤透传缺失）：**已修**，以 diff/测试核实，不采信处置表：
    - `src/web/usageboard-web.ts:203-211`：getHeatmap 改用 `URLSearchParams`，`agent`/`env`/`start`/`end` 有值即 `params.set`，请求 `/v1/heatmap?…`。web shim 单测 `tests/unit/web/usageboard-web.test.ts` 新增两条：全参数透传（`agent=claude-code`/`env=win`/`start=100`/`end=200`）与无 filters 时省略 query string。
    - `src/main/core/local-api/server.ts:296-309`：`/v1/heatmap` case 从 `url.searchParams` 读 `agent`/`env`/`start`/`end` 并转发 `store.query_heatmap`，与 `/v1/records` 同构。
    - 链路闭环：`TokenStatsView.tsx:230-235` 并行 `getHeatmap({...env_filter, ...agent_filter, start: currentRange.start, end: currentRange.end})`（窗口=显示窗口，闭区间与 `filtered` 一致）；`Heatmap.tsx` 消费 `cells`。集成测试 `server.test.ts` 覆盖 `/v1/heatmap` 无 auth + env/start/end 过滤；store 单测覆盖 agent/env/时间过滤与 7-weekday 全着色。AC1/AC2/AC3 口径已由测试锚定。

### 本轮新发现

0 条。

### 未进表的提示

- 文件过大（<800 未达 important 阈值，按降级规则仅列出）：`chart-data.ts` 723、`TokenStatsView.tsx` 676、`token-stats-store.ts` 535、`server.ts` 533、`preload/index.ts` 474、`ipc.ts` 455。较 Round 1 仅 server.ts +3（heatmap case），无净增超阈值。
- 复杂度：`query_heatmap` / `prepareHeatmapFromCells` 均 <10，无新 ≥15 CC 函数。
- `docs/blueprint/architecture.md` 尚无 token-stats 数据源矩阵热力图行（spec 上下文区「Finalization 时更新 blueprint」要求）。当前 task 未 finalize，属收尾待办，非本轮代码缺陷。
- 防御性观察：`prepareHeatmapFromCells` 对 hour/weekday 越界无显式守卫（`row[c.hour]` 对 hour>23 会写数组越界索引，但 `build_heat_data` 只遍历 0..23，越界值不进渲染）。SQL `strftime('%w'/'%H')` 保证 0..6 / 0..23，无实际失败场景，不构成 finding。

### 总体判断

Round 1 唯一 blocker t170_code_f001 两处（web shim 透传 + server 路由读 agent）均已按 diff 修复并补测试闭环；完整 `pnpm test` 1922 passed（184 文件）、typecheck 通过。Electron 与 web 双链路热力图窗口/agent/env 过滤语义一致，无新 blocker。

verdict: PASS

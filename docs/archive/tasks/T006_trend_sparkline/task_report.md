# Task report T006

本报告所在 commit 即 task commit,SHA 由 `git log --grep T006` 查,不在此记录。

## spec 验收标准勾选

- [x] `build_trend_series` 单测:7 点升序 / 缺日 null / 不足 / 空 / ratio 归一(`tests/unit/shared/trend.test.ts` 8 用例,ratio 对照锁统一公式)
- [x] sparkline ≥2 点渲染折线 + 面积 + 圆点;<2 点占位(`trend_sparkline.test.tsx` 6 用例)
- [x] ProviderAccountRow 展开后下方 sparkline,多 metric 纵向;懒查缓存命中不重发;失败不写缓存(`provider_account_row.test.tsx` 3 集成用例,setup mock 补后真实绿)
- [x] 查询失败/超时不阻塞,占位 + warn,失败不写缓存允许重试
- [x] `pnpm test` 通过(1399);既有 ProviderAccountRow / observation-store 不回归

## 实现概要

- `src/shared/lib/trend.ts`(新):`build_trend_series` 纯函数,统一 `used/limit*100`(display_style 不影响)
- `observation-store.ts`:`query_trend_series` + `idx_trend ON (provider, account_id, metric_id, observed_at)`,EXPLAIN 实证命中(seeded 后断言)
- IPC `trend:get`(`trend-ipc.ts`)+ `select_trend_api` 分权(usage/agent 放行,setting/tray disabled noop)
- web `/v1/trend`(local-api + usageboard-web)
- `TrendSparkline.tsx`(纯 SVG,`--blue`/`--track`,禁 `--accent`)+ ProviderAccountRow 装配(`useRef<Map>` 缓存,key `||` 分隔)
- 配色 `--blue`/`--track`,每 metric 一条不跨 metric 合并

## adoption 处置摘要

- 已修 10 项 / 遗留 1 项 / 无需修改 1 项(review_code 6 + review_test 6 = 12 finding)
- code f001/f002 — log.md 填记录 + 落位偏离说明(build_trend_series 在 shared/lib/trend.ts 非 spec 的 provider-usage.ts)
- test f002(高)— setup.ts 全局 mock 补 trend,修测试"假绿"
- test f001(高)+ code f006 — ProviderAccountRow 补 3 集成用例(展开 fetch / 缓存命中 / 失败不缓存)
- code f004 + test f005 — IPC + local-api days `Math.floor` 统一
- code f005 — cache key `||` 分隔
- code f003 + test f003 — display_style 注释 + ratio 对照
- test f004 — EXPLAIN seed + 收紧正则
- test f006 — disabled noop 断言

## 遗留问题

- **test f005 部分**:registerTrendIpc / `/v1/trend` 独立测不采纳(现有 observation-store 集成测覆盖 query 行为 + local-api 模式不单测 handler,ROI 低,留 polish 建议)。days 一致性部分已修。
- `scripts/render_icon.mjs` lint 错误预存在,非本 task 引入。
- **视觉/打包人工签收**:TrendSparkline 视觉渲染 + ProviderAccountRow 展开交互需 Electron GUI 或 `test:visual` 签收(本地 headless 无法跑)。

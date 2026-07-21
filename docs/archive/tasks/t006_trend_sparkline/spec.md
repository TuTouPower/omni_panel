# Task spec

## 背景

`observation-store`（SQLite observations 追加表）已保留历史观测，但聚合层 `provider-usage.ts` 只产当前快照，renderer 拿不到「近 7 天用量趋势」时序，无法在账号展开区显示迷你折线。对标 demo `trendSVG` 的内联 SVG sparkline，给每个账号的每条 metric 嵌入近 7 天 used/limit 走势，增强一眼可读性。

## 参考来源与设计取舍

- **参考来源**：`data/index.html` 的 `trendSVG()` 函数（viewBox 560×150、0/50/100% 网格线、左侧刻度、X 轴 7 日期、折线 + 渐变面积填充 + 数据点圆点）；`data/OmniUsage-横竖屏响应式界面-spec.md` §8.3-3。原型仅作 SVG 结构参照，不照抄配色与 mock 数据。
- **采纳**：内联 SVG sparkline 的**绘图结构**（viewBox、网格、折线 + 面积、圆点）--零依赖、轻量、可嵌入账号行展开区，符合「迷你走势」定位。
- **配色不照搬 demo**：demo 硬编码 `#3d7bff` / `rgba(61,123,255,…)`；本项目改用 `--blue`（强调色，与 `--primary` 一致）/ `--track` CSS 变量（**`--accent` 在 `globals.css:7-26` 不存在，改用 `--blue`**），保证主题切换（明/暗）与现有用量条配色一致。
- **数据不照搬 demo**：demo 用 `trendFor(name)` 按名称哈希生成 7 个 mock 点；本项目从 `observation-store` 真实历史按天聚合，缺日填 `null`，数据不足按实际点数渲染。
- **不采纳 ECharts 完整图表**：本项目 `token-stats/BarChart.tsx` / `Heatmap.tsx` 已有完整图表组件，但属独立 TokenStats 窗口且生产被 `VITE_ENABLE_TOKEN_PANEL` 关闭；账号行只需迷你走势，ECharts 体积与初始化成本不值得。sparkline 用纯 SVG，零新依赖。
- **不照搬 demo 的「近 7 天」固定 X 轴日期**：日期标签由真实数据 `observed_at` 派生，不硬编码 `'07.14'…'07.20'`。
- **每 metric 一条 sparkline，不跨 metric 合并**：Claude 账号有「5 小时」「一周」两 metric；跨 metric 合并会混算 percent 失真。按 `(accountId, metricId)` 分组。

## 范围

- `observation-store.ts` 新增查询：按 **`(provider, accountId, metricId)`** 取最近 7 天、每天最新一条 observation 的 **`used` / `limit` / `display_style`**（表无 `percent` 列，不返回 percent）；表列 `observed_at`（snake_case）映射到 `MetricRecord.observedAt`/`resetAt`（camelCase），查询层做命名转换；返回 7 点时序；数据缺失日期填 `null`。
- `provider-usage.ts` 新增 `build_trend_series(records, days = 7)`：把 store 查询结果归一为 `({ date, percent } | null)[]`；`percent = clamp(round(used/limit*100),0,100)`，`ratio` 型同样按 percent 归一。
- 新增 `TrendSparkline.tsx`：纯内联 SVG（参考 demo `trendSVG` 的 viewBox/网格/折线/面积填充思路，颜色用 `--blue`/`--track`），props = `{ data, width?, height? }`；`data` 全 `null` 或长度 <2 时渲染占位文案。
- `ProviderAccountRow.tsx` 展开后、`UsageBarList` 下方插入 sparkline；**每 metric 一条**，纵向排列；懒查（点击展开才请求），缓存用 `useRef<Map<string, TrendPoint[]>>`（key = `${provider}:${accountId}:${metricId}`），展开时先查缓存命中则不发 IPC，未命中调 `trend:get` 后写回；失败不写缓存以允许重试。

## 非范围

- 不嵌入 TokenStats 那套完整图表（柱状/热力/区间选择），只做迷你 sparkline。
- 不改 observation-store 的写入路径或保留策略。
- 不做预测线 / 置信区间。
- 不引入 ECharts（sparkline 用内联 SVG，零依赖）。

## 验收标准

- [ ] `build_trend_series` 单元测试：7 点升序、缺日 `null`、数据不足按实际点数、空输入返回空数组、`ratio` 型 percent 归一正确。
- [ ] sparkline 在有 ≥2 个有效点时渲染折线 + 面积 + 数据点；<2 点显示占位。
- [ ] `ProviderAccountRow` 展开后下方出现 sparkline；多 metric 账号按 metric 纵向排列多条；首次展开触发懒查，收起再展开不重复请求（`useRef<Map>` 缓存命中）。
- [ ] 查询失败/超时不阻塞账号展开，sparkline 区域显示占位，控制台记错误日志；失败不写缓存以允许重试。
- [ ] `pnpm test` 通过；现有 `ProviderAccountRow` / `observation-store` 测试不回归。

## 依赖与约束

- **前置 T007**（domain §6 政策修订 + decisions 决策条目）：本 task 打破 `domain.md §6`「不做趋势图 UI」产品边界，必须先由 T007 解除边界并记录决策替代，T006 spec/plan 在 T007 合入后才进入实施。
- 与 T004 / T005 解耦，可独立排期；但若与 T005 同窗期开发，注意 `ProviderAccountRow` 改动不冲突。
- 约束：查询走现有 IPC 白名单（renderer 不直连 SQLite）；`preload/index.ts` / `preload/route_api.ts` 加 `trend:get` 并对照 T001 分权模式放行 usage/agent route；web 版经 local-api 新端点 `/v1/trend?provider=&accountId=&metricId=&days=`（`local-api/server.ts` + `usageboard-web.ts`）。
- 性能：单账号单 metric 7 点查询 <50ms；批量预热另议，本 task 不做。

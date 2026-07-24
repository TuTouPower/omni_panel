# Task spec

## 背景

token-stats 面板（代理面板）「7 天 / 30 天 / 24 小时」preset 当前用 `end - N * 86400000` 计算 start，再 `bucketize` 按等长 step 切片，label 取 `start + i * step` 的日期。结果：

- 当前 7/24 15:30 选「7 天」，显示 7 根柱子 label = `7/17, 7/18, ..., 7/23`，**7/24 没有自己的柱子**（被合并进 label=7/23 的 bucket），7/17 只含半天数据却占一根柱。
- 用户期望：滑动窗口不变，但**按自然日/自然小时边界切片**。

例：7/24 15:30 选「7 天」应显示 **8 根柱子**：

- 7/17（partial，覆盖 15:30 → 24:00）
- 7/18 ~ 7/23（完整自然日）
- 7/24（partial，覆盖 00:00 → 15:30）

「24 小时」同理按自然小时切：昨天 15 时 partial（15:30 → 16:00）、昨天 16 时 → 今天 14 时完整、今天 15 时 partial（15:00 → 15:30）。

「30 天」同理：6/24 partial + 6/25 ~ 7/23 完整 + 7/24 partial = 31 根。

## 范围

- 修改 `src/renderer/lib/token-stats/aggregate.ts` 的 `bucketize`：day 模式按本地自然日界切分；hour 模式按本地自然小时界切分。
- `start` / `end` 不再对齐到 step 倍数，而是保留 preset 的原始滑动窗口端点；bucket 边界对齐自然日/自然小时。
- label 取 bucket 覆盖区间对应的自然日/自然小时。
- `idx` 函数把 record.timestamp 路由到正确的自然边界 bucket。
- 补单测覆盖「start 非整点」「跨自然日」场景。

## 非范围

- 不改 `presetRange`（仍是 `end = Date.now(), start = end - N * 86400000` 滑动窗口）。
- 不改自定义 RangePicker（custom range 用同一 bucketize，自动受益）。
- 不改 heatmap（独立的 7×24 周小时聚合）。
- 不改 `prevRangeRecords`（前一窗口对比仍按等长窗口）。

## 验收标准

- [ ] 当前 7/24 15:30 选「7 天」，柱状图显示 8 根：label = `7/17, 7/18, 7/19, 7/20, 7/21, 7/22, 7/23, 7/24`；7/17 和 7/24 为 partial（数据量少）。
- [ ] 当前 7/24 15:30 选「24 小时」（hour 模式），显示 ~25 根：首根 partial（昨天 15 时）、中间完整、末根 partial（今天 15 时）。
- [ ] 当前 7/24 15:30 选「30 天」，显示 31 根：首根 6/24 partial、末根 7/24 partial。
- [ ] record.timestamp 路由正确：7/17 15:35 落在 label=7/17 的 bucket；7/17 14:00 落在 label=7/16 的 bucket（若范围覆盖）。
- [ ] `bucketize` 单测覆盖：start=非整点 + 跨自然日 + n 正确（`floor((end - start)/step) + 2` 或等效）。
- [ ] `pnpm test` 全量通过。

## 依赖与约束

- 时区：用本地时区（`new Date(ts).setHours(0,0,0,0)`），不做 UTC 对齐。
- DST：按本地 `Date` setter 推进自然边界。夏令时切换日的自然日可为 23/25 小时；不另设固定毫秒步进或 DST 专用测试。

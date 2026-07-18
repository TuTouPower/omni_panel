# Token 统计面板 · 实现文档

> 本文件记录 `docs/design/用量面板复刻规范.md` 与 `docs/design/index.html` 的 React + TypeScript 实现映射，供维护与验收参考。

## 1. 文件映射

| Spec 建议路径                    | 实际路径                                               | 说明                                                        |
| -------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------- |
| `src/data/adapter.ts`            | `src/main/core/token-stats/*`                          | 数据适配层在 main 进程；renderer 通过 IPC `getRecords` 读取 |
| `src/lib/filter.ts`              | `src/renderer/lib/token-stats/filter.ts`               | 唯一筛选出口                                                |
| `src/lib/aggregate.ts`           | `src/renderer/lib/token-stats/aggregate.ts`            | 聚合、分桶、TopN、命中率、环比                              |
| `src/lib/format.ts`              | `src/renderer/lib/token-stats/format.ts`               | 数字/时间格式化                                             |
| `src/components/MetricDonut.ts`  | `src/renderer/components/token-stats/MetricDonut.tsx`  | 环图组件                                                    |
| `src/components/BarChart.ts`     | `src/renderer/components/token-stats/BarChart.tsx`     | 主柱状图组件                                                |
| `src/components/Heatmap.ts`      | `src/renderer/components/token-stats/Heatmap.tsx`      | 时段热力图组件                                              |
| `src/components/SessionTable.ts` | `src/renderer/components/token-stats/SessionTable.tsx` | 会话明细表                                                  |
| `src/components/RangePicker.ts`  | `src/renderer/components/token-stats/RangePicker.tsx`  | 自定义时间弹层                                              |
| `src/components/Segmented.ts`    | `src/renderer/components/token-stats/Segmented.tsx`    | 分段选择器                                                  |
| `src/theme/palette.ts`           | `src/renderer/lib/token-stats/palette.ts`              | 模型/项目配色与图表调色板                                   |
| `src/theme/theme.css`            | `src/renderer/styles/token-stats.css`                  | scoped 主题 CSS                                             |
| —                                | `src/renderer/hooks/use-echarts.ts`                    | ECharts 生命周期封装                                        |
| —                                | `src/renderer/lib/token-stats/chart-data.ts`           | 图表数据准备纯函数                                          |
| —                                | `src/renderer/views/TokenStatsView.tsx`                | 主视图集成                                                  |

## 2. 数据流

```
main 进程 raw records
        │
        ▼
window.usageboard.tokenStats.getRecords()
        │
        ▼
TokenStatsView state: records
        │
        ├── agent 过滤 ──► filtered() ──► currentRecords
        │                                    │
        │                                    ├── 4 张 MetricDonut
        │                                    ├── BarChart
        │                                    ├── Heatmap
        │                                    └── SessionTable
        │
        └── prevRangeRecords() ──► 环比 delta
```

## 3. 关键行为实现

- **筛选唯一出口**：`filtered()`（`src/renderer/lib/token-stats/filter.ts`）。
- **Top5 + 其他**：`modelSegments()` / `prepareBarData()` 共享同一 `topGroups()` 逻辑；"其他" tooltip 通过 `extra` 字段或 `otherDetails` 数组展开。
- **Session 模式锁定**：`metric === "sessions"` 时 `effectiveXaxis` 强制为 `"time"`，项目/会话按钮 `disabled`。
- **粒度自动切换**：24 小时预设自动切 `"hour"`，其余切 `"day"`；非时间横轴时隐藏粒度选择器。
- **环比**：`prevRangeRecords()` 取前一个等长窗口；命中率为 pp 差值，其余为百分比变化。
- **主题**：`data-theme` + `localStorage` 双轨；`paletteFor(theme)` 为 ECharts 提供深/浅调色板。
- **数字格式**：`fmtTok` 使用 K/M/B 截断一位小数；`fmtInt` 使用千分位。

## 4. 测试覆盖

| 范围     | 文件                                                    | 数量 |
| -------- | ------------------------------------------------------- | ---- |
| 纯函数库 | `tests/unit/renderer/lib/token-stats/*.test.ts`         | 42   |
| 组件     | `tests/unit/renderer/components/token-stats/*.test.tsx` | 8    |

运行：

```bash
pnpm test tests/unit/renderer/lib/token-stats tests/unit/renderer/components/token-stats
pnpm typecheck
pnpm lint
```

## 5. 验收状态

以下条目已通过代码/单测验证，**视觉像素级比对仍需人工在打包后的应用中与 `docs/design/index.html` 并排确认**。

- [x] `lib/` 纯函数单测：分桶边界、Top5 分组、命中率、格式化。
- [x] 四张环图与明细表/柱状图使用同一 `currentRecords` 数据源。
- [x] 三种主数据 × 三种横轴可切换；Session 模式禁用逻辑正确。
- [x] 自定义起止精确到小时，高亮日历按钮。
- [x] 表格分页/排序/每页条数正确。
- [x] 深/浅主题通过调色板与 CSS 变量切换。
- [x] dataZoom 配置与 demo 一致。
- [ ] 与参考实现 HTML 并排肉眼比对，布局/配色一致（需人工）。

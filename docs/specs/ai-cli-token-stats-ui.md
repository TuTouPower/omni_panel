# ai-cli-token-stats-ui

> 验证方式：Web。拆自 ai-cli-token-stats（t037）。

本地 AI CLI Token 统计的前端层：独立窗口主视图 `TokenStatsView` 及组件（KPI / 趋势图 / Session 列表 / 筛选栏 / 设置项）。不含数据模型 / reader / 聚合（见 `-api`），不含子进程 fork / IPC / 窗口注册（见 `-desktop`）。

前端设计参考 `ai-cli-token-stats-frontend-design.md`（独立设计文档）。

## 1. 窗口布局

```
┌──────────────────────────────────────────────────┐
│  代理面板                                [─][□][×]│
├──────────────────────────────────────────────────┤
│ [时间范围▾] [环境: 全部▾] [模型▾]                │
├──────────────────────────────────────────────────┤
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐     │
│ │总 Token │ │Session │ │主用模型│ │日均Token│     │
│ │ 12.5M  │ │   45   │ │Sonnet  │ │  1.8M  │     │
│ └────────┘ └────────┘ └────────┘ └────────┘     │
├──────────────────────────────────────────────────┤
│ 趋势图                    [折线|柱状] [按天]     │
│ ┌────────────────────────────────────────────┐   │
│ │  ▓▓▓                                      │   │
│ │  ▓▓▓▓▓     ▓▓                             │   │
│ │  ▓▓▓▓▓▓▓  ▓▓▓▓  ▓▓                       │   │
│ └────────────────────────────────────────────┘   │
│  模型A  模型B  模型C                             │
├──────────────────────────────────────────────────┤
│ Session 列表         [搜索...]  [排序▾]          │
│ ┌────────────────────────────────────────────┐   │
│ │ 标题       │ 模型    │ Win │ Input │ 时间  │   │
│ │ ses_abc... │ Sonnet  │ Win │ 1.2M  │ 07-17 │   │
│ │ ses_def... │ Opus    │ WSL │ 3.4M  │ 07-16 │   │
│ └────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘
```

## 2. 组件拆分建议

主视图 `TokenStatsView.tsx` 下拆分：

- `MetricDonut` — KPI 卡片中的单指标强调（可选形态）
- `BarChart` — 趋势图柱状形态
- `Heatmap` — 留作后续日历方块图基础，本版不做（见 §9）
- `SessionTable` — Session 列表（虚拟滚动、排序、搜索）
- `Segmented` — 折线/柱状切换、时间范围档位
- `RangePicker` — 近 7 天 / 近 30 天 / 本月 / 全部

> 注：原 spec 未明确组件命名清单，上述为按原 spec 描述（KPI 卡片条、折线/柱状趋势图、Session 表格、筛选栏）推导的实施侧建议。

## 3. KPI 卡片

| 卡片       | 计算                                              |
| ---------- | ------------------------------------------------- |
| 总 Token   | `SUM(input_tokens + output_tokens)` 跨所有 bucket |
| Session 数 | `COUNT(*)` from token_stats_sessions              |
| 主用模型   | 按 `input_tokens + output_tokens` 降序第一        |
| 日均 Token | 总 Token / 天数                                   |

无费用卡片。

## 4. 趋势图

- X 轴：日期（`bucket_date`）
- Y 轴：tokens（`input_tokens + output_tokens`）
- 系列：按模型拆分
- 类型切换：折线 / 柱状（本版不做日历方块）
- 数据源：`token_stats_buckets` 表，按筛选条件 GROUP BY
- **自然时间 bucket**（t103）：时间轴保留筛选窗口原始起止；day/hour 分别按本地午夜/整点切分，首末 bucket 可为 partial。标签和小时刻度使用各 bucket 的真实起点；Heatmap 与前一窗口等长对比不变。

## 5. Session 列表

| 列             | 默认 | 说明                                                   |
| -------------- | ---- | ------------------------------------------------------ |
| 标题 / ID      | ✓    | OpenCode 有 title；Claude Code 显示 session_id 前 8 位 |
| 来源           | ✓    | Claude Code / OpenCode 徽章                            |
| 环境           | ✓    | Win / WSL                                              |
| 模型           | ✓    |                                                        |
| 目录           | 可选 | 路径截断，悬停全文                                     |
| Input / Output | ✓    |                                                        |
| 时间           | ✓    | 创建时间（本地时区）                                   |

排序：默认按时间降序。可切按 tokens。
搜索：按标题 / ID / 目录关键词。
虚拟滚动避免长列表卡顿。

## 6. 筛选

| 筛选     | 交互                             |
| -------- | -------------------------------- |
| 时间范围 | 近 7 天 / 近 30 天 / 本月 / 全部 |
| 环境     | Win / WSL / 全部（默认全部合并） |
| 模型     | 多选下拉，带搜索                 |

筛选变更 → KPI + 趋势图 + session 列表同步更新。

## 7. Win + WSL 合并

默认合并展示。环境筛选可拆分。

合并逻辑：`token_stats_buckets` 表中 `(source, env)` 不同的记录按 `bucket_date + model` 聚合 SUM。session 列表直接 UNION。

## 8. 设置项（SettingsView 新增「代理面板」section）

| 设置       | 默认值       | 说明                                            |
| ---------- | ------------ | ----------------------------------------------- |
| 采集间隔   | 10 分钟      | 下拉：5 / 10 / 30 / 60 分钟。改动后下次采集生效 |
| WSL 启用   | false        | 开关。开启后显示 distro / user 输入框           |
| WSL 发行版 | Ubuntu-22.04 | 文本输入                                        |
| WSL 用户名 | —            | 文本输入（启用 WSL 时必填）                     |

代理面板窗口自身的视图偏好（时间范围、环境筛选、模型筛选、图表类型等）独立持久化，不写入 `AppConfiguration`，也不随设置的导入导出迁移。

## 9. 消息上限分档

Session 列表 `SessionTable` 虚拟滚动；长列表按可视高度分段渲染。

> 注：原 spec §5.5 仅提及「虚拟滚动」，未明确分档阈值（页大小 / 预渲染窗口）。实现时由 UI 组件库默认值决定；若后续需要明确阈值，在本节补充。

## 10. 涉及文件清单（前端层）

| 文件                                       | 改动                      | Task    |
| ------------------------------------------ | ------------------------- | ------- |
| `src/renderer/views/TokenStatsView.tsx`    | 新建：独立窗口主视图      | 5.3     |
| `src/renderer/components/TokenStatsPanel/` | 新建：KPI + 图 + 列表组件 | 5.3–5.5 |

## 11. 明确不做（本版，UI 层）

- **不做** 费用统计（无 cost 卡片、无 cost 排序）
- **不做** 日历方块图（`Heatmap` 仅预留，本版不实现）
- **不做** 小时热力图
- **不做** Session 对比 / 批量操作
- **不做** 导出 CSV / JSON
- **不做** Token 口径切换（计费 vs 含缓存）
- **不做** 跨工具对比页

注：`token_stats_records` 表与 `AgentSessionUsage` 类型已在 `-api` 本版引入，为 per-message 记录提供数据层契约；UI 层的「Session 详情（逐次调用时间线）」视图留待后续 Phase 在此基础上扩展。

### 数据源分工（t164）

代理面板各可视化区域的数据源已分层（避免渲染端对数十万 records 做 reduce）：

| 区域                                                              | 数据源                            | 说明                                                                                                                                            |
| ----------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| KPI（总 Token / 会话 / 调用 / 缓存命中率）                        | `token_stats_buckets`             | `kpiFromBuckets` / `compositionSegmentsFromBuckets`，按时间窗 2 倍宽切 current/prev                                                             |
| Donut（model / project / agent / composition）                    | `buckets` + `sessions`            | model/composition/agent 走 buckets；project（按 directory 分组 session 数）走 sessions                                                          |
| SessionTable                                                      | `token_stats_sessions`            | `sessionRowsFromSessions` 派生行，前端分页                                                                                                      |
| BarChart（时间 / 项目 / 会话轴）                                  | `token_stats_records`（带 limit） | 小时级精度需 per-message；受 `DEFAULT_RECORDS_LIMIT` 保护                                                                                       |
| BarChart（时间轴 · 小时粒度，≥7d / 24h preset / ≤25h 自定义范围） | `query_hour_buckets`（SQL 聚合）  | 宽窗口 hour×model 聚合（t173）与 24h preset（t183）、≤25h 自定义范围（t187）共用，避免 records LIMIT 截断早期小时                               |
| 24h preset 的 KPI / donut / 项目 / 会话轴                         | `query_range_rollup`（SQL 聚合）  | (source, model, directory, session_id) 分组，无 LIMIT；24h preset 的 KPI/donut delta 与项目/会话柱走 rollup 而非受 LIMIT 截断的 records（t184） |
| Heatmap（7×24）                                                   | `query_heatmap`（SQL 聚合）       | 后端 `GROUP BY strftime('%w'/'%H', +8 hours)` 返回 ≤168 格，renderer 不再拉 records（t170）                                                     |

`TokenStatsView.loadData` 一次拉 dashboard bounded DTO（t200）：`getDashboard` 返回 `{ summary, chart_data, heatmap, sessions 首页, status, freshness, data_version }`；`chart_data` 携带 metric/xaxis 无关的聚合源（`axis + metric_buckets + session_buckets + rollup`），renderer 按当前 metric/xaxis 本地派生图表。会话翻页走独立 `get_dashboard_sessions`（返回 `{ items, total, has_more }`），翻页不重算 summary/chart/heatmap，也不重拉 dashboard。t200 前 BarChart 曾按区域分别拉 records/hour_buckets/rollup（见下段遗留说明），t200 后统一由 dashboard `chart_data` 派生。

查询协调由 renderer 负责：筛选、时间范围与粒度 `gran` 组成稳定 query key，已完成查询结果按 key 保存在有界内存 LRU 中。`metric` / `xaxis` 是展示派生维度，不进入 query key——同一范围 + 筛选 + gran 下切换 metric/xaxis 命中同一缓存，由 renderer 本地派生展示（s011 验证）；`gran` 决定返回桶粒度（day 级 sessions distinct 无法由 hour 桶正确求和），保留在 key 中。`session_offset` 不进入 dashboard 缓存 key（翻页走独立通道）。切换到 fresh 缓存时先复用已转换结果，不清空图表或显示全屏加载；缓存缺失时保留当前内容并以非阻塞状态加载。相同 key 的并发加载共享一套底层查询，快速连续切换只允许最新 request id 提交可见结果。

collector 更新会使已有条目标记 stale，当前可见结果继续展示并静默 revalidate；更新前完成的请求不会重新写入 fresh 缓存，重新访问 stale 条目会重新查询。缓存不持久化，超过上限淘汰后按现有 IPC 查询路径恢复。配置别名独立于统计查询初始化读取，并在 `CONFIG_CHANGED` 广播时同步，不因统计选项切换重复调用配置读取。

24h preset 例外（t168/t184）：短窗口（≤25h）下 buckets 日级聚合无法对称切分 current/prev（48h vs 24h），KPI/donut delta 与项目/会话轴本需精确 epoch 切分。t168 先改用 records 驱动，但 records 倒序 LIMIT 在高密度下截断早期时段（p020）；t184 把 24h preset 的这些轴全部改走 `query_range_rollup` 有界 SQL 聚合（无 LIMIT），current/previous 各拉一次半开 `[start, end)` 窗口，边界记录不双计。≥7d preset 仍走 buckets（日级误差占比小）。24h preset 的**时间轴小时柱**不走 records（t183）；非 24h 的自定义 ≤25h 范围 KPI/donut/柱仍走受限 records（p023）。

24h preset 下 buckets 按日聚合使 current(48h)/prev(24h) 窗口不对称，KPI delta 偏大——日级聚合固有取舍（`t164_code_f003`）；24h preset 现走 rollup 精确统计（t184），不再受该取舍影响。

## 12. 成功标准（Web 验证）

| #   | 标准                                      | 验证方式 |
| --- | ----------------------------------------- | -------- |
| 5   | 趋势图按天展示 token 分布，系列按模型拆分 | 截图验证 |
| 6   | Session 列表可排序、可搜索                | 手工验证 |

## 13. 实施顺序（前端层）

| Task | Commit 前缀                                 | 内容                                                               | 前置 |
| ---- | ------------------------------------------- | ------------------------------------------------------------------ | ---- |
| 5.3  | `feat(token-stats): add KPI and chart view` | `TokenStatsView.tsx` — KPI 卡片条 + 趋势图（折线/柱状切换）        | 5.2  |
| 5.4  | `feat(token-stats): add session list`       | 扩展 `TokenStatsView.tsx` — session 表格（虚拟滚动、排序、搜索）   | 5.3  |
| 5.5  | `feat(token-stats): add filters`            | 扩展 `TokenStatsView.tsx` — 时间范围 / 环境 / 模型筛选栏，筛选联动 | 5.4  |

前置 5.1 / 5.2 见 `-desktop`。

## 14. 后续可扩展（UI 层）

- 日历方块图 + 小时热力图
- Session 详情（逐次调用时间线）
- Session 对比 / 批量操作
- 导出 CSV / JSON
- Token 口径切换（计费 vs 含缓存）
- 跨工具对比页
- 手动刷新按钮
- 预算阈值与超支提醒

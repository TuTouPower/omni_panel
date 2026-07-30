# Task review t164（reviewer_focus: 测试）

- task：`t164_tokenstats_charts_use_daily`
- spec：`docs\tasks\t164_tokenstats_charts_use_daily\spec.md`
- diff_anchor：`1ee36da3ab1b97a973f234cc7f0c79063372698b9`
- target：`git diff 1ee36da3ab1b97a973f234cc7f0c79063372698b9`
- round：1
- reviewed_at：2026-07-30 23:56 UTC+8

## Findings

零 finding。

## 覆盖与可信核查

### AC 覆盖

- AC「不再 getRecords 全量作主数据源」：view 测试 beforeEach 把 `get_records.mockResolvedValue([])`、改用 `get_sessions`/`get_buckets` 作主数据源；env-switch / stale / delta / remount / granularity 5 个场景全部走 sessions+buckets 路径。已覆盖。
- AC「KPI/donut/bar 基于 daily/sessions 聚合」：chart-data.test.ts 新增 `agentSegmentsFromBuckets` / `modelSegmentsFromBuckets` / `compositionSegmentsFromBuckets` / `kpiFromBuckets` / `projectSegmentsFromSessions` 五组用例，数值断言精确。已覆盖。
- AC「SessionTable 改服务端分页」：spec 范围实际缩减为 props 从 records 改 rows（SessionTable 内部仍前端排序/分页）；session_table.test.tsx 适配新 props（rows+modelColors），agent chip label 用例验证数据流。最小覆盖。
- AC「Heatmap 仍可渲染」：Heatmap 在 view 测试中仍 mock 渲染，未触及 records 供热图的新路径——但 spec 非范围（Heatmap 保留 records），view mock 合法。
- AC「内存不持有 38 万行」：属运行时约束，测试轴不直接验证；view 不再主拉 records 已由测试间接证明。

### 数值正确性

- `agentSegmentsFromBuckets`（chart-data.test.ts:342-353）：`Claude Code` = (100+50)+10 = 160、`OpenCode` = 30+10 = 40、`Kimi Code` = 5，与实现 `bucket_tokens = input+output+cache_read+cache_write` 一致；跳零源（默认 source claude_code 零值不会被新加，因 bucket_tokens=0 被过滤）。
- `compositionSegmentsFromBuckets`（chart-data.test.ts:383-402）：input 110 / output 55 / cache_read 33 / cache_write 22，四分量独立累加，与实现 reduce 一致。
- `kpiFromBuckets`（chart-data.test.ts:406-426）：tokens = (100+50+10+5)+(20+10+0+0) = 195、sessions = 5、calls = 11；空数组返零。覆盖边界。
- `modelSegmentsFromBuckets` top5+others（chart-data.test.ts:359-379）：6 模型各 100/80/60/40/20/10，f=10 排第 6 进 others；断言 `other?.value).toBe(10)`；`names.toContain("a")` 正向验证 top1。
- `modelSegmentsFromBuckets` 跨 env 求和（chart-data.test.ts:381-388）：a@win=100 + a@wsl=50 → 150，覆盖同一 model+date 跨 env 聚合。

### projectSegmentsFromSessions

- distinct session 计数（chart-data.test.ts:447-467）：/p/1 下 {a,b} → value=2，其余各 1；6 个 dir 触发 top5+others；`segs.some(name.startsWith("其他"))` 验证 others 生成。
- null directory（chart-data.test.ts:469-473）：`directory: null` → 实现内 `dir ?? "(unknown)"` → 1 段，断言 `toHaveLength(1)`。

### session_table 适配

- 新 props `rows: SessionRow[]` + `modelColors: Map` 替代旧 `records`+`metric`。agent chip label 用例覆盖 claude-code/opencode/kimi-code 三源。排序/分页逻辑未改动（实现已移除内部 sessionRows 派生，改由父层 `sessionRowsFromSessions` 注入），测试聚焦变更点（agent chip），属合理最小覆盖。

### view mock 与 delta

- mock 边界：仅 mock 子组件（MetricDonut/BarChart/Heatmap/SessionTable/RangePicker）与 IPC（get_records/get_sessions/get_buckets/getStatus/config.get），未 mock 被测 `TokenStatsView` 自身逻辑。合法。
- delta 测试（token_stats_view.test.tsx:196-225）：用 `ymd()` 生成 today_str / prior_str（~8 天前），分别赋 input/output，驱动 `currentBuckets`/`prevBuckets` 按 `bucket_date` 字符串比较切分。current = today (100+50=150 tokens)，prior = prior_str (40+20=60 tokens)，非零 → 显示 ▲/▼ 而非"前段无数据"。正确验证数据流切换和百分比箭头路径。
- stale-request 测试（token_stats_view.test.tsx:171-194）：`get_sessions.mockImplementation` 按 env 过滤 + deferred 控制时序，断言旧请求结果不渲染。覆盖 race condition。
- env-switch（token_stats_view.test.tsx:103-137）：`mockResolvedValueOnce` 链驱动 all → win → wsl 三次切换，每次断言 `session_id` 到达 SessionTable mock。覆盖数据流切换。

### 危险模式扫描

逐条扫描结果：

- 恒真断言：无。所有断言精确数值或具体字符串。
- 删除/反转 expect：diff 中删除的 expect 均随 records 路径删除，由等价 sessions/buckets 断言替代（env-switch / stale / delta 场景断言点保留并改字段名）。
- 注释掉断言：无。
- 弱化断言：`names.toContain("a")` / `segs.some(name.startsWith("其他"))` / `expect(screen.getAllByText(/▲|▼/).length).toBeGreaterThan(0)` —— 这些针对有序/无序集合的存在性验证，有正当理由（Top5 排序具体名次由实现内部 sort 决定，测试验证存在性而非硬编码索引），非弱化。
- 删测试：无 it/describe 块被删；diff 仅改字段（records→rows、message_id→session_id）。
- `.skip` / `.only`：无。
- 静默错误（eslint-disable / @ts-ignore）：无。
- mock 误用：mock 对象为 IPC 边界与子组件，未 mock 被测模块自身。
- 阈值掩盖：无 timeout/retry 增大。
- 条件跳过：无 `if (cond) { expect(...) }`。
- 程序赋值替代真实交互：测试为纯渲染数据流验证，不涉及拖拽/点击/键盘交互的 AC；`user.click` 用于切换 preset/env，属真实交互。
- 存在即通过：无 `toBeVisible()` 当 AC 证据；delta 测试进一步断言"前段无数据"消失 + ▲/▼ 存在。

### 红灯归因

diff 中测试改动均与实现 refactor 同步：records → buckets/sessions 路径切换，字段重命名（message_id → session_id、timestamp → bucket_date）。无「改测试以掩盖实现 bug」迹象；测试与实现改动语义一致。

## 结论

- 前轮 finding 复核：本 round 1，无前轮。
- 本轮新发现：0 条。
- 总体判断：测试与实现 refactor 同步，AC 覆盖充分（KPI/donut/project 聚合数值正确，delta 用 buckets 前/后段验证百分比箭头，mock 仅在系统边界，无危险模式命中），零 finding。

verdict: PASS

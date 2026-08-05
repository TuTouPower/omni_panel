# 发现总账

已被验证的技术发现与踩坑记录，跨 task 复用。

- spike 结论收尾时抽一条到这里；spike 报告全文留在 `docs/archive/spikes/`。
- 日常发现（工具行为、平台差异、依赖坑、性能特征、被证伪的假设）随时追加。
- 只记**已验证**的事实与证据来源；推测和待确认的写进对应 task 的 spec 上下文区：只有用户或外部环境能核实的标 `UNVERIFIED-BLOCKING`，agent 可实验核实的标 `UNVERIFIED-SPIKE`。
- 编号 `dNNN`，递增不复用。发现失效时不删除条目，改写「现状」并注明失效日期与原因。
- 本文件只追加与就地修订，不迁 archive——发现是长期资产，不存在「闭环」。

结构：`## dNNN 简述（YYYY-MM-DD）`，下接 `- 来源` / `- 结论` / `- 证据` / `- 影响` / `- 现状`。新条目现状写「有效」；失效时改为「YYYY-MM-DD 失效：原因」。

`- 来源` 写 `sNNN` spike、`tNNN` task、或「日常」。

## d001 Windows 下 git subprocess 编码与 worktree 路径分隔符（2026-07-31）

- 来源：t169
- 结论：从 Linux 模板移植的 Python 脚本在 Windows 跑 git 子进程需两处适配，否则中文输出炸、worktree 路径比较恒 False。
- 证据：
    - `subprocess.run(..., text=True)` 在 Windows 默认用 locale 编码（GBK）解码 git 输出，含中文 commit message / 文件名时抛 `UnicodeDecodeError`，stdout 变 None。须显式 `encoding="utf-8", errors="replace"`。
    - `git worktree list --porcelain` 在 Windows 输出正斜杠（`D:/Dev/...`），`str(Path.resolve())` 是反斜杠（`D:\Dev\...`），字符串 `in` 字典比较恒 False。须把路径键统一 `str(Path(p).resolve())`，调用处的 path 变量也 `.resolve()`。
- 影响：`scripts/task.py`、`_id_scan.py`、`render_review_prompts.py` 及 `tests/repo_template/` 三个 test helper 已按此适配；后续从模板移植的 Python 脚本若调 git 子进程同样需要。
- 现状：有效

## d002 SQLite strftime epoch ms 的 UTC+8 weekday/hour 聚合（2026-07-31）

- 来源：s003
- 结论：SQLite `strftime('%w'/'%H', timestamp/1000, 'unixepoch', '+8 hours')` 对 epoch ms 的 weekday（0=周日）/hour 提取与 UTC+8 语义一致，可作热力图等按本地时区聚合的后端 GROUP BY 依据。
- 证据：s003 脚本 9 边界用例（跨日、周日 23:59→周一 00:00、月界、年界）全部与 Python `zoneinfo("Asia/Shanghai")` 期望一致；`COUNT(*)`/`COUNT(DISTINCT session_id)`/`SUM(tokens)` 逐例正确。
- 影响：`token-stats-store` 可新增按 weekday×hour 的聚合查询（方案 A），30d 全表 60 万行聚合约 592ms（内存）、返回 ≤168 格；7d 约 148ms。
- 现状：有效

## d003 Grok/Kimi OAuth 401 在 script failed_accounts 路径上报（2026-07-31）

- 来源：s004
- 结论：Grok/Kimi script 连接器的 HTTP 401/403 不一定抛出到 refresh-service；connector 通过 `report_failed_account` 返回 `failed_accounts`，即时 OAuth 刷新兜底必须在该结果路径处理。
- 证据：`net-client` 生成 `HTTP <status>: request failed (<bytes> bytes)`；Grok connector 捕获请求错误后调用 `report_failed_account` 并返回空观测；refresh-service 先复制 failed account 的 stale 观测，再处理空结果。
- 影响：新增 OAuth 401 兜底时同时覆盖 `failed_accounts` 与抛错路径；仅修改 catch 中 `is_auth_error` 分支无法修复 Grok/Kimi 主路径。
- 现状：有效

## d004 deepseek/longcat cache 归一化按 `inp >= cache_read` 数值守卫分流，`cache_creation` 信号无效（2026-07-31）

- 来源：s004（t171）
- 结论：deepseek 模型可并存 OpenAI 上游（`input_tokens` 含 `cache_read`，需减）与 Anthropic 上游（两者互斥，不能减）两种取数协议，但传输层统一 Anthropic 格式（new-api），上游协议不在 JSONL 留痕。唯一可靠分流依据是 `input` 与 `cache_read` 的数值关系：`inp >= cache_read` ⇒ 含 cache 语义减去；`inp < cache_read` ⇒ 互斥语义保留。该判别对 OpenAI 语义数学恒真（`prompt_tokens >= cached_tokens` 定义保证，OpenAI 行必被减、不漏判）。`cache_creation_input_tokens` 在全部 deepseek 行恒为 0，不能作区分信号。
- 证据：s004 脚本扫 Win+WSL 真实数据；按用户提供的协议切换时间（2026-07-31 20:00 前 Anthropic / 20:40 后 OpenAI）分窗，Anthropic 窗 4034 行全 `inp<cr` 正确未减、OpenAI 窗 135 行全 `inp>=cr` 正确减去，零误判。
- 影响：`claude-reader` 归一化由 `is_cache_normalization_candidate`（模型名圈候选）+ 调用点 `inp >= cache_read` 守卫（决定执行）组成，模型名不决定减与不减。残余风险：Anthropic 互斥行若 `inp >= cache_read`（新输入超缓存命中）会误减，本机 4034 行互斥样本中 0 次，理论非恒 0。
- 现状：有效

## d005 records 查询时 hour 聚合可消除 LIMIT 截断（2026-07-31）

- 来源：s005
- 结论：`token_stats_records` 上按 UTC+8 本地整点小时 `(timestamp - ((timestamp + 28800000) % 3600000))` × model 查询时聚合，行数 = hour×model 组合（7d 428 行 vs 明细 140,481 行），无 LIMIT 截断；聚合 hour_start_epoch 与渲染层 `bucketize(start,end,"hour")` 桶起点对齐（内部小时全部命中，含 start 的偏首小时桶经 `idx(ts<=start)→0` 正确映射）。
- 证据：s005 探针对真实 DB：7d 聚合 428 行/141 小时；首个小时 7/24 14:00Z（最早日期不丢）；内部小时全在 bucketize 桶起点集合。
- 影响：7d/30d + 小时粒度柱状图可走该聚合，替代 `query_records` 10 万级明细进渲染层；与 day buckets / heatmap 聚合并列。
- 现状：有效

- 现状：有效

## d008 代理面板主请求可用有界 dashboard DTO 重建首屏（2026-08-03）

- 来源：s007、t191
- 结论：`TokenStatsView` 首屏只需要 KPI/delta、donut、时间/项目/会话轴、7×24 热力图、会话摘要、status 和 freshness；这些区域可由有界聚合序列重建，不需要把 per-message records 或完整会话详情放入主 DTO。
- 证据：逐一映射 `MetricDonut`、`BarChart`、`Heatmap`、`SessionTable`、`RangePicker` 输入；`prepareBarDataFromBuckets`、`prepareBarDataFromHourBuckets`、`prepareBarDataFromRollup`、`prepareHeatmapFromCells` 和 `sessionRowsFromSessions` 均只消费聚合字段。当前会话表路径的 slug/version/sub 已固定为空或 false，不构成主 DTO 必需字段。
- 影响：dashboard IPC 可统一返回 summary、chart、heatmap、session summary、status、freshness；旧 token-stats 查询入口保留兼容，正常代理面板路径可停止调用 records 和独立 status 查询。
- 现状：有效

## d009 窗口「完整小时段 + 边界段」UNION 精确重组；SQLite NULL 唯一键互异（2026-08-03）

- 来源：t192
- 结论：任意 `[start, end)` 窗口与整点小时聚合表的对齐拆分：`full_start = ceil_hour(start)`、`full_end = floor_hour(end)`；当 `full_start < full_end` 时窗口拆为 `[start, full_start) ∪ [full_start, full_end) ∪ [full_end, end)`，聚合表覆盖中段、records 覆盖两个不足整点的边界带，UNION ALL 后外层 `SUM(calls)`/`SUM(tokens)` 精确重组、`COUNT(DISTINCT session)` 跨两部分去重。**当无完整小时（`full_start > full_end`）时，原边界公式 `[start, full_start) ∪ [full_end, end)` 会溢出窗口**（例 `[07:35,08:00) ∪ [07:00,07:55) = [07:00,08:00)`），必须整窗回落 records。
- 证据：t192 dashboard aggregate read path 用例覆盖跨小时/跨天、不足一小时窗口、agent/platform 过滤、三 metric、xaxis time/project/session、别名、分页，聚合路径与 records 路径逐区 `toEqual`。
- 影响：凡「预聚合小时表 + 任意窗口查询」场景可复用该拆分；不足一小时窗口的边界带公式溢出是通用陷阱。
- 现状：有效

## d010 SQLite 唯一键含 NULL 时 ON CONFLICT UPSERT 永不命中（2026-08-03）

- 来源：t192
- 结论：SQLite 把 NULL 唯一键值视为互异，`INSERT ... ON CONFLICT(...) DO UPDATE` 对含 NULL 的键永不触发 conflict，会叠出重复行。含可空列的分组聚合表不能用行级 UPSERT，须按稳定标识（如 session）DELETE + 全量重建，或用 `GROUP BY` 归一 NULL 后再写。
- 证据：t192 `token_stats_hour_rollup.directory` 可空；s008 对比与 t192 实现采用会话级重建（DELETE + records 重算）后与 records oracle 逐行一致；对比观察：同组多条 records 若走行级 upsert 会因 directory NULL 叠加重复聚合行。
- 影响：派生聚合表、唯一索引设计须先确认无 NULL 参与键；可空维度入 PK 时考虑非空哨兵值（如 `'(unknown)'`）或会话级重建。
- 现状：有效

## d011 只读 SQLite 连接可并发读 WAL 库；utilityProcess 提供查询执行端崩溃隔离（2026-08-03）

- 来源：s009、t193
- 结论：better-sqlite3 `{ readonly: true }` 连接可打开写并发中的 WAL 库：读已提交数据、写提交后新只读连接立即可见、写事务未提交时读旧快照不阻塞、close/reopen 无锁残留、`readonly:true` 拒绝写入。Electron utilityProcess 是独立 OS 进程，native 崩溃/异常退出不影响主进程，且 `parentPort`/`postMessage` 打包路径有 collector 先例；worker_threads 同进程线程 native 崩溃会带崩整个 Electron。
- 证据：s009 `code/wal_readonly_concurrency.ts` 真实 WAL 临时库五条断言全部通过；t193 query worker 打包内（asarUnpack + electron ABI better-sqlite3）打开 readonly 连接完成 dashboard 查询（packaged smoke AC6）。
- 影响：重读类子任务（dashboard 聚合、报表导出）可迁入 utilityProcess readonly worker，主进程事件循环不被同步聚合阻塞；跨进程只读方案无需额外锁协调。utilityProcess 子进程比 worker_threads 多一层进程开销，适合低频重读、不适合高频小任务。
- 现状：有效

## d012 TokenStats 展示维度可经 dashboard chart_data 本地派生（2026-08-04）

- 来源：s011、t200
- 结论：dashboard 查询缓存 key 中可剔除展示派生维度 `metric`/`xaxis`，条件是 DTO 携带 metric/xaxis 无关的聚合源 `chart_data = { axis, metric_buckets, session_buckets, rollup }`：tokens/calls 时间轴用 per (hour, model) 的 calls/tokens；sessions 时间轴用 per (hour, directory) 的 distinct sessions（不可跨 model 求和）；project/session 轴复用 bounded rollup。renderer 本地派生（`prepareBarDataFromDashboardChartData` / `prepareBarDataFromDashboardRollup`）与改前服务器预派生等价，由 diff_anchor 转写的 oracle 测试锚定（6 个 metric×xaxis 组合含别名 + Top5 并列 tie-break）。
- 证据：t200 oracle 测试（chart-data.test.ts）labels/series/otherDetails 逐项 `toEqual`；query cache key 精简后 AC1 测试断言 metric/xaxis 切换不新增 dashboard IPC。
- 影响：展示维度切换不再重复查询；`gran` 决定桶粒度须保留在 key（day 级 sessions distinct 无法由 hour 桶正确求和）；会话翻页走独立 `get_dashboard_sessions` 通道，`session_offset` 不进 dashboard key。
- 现状：有效

## d013 模型过滤可加在 dashboard 窗口物化 union 两侧，聚合与全窗口一致（2026-08-04）

- 来源：s013
- 结论：dashboard 窗口物化（`dashboard_window_union_builder`）在 hour_rollup 整小时段与 records 边缘小时段两侧 WHERE 各加 `AND model = @model`（与 agent/env 并列），聚合结果（calls 用 `SUM(calls)`、sessions 用 `COUNT(DISTINCT source||env||session_id)`、tokens 用四分量求和）与 records 全窗口过滤完全一致；窗口内 distinct model 列表可直接从 `token_stats_records` 按 agent/platform/range 过滤查 `SELECT DISTINCT model ORDER BY model`（records 全窗口与 union 窗口数量相同），且须不含 model 条件——否则选中模型后下拉坍缩无法直接切换。
- 证据：s013 用本机真实库（530k records）7d 窗口实测，`gpt-5.6-sol` 过滤后 calls=12850/sessions=43/tokens=1261048396，records 全窗口与 store 结构 union 两侧过滤逐项相等；distinct model 两种取法均 19。
- 影响：dashboard / dashboard_sessions 加 `model` 可选参数即可复用现有窗口物化，无需新表；rollup 未就绪路径（`dashboard_records_source`）与 `build_dashboard_conditions` 同样加条件。
- 现状：有效

## d014 trend 查询键是 metric_id（connector 完整键），非 raw_label（2026-08-05）

- 来源：t207
- 结论：`observation-store.query_trend_series` 的 SQL `WHERE provider=? AND account_id=? AND metric_id=? AND observed_at>=?` 按 `metric_id` 列精确匹配。`metric_id` 列存的是 connector/executor 写入时构造的完整键，与 `raw_label`（短标签）不同：CPA Claude = `claude:${account_id}:${key}`（key=`five_hour`/`seven_day`），opencode_go = `opencode_go:${raw_label}`，grok = `grok:product:${raw_label}`，tavily = `tavily:monthly_usage`，tier1/probe executor = `${manifest.id}:usage`。前端 `trend:getBulk` / `trend:get` / web `/v1/trend` 三条路径的查询键必须等于该列值。`raw_label` 仅作 label-map 配置键，与 trend 查询无关。
- 证据：t207 跨层集成测试 `tests/integration/observation/trend-query-key.test.ts` 用真实 store 验证 CPA Claude 与 opencode_go 两种 metric_id 构造形态均能查回，反证条用 raw_label 查回全 null。回归源 commit 48512085（p022）误以「observation store 以 raw_label 索引」为前提。
- 影响：`usageItemSchema` 加可选 `metric_id`（plugin 脚本输出不产，runtime ready-state 经 `observation_to_metric_record` 必填）；`ProviderUsagePeriod.metric_id` 必填；前端 `ProviderAccountRow` bulk 用 `period.metric_id` 查询。新 connector 的 metric_id 构造规则须保证 trend 查询路径能拿到一致键。
- 现状：有效

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

## d015 sparkline 查询需 source_instance_id 维度；idx_trend 对该查询冗余（2026-08-05）

- 来源：t214
- 结论：`query_trend_series` SQL 须含 source_instance_id 过滤——多账号 provider（tavily 等 12 个，connector 给所有账号写同一 account_id）账号真实身份压在 source_instance_id，缺该维度则同 provider 多实例采集混桶取随机最新，sparkline 显示错误账号数据（t057「instance 区分足够」结论只对 insert/get_latest/list_latest 成立，对 query_trend_series 不成立，漏验 sparkline）。加维度后 SQLite planner 改用 idx_lookup(provider, account_id, metric_id, source_instance_id, observed_at)——全覆盖 WHERE 等值列 + observed_at 范围；idx_trend(provider, account_id, metric_id, observed_at) 不含 source_instance_id，对该查询已冗余（planner 不选），但对不含 instance 的等价查询路径仍可用，故保留。
- 证据：t214 DB 实测 tavily 8 实例每天混桶（2026-07-29 有 392 行来自 8 实例，旧逻辑取随机最新）；EXPLAIN QUERY PLAN 加 source_instance_id 后显示 `USING INDEX idx_lookup`；集成测试 `trend-instance-isolation.test.ts` + local-api 端点测试验证隔离。
- 影响：trend 三路径（IPC trend:get/getBulk、local-api /v1/trend、web）均须透传 source_instance_id；account card 恒单 instance（accountKey 含 sourceInstanceId），bulk 顶层单一 source_instance_id 安全。后续若清理 idx_trend 须确认无其他查询路径依赖。
- 现状：有效

## d016 sparkline 取点策略：固定 ≤max_points 桶 + 窗口选择（2026-08-05）

- 来源：t208
- 结论：`query_trend_series` 取点从「按 UTC 天分桶、长度=days、null 填充」改为固定桶数（max_points 默认 120）：原始点数 ≤cap 时每点独立（不聚合，保留采集粒度），超过则按 cap 桶均分 `[now-days, now]` 窗口、每桶取 observed_at 最大一条；不再 null 填充。DB 细粒度存储（30min 采集）此前被按天压缩为一天一点，现按实际采集粒度渲染。前端窗口选择器（1/7/30 天）session 内 state，cache_key 含 days。sparkline 宽 560px/有效 ~514px/点半径 2.6px，120 点间距 ~4.3px 清晰不糊。
- 证据：t208 `trend-granularity.test.ts` 4 用例（48 点>1、≤120、原始<cap 不聚合、>cap 同桶取最新）；DB 实测 tavily avg 18min 采集间隔。
- 影响：trend 三路径（IPC/local-api/web）返回长度语义变（≤max_points，非 days）；`build_trend_series` 入参保留 `|null` 防御；sparkline 不再因按天压缩丢日内波动。窗口选择不持久化（后续增强）。
- 现状：有效

## d017 四端会话 transcript 正文消息来源与字段路径（2026-08-05）

- 来源：s015（t209 SPIKE）
- 结论：四端（claude_code/opencode/kimi_code/grok）会话正文消息的字段路径（实测本机/WSL 真实数据）：
    - claude_code：`~/.claude/projects/<proj>/<sess>.jsonl`，复用现有 reader + 决策 2 过滤（留 user/assistant 文本，剔 tool_use/tool_result/system/thinking）。
    - opencode：`~/.local/share/opencode/opencode.db` SQLite，`message.data.role` + `part.data{type:"text",text}`（过滤 tool/reasoning/step-start/step-finish/patch/compaction）；时间 `part.time_created`。
    - kimi_code：`~/.kimi-code/sessions/<wd>/<sess>/agents/main/wire.jsonl`，`context.append_message.message.{role,content[type=text].text}` + 顶层 `time`；`turn.prompt` 与 append_message 重复 user 输入，取 append_message 去重。
    - grok：**正文在 `chat_history.jsonl`（WSL `~/.grok/sessions/<enc_cwd>/<sess>/`），不是 `updates.jsonl`**（后者只有 turn_completed usage 元数据，现有 token-stats reader 用它）。每行 `{type:"user|assistant|system|reasoning|tool_result", content}`（字符串或 `[{type:"text",text}]`），**无顶层 timestamp**（按行序）。
- 证据：s015 真实数据采样脚本（`.scratch/`，gitignore），opencode part.type 分布、kimi wire.jsonl 事件类型、grok chat_history.jsonl 45 行 9 parse_error 边界。
- 影响：t209 提取器按上述路径实现；grok 时间戳为 null（chat_history.jsonl 无时间字段），窗口按行序展示；grok 提取器须读 chat_history.jsonl 而非 updates.jsonl，与现有 token-stats reader（读 updates.jsonl）是两个独立文件。
- 现状：有效

## d018 会话窗口外壳状态保留机制与 demo 依赖对照（2026-08-06）

- 来源：t223
- 结论：
    1. 页签常驻挂载 + CSS `display:none` 切换在 Chromium 中保留各页内部状态（含滚动位置）：Playwright 实测 `display:none` 后 scrollTop 保留（150→0→150），React 组件不卸载、订阅不注销，切回即原状态。比条件卸载/重建更省，且天然满足「切回不丢状态」。
    2. 会话窗口主题独立于全局：默认暗色、`localStorage omni_session_theme` 持久化、切换设 `html[data-theme]`，不写全局 `config.theme`——避免与其它窗口全局主题互相覆盖。持久化主题须在 `useLayoutEffect` 同步应用，否则 preload 首帧（按系统 `ou_theme`）与持久化主题不一致时闪一帧。
    3. frontend_demo（SessionGrid demo）依赖的 radix 组件族 / @dnd-kit / gsap / framer-motion / lenis / cmdk / react-markdown / next-themes 主仓均未安装；t223 外壳用现有 react 19 + tailwind v4 + lucide-react + 既有 theme 机制零新增依赖实现。后续 t224（槽位拖拽需 @dnd-kit）、t227（react-markdown 消息渲染）如需这些库须另行评估新增依赖体积/许可并报用户确认。
- 证据：t223 `.scratch/t223/shell_blackbox.ts` 驱动打包 exe（CDP）验证页签切换/主题/跳转；code reviewer Playwright 实测 scrollTop 保留；主仓与 demo `package.json` 依赖逐项对照。
- 影响：t224-t228 工作台/会话库/摘选任务可在现有依赖与外壳基础上推进；拖拽/命令面板/消息渲染库引入是独立决策点。
- 现状：有效

## d019 槽位模型 ref/state 双维护与订阅生命周期坑（2026-08-06）

- 来源：t224
- 结论：
    1. React 19 批处理下，批量打开循环内读 render-fresh ref 会 stale（t211 超 6 模态同款坑）：`onFocus` 连续装入多个会话时，`slots_ref` 在同批内不刷新，重复打开/超位判定失真。解法是「state + 同步 ref」双维护——所有槽位写操作先 `ref.current = next` 再 `setState`，批内连续调用读到最新。任何绕过 ref 直写 state 的路径（如异步 meta 刷新）都会造成 ref/state 分叉，后续基于 ref 的操作把已刷新的 meta 回退。
    2. 同一 loc 装入两个槽位是坏状态：columns 按 loc_key 键控（第二槽覆盖同一列数据），订阅以 webContents id 为 subscriber（同 loc 幂等共享 watcher），关闭任一槽 `unsubscribe(loc)` 整体移除订阅 + 删列 → 另一槽永久「加载中」。装入前必须 `find_slot_by_loc` 查重。
    3. 最近会话「清空替换全部槽位」若不先逐个 unsubscribe，被替换会话的 watcher 继续存活到窗口销毁（反复替换累积）。替换前必须退订旧槽位。
- 证据：t224 reviewer 基于 `session-history-ipc.ts:67`（subscriber 键控）与 `subscription-service.ts:241-243`（2s 轮询）分析；`WorkspaceView.tsx` 实现与测试。
- 影响：槽位类 UI（工作台/后续会话库/摘选）沿用「ref 双维护 + loc 查重 + 替换前退订」三不变量；异步槽位 meta 刷新必须走 ref 同步路径。
- 现状：有效

## d020 react-markdown v10 默认丢弃原始 HTML（2026-08-06）

- 来源：t225
- 结论：react-markdown v10 默认**不渲染原始 HTML**——需显式配 rehype-raw 才把 HTML 当节点解析。会话内容不可信场景下，只装 react-markdown + remark-gfm（不装 rehype-raw、不 dangerouslySetInnerHTML）即满足「不把会话 HTML 当 HTML 执行」安全约束。测试侧 `img`/`script` 查询为 null 可真实拦截 rehype-raw 误配回归。
- 证据：t225 MarkdownMessage.test.tsx HTML 安全用例（script 注入 + img onerror 均不执行，`document.querySelector("img"/"script")` 为 null）。
- 影响：后续会话库/消息渲染沿用同一约束；新增 markdown 渲染库评估以「默认不解析 HTML」为安全前提。
- 现状：有效

## d021 会话库查询扩展与内容搜索并集（2026-08-06）

- 来源：t227
- 结论：
    1. `tokenStatsStore.query_sessions` 扩展 sources[]/start_at/end_at/order_by/direction：时间范围用活动时间交集（`ended_at >= start_at AND started_at <= end_at`），order_by 白名单（ended_at/tokens 表达式/calls/started_at）+ direction 白名单（ASC/DESC）防 SQL 注入。
    2. 「包含消息内容」搜索语义 = 元信息命中 ∪ 正文命中（并集）：纯正文命中会话须显示，不能只 filter 元信息结果。正文命中异步逐候选读消息，必须用序号守卫防旧查询迟到覆盖；命中结果须用响应式 state（ref + force_update 不会触发 useMemo 重算）。
    3. 会话主键是 (id, source, env)：勾选/dock/列表 key 须含三者，只按 id 跨 source/env 会串选。
- 证据：t227 query_sessions 扩展测试（多 source IN/时间交集/tokens/calls 排序）、SessionLibrary 内容搜索并集测试。
- 影响：会话库/后续会话类 UI 沿用「时间交集 + 并集搜索 + 序号守卫 + 三元主键」四不变量；新增会话查询扩展走白名单排序防注入。
- 现状：有效

## d022 会话窗口应复用全局主题通道（2026-08-07）

- 来源：s016
- 结论：会话窗口的 `history` 路由必须显式调用共享 `useTheme()`；该 hook 通过 `window.usageboard.config.get()` 读取全局主题，订阅 `event.onThemeChange`，首帧由 preload 的 `ou_theme` 参数设置。会话壳不应再维护 `omni_session_theme` 独立存储。
- 证据：检查 `src/renderer/App.tsx` 的 history 路由、`src/renderer/lib/theme.ts`、`src/main/window/window-manager.ts`、`src/preload/index.ts` 与会话测试 mock，确认现有全局通道完整覆盖配置读取、首帧和运行时变更。
- 影响：移除会话窗口独立主题 hook 与顶栏主题按钮时，不需新增 IPC 或主题状态存储。
- 现状：有效

## d023 工作台徽标复用用量面板 provider 资源（2026-08-07）

- 来源：s017 / t246
- 结论：会话 source 到用量面板 provider logo 的映射为 `claude_code`→`claude`、`kimi_code`→`kimi`、`grok`→`grok`、`opencode`→`opencode_go`；未知 source 使用 `overview` 兜底。`VendorMark` 负责复用单资源或双主题资源，工作台会话面板和左侧 rail 不应重新实现首字母徽标。
- 证据：`connectors/opencode_go/manifest.json`、`src/renderer/components/Icon.tsx` 的资源映射、`src/renderer/lib/provider-usage.ts` 的 provider 列表、`icon.test.tsx` 的 OpenCode 资源测试，以及 t246 组件测试对实际资源输出的断言。
- 影响：新增会话 source 或 provider 时，先确认用量面板的 vendor id，再扩展共享映射与组件测试；未知 source 必须保留非空 SVG 兜底。
- 现状：有效

## d024 渲染层代码分割与 echarts 按需注册（2026-08-07）

- 来源：t249 / s018
- 结论：
    1. `React.lazy` + `<Suspense>` 在 web 与 Electron renderer 两个入口均触发 Vite 代码分割：各 route 页面成为独立 chunk，首屏入口不再含 echarts 运行时与会话库子树。
    2. echarts 整包动态 import 后独立 chunk 约 1.1 MB，仍超 Vite 默认 500 kB chunk size 阈值；改用 `echarts/core` 按需注册（仅注册 Bar/Heatmap/Pie + Grid/Tooltip/DataZoom/VisualMap + CanvasRenderer）后，**web 端**所有 chunk < 500 kB，web 构建不再输出 chunk size 警告；renderer 端 echarts 按子模块拆分为独立 chunk（charts/components/Axis 最大约 655 kB），electron-vite 构建不输出 chunk size 警告。echarts 运行时特征串为 `echarts_instance_`。
    3. echarts 动态加载与组件卸载存在竞态：异步 init resolve 前组件已卸载时不得调用 `init`/`setOption`。防护 = 卸载时置 disposed 标志，resolve 回调先检查；`getOption` 须经 ref 取最新闭包，避免动态 import 期间 option 变化。
- 证据：s018 最小实验构建产物 chunk 划分（web 入口 204 kB、echarts 拆分 core/charts/components/Axis 各 < 300 kB；renderer 同构但最大约 655 kB）、`tests/unit/build_code_split.test.ts` 产物断言、`tests/unit/renderer/hooks/use_echarts_lazy.test.ts` 竞态测试。
- 影响：后续新增图表/渲染组件优先走按需注册 + 懒加载；chunk 阈值不调整；新增懒加载路由须带 Suspense fallback。
- 现状：有效

## d025 RTL fake timers 下 waitFor 依赖全局 jest（2026-08-08）

- 来源：t261
- 结论：`@testing-library/dom@10.4.1` 的 `waitFor` 无 `shouldAdvanceTime` 选项；fake timers 分支（`jestFakeTimersAreEnabled()`）直接调用全局 `jest.advanceTimersByTime`（`node_modules/@testing-library/dom/dist/wait-for.js`）。vitest 不提供 `jest` 全局，故需在 `beforeEach` `vi.stubGlobal("jest", vi)`，使 waitFor 走 fake-timers 轮询分支并能推进虚拟时钟。跨防抖等待用 `await act(async () => { await vi.advanceTimersByTimeAsync(ms); })`。
- 证据：`tests/unit/renderer/views/popup_view_t250.test.tsx` beforeEach/afterEach 与 `wait_debounce`；stub 后该文件 5 用例通过、单文件 0 条 act 警告。
- 影响：后续把真实计时器测试改 fake timers（消 act 警告）时，直接复用此方案；升级 `@testing-library/dom` 后可复核是否已有官方 `shouldAdvanceTime` 等价选项。
- 现状：有效

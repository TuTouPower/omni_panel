# ai-cli-token-stats-api

> 验证方式：API。拆自 ai-cli-token-stats（t037）。

本地 AI CLI Token 统计的数据采集层：只读读取 Claude Code / OpenCode / Kimi Code 本地文件，按天按模型聚合后落入复用的 `usage.db`（`token_stats_*` 表），并通过 LocalAPI HTTP 端点对外提供查询。不含子进程 fork / IPC / 窗口（见 `-desktop`），不含 React 组件（见 `-ui`）。

## 1. 定位

通过独立子进程定时读取本地数据文件，聚合后展示 token 趋势与 session 列表。**只读**——绝不修改源数据。

与现有连接器的区别：

|          | 现有连接器          | 本功能                     |
| -------- | ------------------- | -------------------------- |
| 数据源   | 远程 API / 网页登录 | 本地文件（JSONL / SQLite） |
| 数据语义 | 实时额度/余额       | 历史 token 累计用量        |
| 采集方式 | 主进程连接器沙箱    | 独立子进程（标准 Node.js） |
| 更新频率 | 定时轮询（5s+）     | 10 分钟定时增量读取        |
| 展示     | PopupView 用量条    | 独立窗口（见 `-ui`）       |

## 2. 数据源（只读约束）

**核心约束**：所有源数据文件只读访问。子进程绝不修改 Claude Code / OpenCode / Kimi Code / Grok 的任何文件（JSONL、SQLite、WAL、SHM）。读取 SQLite 时使用 `mode: readonly` 打开。

### 2.1 Claude Code

| 数据               | 格式          | Win 路径                                          | WSL 路径                                   |
| ------------------ | ------------- | ------------------------------------------------- | ------------------------------------------ |
| Session 级累积快照 | JSONL         | `~/.claude/metrics/costs.jsonl`                   | `/home/{USER}/.claude/metrics/costs.jsonl` |
| 每次 API 调用明细  | Session JSONL | `~/.claude/projects/{project}/{session_id}.jsonl` | 同                                         |

**costs.jsonl**：每行一次 API 调用后的累积快照。关键字段：`Timestamp`、`session_id`、`model`、`input_tokens`、`output_tokens`、`cache_write_tokens`、`cache_read_tokens`。

**聚合策略**：按 `session_id` 分组后取 `max_by(.timestamp)`（时间最新的一条），**不用** `map(last)`（文件行序不可靠——rotate/replay 可能导致后写的行时间更早）。需过滤 `session_id="default"` 且 `model="unknown"` 的零值记录。

**Session JSONL**：`type: "assistant"` 的记录含 `message.usage`（逐次调用精确用量）。

**去重策略**：同 `(timestamp, input_tokens, output_tokens)` 的多条记录来自 streaming 中间快照。去重键用 `(timestamp, input_tokens, output_tokens, cache_read_input_tokens)`，冲突概率更低。同键多条取最后一条。**Spike 0.8 需验证哪种策略更接近真实数据**。

**字段完整性**：约 80% 的 costs.jsonl 行缺 `cache_*` 和 `transcript_path` 字段。

**Win/WSL 差异**：两份独立文件，需合并才能得到完整统计。

### 2.2 OpenCode

| 数据   | 格式   | Win 路径                                          | WSL 路径                              |
| ------ | ------ | ------------------------------------------------- | ------------------------------------- |
| 数据库 | SQLite | `%USERPROFILE%\.local\share\opencode\opencode.db` | `~/.local/share/opencode/opencode.db` |

**session 表**：每 session 一行。关键字段：`id`、`model`（JSON，需 `json_extract(model, '$.id')`）、`tokens_input`、`tokens_output`、`tokens_reasoning`、`tokens_cache_read`、`tokens_cache_write`、`title`、`directory`、`time_created`（Unix epoch ms）、`time_updated`。

**part 表**：每步 API 调用。`data` 字段 JSON 中 `type: "step-finish"` 含逐次 token 用量（累积值，需算增量）。

**Win/WSL 差异**：两份独立 SQLite，需分别读取。打开时使用 `mode: readonly`，避免锁竞争。

### 2.3 Kimi Code

| 数据              | 格式       | Win 路径                                                                  | WSL 路径                                                      |
| ----------------- | ---------- | ------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 每次 API 调用明细 | wire JSONL | `%USERPROFILE%\.kimi-code\sessions\{ws}\{session}\agents\main\wire.jsonl` | `~/.kimi-code/sessions/{ws}/{session}/agents/main/wire.jsonl` |
| session→目录映射  | JSONL      | `%USERPROFILE%\.kimi-code\session_index.jsonl`                            | `~/.kimi-code/session_index.jsonl`                            |

**wire.jsonl**：`type: "usage.record"` 且 `usageScope: "turn"` 的行含逐回合 token——`usage.inputOther`→input、`usage.output`→output、`usage.inputCacheRead`→cache_read、`usage.inputCacheCreation`→cache_write，附 `model` 与 `time`（epoch ms）。`usageScope: "session"` 是 session 结束聚合，忽略以免双算。

**session_index.jsonl**：每行 `{sessionId, sessionDir, workDir}`，提供 session→工作目录映射。

**Win/WSL 差异**：两份独立目录，分别读取。

### 2.4 Grok Build

双源采集（t426）：Windows 经 WSL UNC（grok_wsl），Linux/mac 本机 `~/.grok`（grok_local）。数据位于 `~/.grok/sessions/{enc_cwd}/{session_id}/updates.jsonl`，`{enc_cwd}` 为 URL-encoded cwd，每个会话一个文件。

| 数据            | 格式  | WSL 路径                                                                              |
| --------------- | ----- | ------------------------------------------------------------------------------------- |
| 每轮 token 用量 | JSONL | `~/.grok/sessions/{enc_cwd}/{session_id}/updates.jsonl`（UNC：`\\wsl.localhost\...`） |

**事件口径**（t197，参考 cc-switch `session_usage_grokbuild.rs` 注释 + 实测确证）：`turn_completed` 事件（`params.update.sessionUpdate === "turn_completed"`）的 `usage` 是【该 user prompt 一轮的独立总量】，轮内跨 inference loop 累加（`modelCalls`/`numTurns` = 本轮 loop 数），下一轮从零起算。**不是进程或会话累计，勿用相邻事件差分**。字段映射：`inputTokens`→input、`outputTokens`→output、`cachedReadTokens`→cache_read、`reasoningTokens` ⊂ `outputTokens` 不计费（output 直接映射，reasoning 不单独记账）、`costUsdTicks` 不入账。`message_id` 用 `prompt_id`（实测每事件必有、稳定）；`timestamp` 为秒，×1000 换算。model 取 `usage.modelUsage` 键（单 key 直接用，多 key 排序 join `+`），token 分量用顶层 usage。`directory`/`title` 从 `{enc_cwd}` 解码派生（title=解码后 basename）。

## 3. 架构：为什么不用连接器

连接器沙箱（`node:vm`）为远程 API 设计。本地文件读取的特殊性：

- OpenCode 的 SQLite 是二进制文件，沙箱的 `ctx.files.read()` 无法执行 SQL 查询
- 绕行方案（host 预查询注入 `ctx.params`）增加不必要的复杂度
- JSONL 解析 + SQLite 查询是纯本地 IO，不需要 auth / endpoint / proxy 等连接器抽象

子进程方案与连接器体系**不冲突**——它们是平行的数据采集通道。连接器管远程 API（额度/余额），子进程管本地文件（历史用量）。子进程的 fork / 生命周期 / IPC 见 `-desktop`。

## 4. 模块结构

```
src/main/core/token-stats/
├── collector.ts           # 子进程入口（被 fork），内联按模型/天聚合逻辑
├── claude-reader.ts       # costs.jsonl + session JSONL 读取
├── opencode-reader.ts     # opencode.db 只读查询
├── kimi-reader.ts         # Kimi Code wire.jsonl + session_index 读取
├── grok-reader.ts         # Grok updates.jsonl 读取（双源：WSL UNC + local，t426）
├── token-stats-store.ts   # token_stats_* 表建表 + 读写（复用 usage.db）
└── manager.ts             # 主进程侧：fork / 生命周期 / IPC 接收（见 -desktop）
```

共享类型与 Zod schema 放 `src/shared/types/token-stats.ts`（不在模块内单独建 `types.ts`）。聚合逻辑内联进 `collector.ts`，不单独建 `aggregator.ts`。

**只读保证**：

- JSONL：`fs.readFile` / `fs.createReadStream`，天然只读
- SQLite：`new Database(path, { readonly: true })`，拒绝写操作
- 子进程不 import 任何写入工具（不引入 `fs.writeFile`、`fs.appendFile`）

## 5. WSL 路径解析

Win 端读取 WSL 文件通过 `\\wsl.localhost\{distro}\...` UNC 路径。

配置结构：

```typescript
interface TokenStatsConfig {
    readonly win_home: string; // e.g. "C:\\Users\\Karson"
    readonly wsl_enabled: boolean; // 默认 false
    readonly wsl_distro: string; // 默认 "Ubuntu-22.04"
    readonly wsl_user: string; // 必填（启用 WSL 时）
    readonly poll_interval_ms: number; // 默认 600000（10 分钟），设置页可改
}
```

路径拼接：

- Win Claude Code：`{win_home}\.claude\metrics\costs.jsonl`
- WSL Claude Code：`\\wsl.localhost\{wsl_distro}\home\{wsl_user}\.claude\metrics\costs.jsonl`
- OpenCode 同理。

**UNC 超时**：每个文件操作（`readFile`、`access`、`stat`）单独 `Promise.race` + 5 秒超时。超时则跳过该数据源，warn 日志记录，不影响其他源采集。WSL 未运行/挂起时 UNC 会长时间阻塞（实测 30-60 秒），必须防护。

**配置校验**：`wsl_enabled` 为 true 时，`wsl_distro` 和 `wsl_user` 必须非空。启动时 `fs.access` 校验 UNC 基路径可达，不可达则 warn 并跳过 WSL 源（不阻塞 Win 源）。

## 6. 数据模型

### 6.1 新建 SQLite 表

复用现有 `usage.db` 文件路径，新建独立 `token-stats-store.ts` 模块管理建表和读写，不侵入 `observation-store.ts`。

```sql
-- 按天按模型的 token 聚合（趋势图数据源；由 daily 表派生重建）
CREATE TABLE IF NOT EXISTS token_stats_buckets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,           -- 'claude_code' | 'opencode' | 'kimi_code' | 'grok'
    env TEXT NOT NULL,              -- 'win' | 'wsl'
    bucket_date TEXT NOT NULL,      -- '2026-07-17'（按天，UTC）
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    sessions INTEGER NOT NULL DEFAULT 0,
    calls INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,    -- epoch ms
    UNIQUE(source, env, bucket_date, model)
);

-- session 列表
CREATE TABLE IF NOT EXISTS token_stats_sessions (
    id TEXT NOT NULL,               -- session_id
    source TEXT NOT NULL,           -- 'claude_code' | 'opencode' | 'kimi_code' | 'grok'
    env TEXT NOT NULL,              -- 'win' | 'wsl'
    model TEXT NOT NULL,
    title TEXT,
    directory TEXT,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    calls INTEGER NOT NULL DEFAULT 0,
    started_at INTEGER NOT NULL,    -- epoch ms
    ended_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (id, source, env)
);

-- per-(session, day, model) 派生中间层：reader 每次扫描某 session 时
-- 全量重算该 session 当日该 model 的 usage，作为 buckets 重建源。session
-- 累积快照无法把用量归因到正确日期，这一层解决了「近 7 天」准确性。
CREATE TABLE IF NOT EXISTS token_stats_daily (
    id TEXT NOT NULL,               -- session_id
    source TEXT NOT NULL,
    env TEXT NOT NULL,
    date TEXT NOT NULL,             -- UTC YYYY-MM-DD
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    calls INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (id, source, env, date, model)
);

-- per-message token 记录（逐次调用时间线数据源）
CREATE TABLE IF NOT EXISTS token_stats_records (
    source TEXT NOT NULL,
    env TEXT NOT NULL,
    session_id TEXT NOT NULL,
    title TEXT,
    directory TEXT,
    slug TEXT,
    version TEXT,
    parent_session_id TEXT,
    message_id TEXT NOT NULL,
    role TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    agent TEXT NOT NULL,            -- 'claude-code' | 'opencode' | 'kimi-code'
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (message_id, source, env)
);

-- t192 派生聚合：per (session, 本地整点小时, model, directory, agent) 增量聚合。
-- dashboard 任意窗口拆「完整小时段（本表）+ 窗口边界部分小时（records）」，
-- 读取规模随 小时×分组 数增长，与 per-message records 总量解耦。
CREATE TABLE IF NOT EXISTS token_stats_hour_rollup (
    source TEXT NOT NULL,
    env TEXT NOT NULL,
    session_id TEXT NOT NULL,
    hour_start INTEGER NOT NULL,    -- UTC+8 整点小时起点（epoch ms）
    model TEXT NOT NULL,
    directory TEXT,                 -- 可空；GROUP BY 视 NULL 归一组（与 records oracle 一致）
    agent TEXT NOT NULL,            -- 'claude-code' | 'opencode' | 'kimi-code'
    calls INTEGER NOT NULL DEFAULT 0,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (source, env, session_id, hour_start, model, directory, agent)
);

-- t192 data version：每成功提交的 records 批次单调 +1，经 dashboard 响应与
-- 更新事件传递，供 renderer 精确判断缓存是否过期（不依赖本地时钟）。
CREATE TABLE IF NOT EXISTS token_stats_data_version (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    version INTEGER NOT NULL DEFAULT 0
);
INSERT INTO token_stats_data_version (id, version) VALUES (1, 0)
    ON CONFLICT(id) DO NOTHING;

-- t192 聚合就绪标志：hour_rollup_ready=1 仅在全量回填完成后置位；之前
-- dashboard 走 records 路径，避免部分填充的聚合表服务不完整数据。
CREATE TABLE IF NOT EXISTS token_stats_meta (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    hour_rollup_ready INTEGER NOT NULL DEFAULT 0
);
INSERT INTO token_stats_meta (id, hour_rollup_ready) VALUES (1, 0)
    ON CONFLICT(id) DO NOTHING;
```

**写入策略**（分层，见 `src/main/core/token-stats/token-stats-store.ts`）：

- `token_stats_sessions`：`UPDATE ... COALESCE(@field, field)` 已存在行（null 字段保留旧值；`started_at` 取 MIN、`ended_at` 取 MAX）；未命中再 `INSERT`。
- `token_stats_daily`：reader 每次扫描某 session 时全量重算当日数据，`INSERT OR REPLACE` by PK。每次 upsert 批处理后 `DELETE FROM token_stats_buckets` + `INSERT ... SELECT ... FROM token_stats_daily GROUP BY source, env, date, model` 重建 buckets。
- `token_stats_records`：reader 全量重发变更 session 的 message 记录，`INSERT OR REPLACE` by `(message_id, source, env)`。查询走 env+timestamp 窗口（`query_records`），故额外维护 `idx_records_env_ts (env, timestamp DESC)` 复合索引（migration v4）；主键 `(message_id, source, env)` 仅服务于写入去重，不支撑查询过滤。
- `token_stats_hour_rollup`：`upsert_records` 事务内，对每个被触碰 session `DELETE` 该 session 全部聚合行后从 records 全量重建（会话级重建）。不做行级 UPSERT——`directory` 可空，SQLite 视 NULL 唯一键互异，行级 ON CONFLICT 永不命中会叠重复行。`backfill_hour_rollup` 全表 `DELETE` 后从 records 重建并置 `hour_rollup_ready`。

### 6.2 source 枚举与 agent 字段

- `source` 枚举：`claude_code | opencode | kimi_code`（下划线形式）。
- `agent` 字段（records 表）：`claude-code | opencode | kimi-code`（连字符形式）。

### 6.3 迁移（PRAGMA user_version）

wipe-rebuild 驱动（派生表都是从采集数据重建）：

- v2：把 daily `date` 从 collector 本地时区改为 UTC bucketing；同时清理已删除 transcript 残留的 session 行。`DELETE FROM token_stats_daily; DELETE FROM token_stats_buckets; DELETE FROM token_stats_sessions;`，`PRAGMA user_version = 2`。
- v3：引入 `token_stats_records` 表时，`DELETE FROM token_stats_records;`，`PRAGMA user_version = 3`。
- v4：为 `token_stats_records` 补 `idx_records_env_ts (env, timestamp DESC)` 复合索引，消除 `query_records` 的 env+timestamp 窗口查询全表扫描。`CREATE INDEX IF NOT EXISTS`，`PRAGMA user_version = 4`。fresh DB 由 INIT_SQL 直接建索引，此迁移仅 backfill 已存在库。
- v5：补 `idx_records_ts (timestamp)` 与 `idx_records_session_ts (source, env, session_id, timestamp DESC)`，支撑 dashboard 窗口聚合与窗口内最新 title/directory 子查询。
- v6：建 t192 三张表（`token_stats_hour_rollup` / `token_stats_data_version` / `token_stats_meta`），DDL 与 INIT_SQL 共用同一 `ROLLUP_INIT_SQL` 常量防漂移。聚合表保持空 + 未就绪；store 打开后由 manager 后台回填，回填前 dashboard 走 records 路径。

collector 启动时会做 full rescan，wipe 后自然重建。

### 6.3.1 派生聚合读取、数据版本与重建（t192）

`token_stats_records` 是 dashboard 数据的**真相源**，`token_stats_hour_rollup` 是可重建派生层。`query_dashboard` 在 `hour_rollup_ready` 时优先读聚合层：

- **窗口拆分**：任意 `[start, end)` 拆为「完整本地小时段（UTC+8 整点，读聚合表）+ 窗口两个边界不足整点的部分小时（读 records）」UNION ALL，外层再聚合。`SUM(calls)`/`SUM(tokens)` 重组精确，`COUNT(DISTINCT session)` 跨两部分去重。窗口不足一个完整小时时整个窗口直接读 records（边界带公式会溢出窗口）。
- **单次窗口读取（t201）**：dashboard 把当前窗口物化一次为 `TEMP TABLE window_rows`（rollup 就绪 = 中段聚合表 UNION ALL 边界 records；未就绪 = 整窗 records），metric_buckets / session_buckets / heatmap / rollup 各展示区域从该临时表派生，previous 窗口独立二次物化（只喂 summary delta）；per-session 元数据用单一窗口级 latest-per-group `session_meta` 查询取齐，替代每 session 相关子查询。records/rollup 双轨统一为单一 window source。
- **模型筛选（t204）**：dashboard / dashboard/sessions 查询 schema 增可选 `model`；store 的窗口物化（union 两侧 `AND model=@model`）、records fallback、`build_dashboard_conditions`、heatmap/range_rollup/sessions 聚合全部按 `model` 过滤；local-api 与 IPC 透传。模型下拉选项须取**全窗口**（agent/platform/range，不含 model）distinct model——单独物化 `TEMP TABLE window_models`（从 records 按 agent/platform/range 查 `SELECT DISTINCT model`），与 window_rows 解耦，避免选中模型后下拉坍缩。
- **data version**：`upsert_records` 事务内对每成功提交批次 `version + 1`（sessions/daily 不推进——records 是 dashboard 数据源）。失败/回滚整批回退不推进；空批次不推进。dashboard DTO 的 `data_version` 字段与 `TOKEN_STATS_UPDATED` 更新事件携带同一已提交版本。
- **freshness.stale（t201）**：查询开始/结束各读一次 `data_version`，`stale = end_version > start_version`（聚合期间有已提交新批次）；返回 `data_version` 用结束版本，renderer 按下述 AC4 语义 mark_stale + revalidate。
- **renderer 缓存失效**：TokenStatsView 记录最近一次已见版本（`last_data_version`），事件版本 ≤ 该值时缓存仍有效直接复用；更新版本触发 `mark_stale` + 静默 revalidate。查询竞态沿用 request_id guard，旧响应不覆盖新数据。web 构建无推送通道，事件版本传 0（视为新数据，轮询刷新照常）。
- **回填与重建**：manager.start 后 `setImmediate` 后台全量回填，完成前置 `hour_rollup_ready`；回填前 dashboard 走 records 路径。`backfill_hour_rollup` 幂等（DELETE 全表 + 重建），中断重跑收敛同表；聚合损坏/版本不兼容时重跑即可恢复，records 不受影响。

### 6.4 增量状态

子进程内部维护内存状态（不落盘，重启从零重建）：

```typescript
interface IncrementalState {
    costs_jsonl: Map<string, { offset: number; size: number }>; // path → {byte offset, file size at last read}
    session_files: Map<string, { mtime: number; size: number }>; // path → {mtime, size at last read}
    opencode_max_updated: Map<string, number>; // db_path → MAX(time_updated)
}
```

**Offset 安全校验**：每次读取前 `fs.stat(path)`，若 `stat.size < saved.offset`（文件被删除重建/rotate），丢弃 offset 从零读取并 warn 日志。同理 `stat.size === saved.size && stat.mtime === saved.mtime` 时跳过（文件未变化）。

### 6.5 采集输出契约

子进程完成一轮采集后，通过 `parentPort.postMessage` 发出 `TokenStatsUpdate`（载体定义；通信机制与大小上限见 `-desktop`）：

```typescript
interface TokenStatsUpdate {
    type: "token_stats_update";
    sessions: TokenStatsSessionUpsert[]; // session 增量 delta（字段可空 = 无信息）
    daily: TokenStatsDailyUpsert[]; // per-(session, day, model) 全量重算
    records: AgentSessionUsageRecord[]; // per-message 时间线记录
}
```

主进程收到后按 §6.1 分层策略写入 `token_stats_*` 表（sessions upsert + daily replace + buckets 重建 + records replace）。

### 6.5.1 dashboard 查询隔离：utilityProcess query worker（t193）

`TOKEN_STATS_DASHBOARD`（与 `/v1/dashboard`）的聚合读取运行在独立 **utilityProcess** query worker 内，不占主进程事件循环：

- **执行端**：`query-worker.js`（electron-vite 多入口，asarUnpack 后 `resolve_worker_path` 从 `app.asar.unpacked` 定位）。打开 `{ readonly: true }` 的 WAL 连接读已提交数据，写事务进行中读快照不阻塞；聚合表损坏时由 manager 后台回填恢复，worker 只读不受影响。
- **调度**：`query-dispatcher` 持单 worker；并发上限 1 active + 1 queued（超上限的旧请求以受控 superseded 错误拒绝），单请求 10s 超时，崩溃后 `restart_delay` 受控重启（间隙内新请求即时 spawn 且 restart timer 不再双 fork），`stop()` 先发 `close` 释放只读连接再 `kill`。
- **契约不变**：错误映射、data version 与隔离前一致（见 §7）；worker 只接收 `db_path` + 已校验 query + status 快照，不获得 vault/connector secret 或任意文件访问（AC7）。

### 6.6 AgentSessionUsage 类型

`src/shared/types/token-stats.ts` 定义共享类型 + Zod schema，包括：

- `TokenStatsBucket`、`TokenStatsSession`、`TokenStatsUpdate`、`IncrementalState`、`TokenStatsConfig`
- `AgentSessionUsage` / `AgentSessionUsageRecord`：per-message 记录的数据契约，供 records 表与 UI 时间线视图共用
- `TokenStatsSessionUpsert` / `TokenStatsDailyUpsert`：collector → store 的增量 upsert payload

## 7. LocalAPI 端点契约

> 注：原 `ai-cli-token-stats` 未明确 HTTP 端点契约。OmniPanel LocalAPI 把渲染端 IPC 暴露为 HTTP，以下端点按 §6 数据模型与 §8 文件清单（`token-stats-ipc.ts`）推导，作为契约建议；具体实现细节随 `-desktop` IPC handler 落地。

只读查询端点，均 GET，返回 JSON。

| 端点               | 查询参数                                                        | 返回                                                                                   | 数据源表               |
| ------------------ | --------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------- |
| `GET /v1/buckets`  | `source?`, `env?`, `model?`, `from?`, `to?`                     | `{ buckets: TokenStatsBucket[] }`（按天聚合，用于趋势图）                              | `token_stats_buckets`  |
| `GET /v1/sessions` | `source?`, `env?`, `model?`, `q?`, `sort?`, `limit?`, `offset?` | `{ sessions: TokenStatsSession[], total: number }`（用于 Session 列表）                | `token_stats_sessions` |
| `GET /v1/records`  | `session_id`, `source?`, `env?`, `start?`, `end?`, `limit?`     | `{ records: AgentSessionUsageRecord[] }`（单 session 逐次调用时间线）                  | `token_stats_records`  |
| `GET /v1/status`   | —                                                               | `{ last_updated: number, envs: string[], sources: string[], counts: {...} }`（新鲜度） | 聚合多表               |

约束：

- 所有端点只读，不产生写入。
- `source` 取值：`claude_code` / `opencode` / `kimi_code`。
- `env` 取值：`win` / `wsl`；缺省=全部合并。
- 时间参数 `from` / `to`：ISO date（`YYYY-MM-DD`）或 epoch ms，按 `bucket_date` / `started_at` 过滤。
- `start` / `end`（`/v1/records`）：epoch ms，按 `timestamp` 过滤，与 `from`/`to`（日期）区分。
- `/v1/records` 的 `limit`：最大返回行数，缺省走 `DEFAULT_RECORDS_LIMIT`（5000）。records 表可累积至数十万行，无 limit 的全量查询会把整表物化进主进程内存并经 IPC 传输，渲染端按时间窗分页消费，故查询必须带 limit 兜底。`ORDER BY timestamp DESC` 保证超限时保留最新 N 条。
- `last_updated` 取相关表 `MAX(updated_at)`，UI 据此标注新鲜度。

## 8. 涉及文件清单（数据采集层）

| 文件                                             | 改动                                                                                    | Task     |
| ------------------------------------------------ | --------------------------------------------------------------------------------------- | -------- |
| `scripts/token-stats-spike.ts`                   | 新建：Phase 0 验证脚本（一次性）                                                        | 0        |
| `src/shared/types/token-stats.ts`                | 新建：共享类型 + Zod schema（含 `AgentSessionUsage` / `TokenStatsDailyUpsert`）         | 1.1      |
| `src/main/core/token-stats/token-stats-store.ts` | 新建：token*stats*\* 表建表 + 读写（复用 usage.db），含 user_version v2/v3 迁移         | 1.2      |
| `src/main/core/token-stats/claude-reader.ts`     | 新建：costs.jsonl + session JSONL 解析                                                  | 2.1, 2.2 |
| `src/main/core/token-stats/opencode-reader.ts`   | 新建：opencode.db 只读查询                                                              | 3.1      |
| `src/main/core/token-stats/kimi-reader.ts`       | 新建：Kimi Code wire.jsonl + session_index 解析                                         | 3.2      |
| `src/main/core/token-stats/collector.ts`         | 新建：utilityProcess 子进程入口，定时采集循环，内联按模型/天聚合；4.2 扩展 WSL 路径合并 | 4.1, 4.2 |

`manager.ts` / `index.ts` / IPC / preload / window / 视图等见 `-desktop` 与 `-ui`。

## 9. 明确不做（本版，数据采集层）

- **不做** Grok Build token 统计（`signals.json` 实测不存在）
- **不做** 小时粒度聚合（仅按天）
- **不做** 实时流式监控
- **不做** 文件 watcher

UI 层、桌面层的「不做」分别见 `-ui` 与 `-desktop`。

## 10. 成功标准（API 验证）

| #   | 标准                                                                             | 验证方式              |
| --- | -------------------------------------------------------------------------------- | --------------------- |
| 1   | Claude Code Win 端 costs.jsonl 正确解析，session 数与 `jq` 手动统计一致          | 自动化测试 + 手工对比 |
| 2   | OpenCode Win 端 session 表正确读取，按模型聚合 token 数与 `sqlite3` 手动查询一致 | 自动化测试            |
| 3   | WSL 数据通过 UNC 路径正确读取                                                    | 手工验证              |
| 7   | 增量更新不重复计数（重启后从零重建，INSERT OR REPLACE 去重）                     | 自动化测试            |
| 8   | **源数据零修改**——采集前后 diff 源文件，内容不变                                 | 自动化测试            |

桌面进程 (#4 #9 #10)、UI (#5 #6) 的成功标准分别见 `-desktop` / `-ui`。

## 11. 实施顺序

### Phase 0: Spike — 数据源可行性验证（必须先做，不可行则停止）

**目标**：用真实数据验证两个数据源的字段完整性、可用性、Win/WSL 路径可达性。**不可行则立即向用户报告**，不做后续 Phase。

**验证项**：

| #   | 验证                                 | 通过标准                                                                                               | 不可行时的报告内容                      |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| 0.1 | Win costs.jsonl 可读、JSONL 解析成功 | 至少 1 行含 `session_id` + `model` + `input_tokens` + `output_tokens`                                  | 文件不存在 / 格式不符 / 字段缺失        |
| 0.2 | Win costs.jsonl session 聚合         | 按 `session_id` 分组后，取最后一条，至少 1 个非 default session 含非零 token                           | 全部为 default/unknown 零值记录         |
| 0.3 | Win session JSONL 可读               | 至少 1 个 `*.jsonl` 文件含 `type: "assistant"` + `message.usage` 记录                                  | 目录为空 / 格式不符 / 无 usage 字段     |
| 0.4 | Win opencode.db 只读打开             | `new Database(path, { readonly: true })` 成功，`SELECT COUNT(*) FROM session` 返回 > 0                 | 文件不存在 / 版本不兼容 / 表结构不符    |
| 0.5 | Win opencode.db session 字段         | 查询 `id, json_extract(model,'$.id'), tokens_input, tokens_output, title, time_created`，至少 1 行有效 | model JSON 结构不符预期 / tokens 全为 0 |
| 0.6 | WSL UNC 路径可达                     | `\\wsl.localhost\Ubuntu-22.04\home\karon\.claude\metrics\costs.jsonl` 可 `fs.access`                   | WSL 未运行 / UNC 路径不可达 / 权限不足  |
| 0.7 | WSL opencode.db 只读查询             | 同 0.4/0.5，路径为 UNC                                                                                 | 同上                                    |
| 0.8 | Claude Code session JSONL 去重       | 按 `(timestamp, input_tokens, output_tokens)` 去重后，数据量合理（非爆炸式重复）                       | 去重率 < 10%（说明字段组合不唯一）      |

**执行方式**：写一个独立 spike 脚本 `scripts/token-stats-spike.ts`（`npx tsx` 运行），不做 UI、不做子进程、不做表。只读源文件、打印关键字段、输出统计摘要。输出示例：

```
=== Claude Code (Win) ===
costs.jsonl: 2847 行, 45 个 session (去 default), 模型: [claude-sonnet-4, deepseek-v4-pro, ...]
session JSONL: 12 个文件, 380 条 assistant 记录, 去重后 320 条

=== OpenCode (Win) ===
session 表: 13 行, 模型: [deepseek-v4-pro, claude-sonnet-4], tokens_input 总计: 1,234,567

=== WSL ===
UNC 路径可达: ✓ / ✗
costs.jsonl: ...行
opencode.db: ...行

=== 结论 ===
可行性: ✓ / ✗
阻塞问题: (无 / 列出)
```

**阻塞判定**：任一核心项（0.1-0.5）不通过 → 立即向用户报告，附 spike 脚本输出，暂停后续 Phase。

**Spike 额外验证**（非阻塞，记录发现即可）：

- 0.9 costs.jsonl 行序是否严格按 timestamp 单调递加（验证 `max_by` vs `last` 的必要性）
- 0.10 Session JSONL 去重键对比：`(timestamp, input_tokens, output_tokens)` vs 加 `cache_read_input_tokens` vs 加 `model`，统计冲突率

### Phase 1: 数据层

| Task | Commit 前缀                                | 内容                                                                                                                                                                                 | 前置 |
| ---- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| 1.1  | `feat(token-stats): add shared types`      | `src/shared/types/token-stats.ts` — `TokenStatsBucket`、`TokenStatsSession`、`TokenStatsUpdate`、`IncrementalState`、`TokenStatsConfig` 接口 + Zod schema                            | —    |
| 1.2  | `feat(token-stats): add token stats store` | `src/main/core/token-stats/token-stats-store.ts` — 独立模块，复用 `usage.db` 路径，`CREATE TABLE IF NOT EXISTS` 建表 + `INSERT OR REPLACE` / 查询方法。不侵入 `observation-store.ts` | 1.1  |

### Phase 2: Claude Code reader

| Task | Commit 前缀                                          | 内容                                                                                                                                            | 前置 |
| ---- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 2.1  | `feat(token-stats): add claude costs.jsonl reader`   | `src/main/core/token-stats/claude-reader.ts` — `read_costs_jsonl(path, offset)` 解析 + session 聚合 + 增量 offset 返回。单元测试：fixture JSONL | 1.1  |
| 2.2  | `feat(token-stats): add claude session jsonl reader` | `claude-reader.ts` 扩展 — `read_session_jsonls(dir, mtime_filter)` 遍历 + 解析 + 去重。单元测试                                                 | 2.1  |

### Phase 3: OpenCode reader / Kimi reader

| Task | Commit 前缀                                     | 内容                                                                                                                                      | 前置 |
| ---- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 3.1  | `feat(token-stats): add opencode sqlite reader` | `src/main/core/token-stats/opencode-reader.ts` — `read_sessions(db_path, max_updated)` 只读查询 + 模型提取。单元测试：内存 SQLite fixture | 1.1  |
| 3.2  | `feat(token-stats): add kimi readers`           | `src/main/core/token-stats/kimi-reader.ts` — wire.jsonl 解析 + session_index 映射。单元测试                                               | 1.1  |

### Phase 4（采集管道，部分）

| Task | Commit 前缀                                  | 内容                                                                                                                                                                                                                               | 前置     |
| ---- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 4.1  | `feat(token-stats): add collector`           | `src/main/core/token-stats/collector.ts` — `child_process.fork` 入口，`setInterval` 按配置间隔（默认 10 分钟）循环，调用 readers 后**内联**按 `(source, env, bucket_date, model)` 聚合，`process.send()` 结果。单元测试 + 集成测试 | 2.1, 3.1 |
| 4.2  | `feat(token-stats): add wsl path resolution` | `collector.ts` 扩展 — 从 config 读 `wsl_distro` + `wsl_user`，拼接 UNC 路径，合并 Win + WSL。配置 schema 新增字段。集成测试                                                                                                        | 4.1      |

Task 4.3（manager）见 `-desktop`。

### 依赖总览（本 spec 范围）

```
1.1 → 1.2 ──────────────────────→ (4.3 in -desktop)
  ↓
  2.1 → 2.2 ─┐
  3.1, 3.2 ──→ 4.1 → 4.2
```

## 12. 后续可扩展（数据采集层）

- Grok Build token 统计（待本地数据可靠后）
- 小时粒度聚合
- Session 详情（逐次调用时间线）的数据扩展

UI / 桌面层扩展见对应 spec。

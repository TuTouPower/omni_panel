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

**核心约束**：所有源数据文件只读访问。子进程绝不修改 Claude Code / OpenCode / Kimi Code 的任何文件（JSONL、SQLite、WAL、SHM）。读取 SQLite 时使用 `mode: readonly` 打开。

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

### 2.4 Grok Build（本版不做）

本地 token 用量文件待确认（`signals.json` 实测不存在）。留后续扩展入口。

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
    readonly win_home: string; // e.g. "C:\\Users\\TestUser"
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
    source TEXT NOT NULL,           -- 'claude_code' | 'opencode' | 'kimi_code'
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
    source TEXT NOT NULL,           -- 'claude_code' | 'opencode' | 'kimi_code'
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
```

**写入策略**（分层，见 `src/main/core/token-stats/token-stats-store.ts`）：

- `token_stats_sessions`：`UPDATE ... COALESCE(@field, field)` 已存在行（null 字段保留旧值；`started_at` 取 MIN、`ended_at` 取 MAX）；未命中再 `INSERT`。
- `token_stats_daily`：reader 每次扫描某 session 时全量重算当日数据，`INSERT OR REPLACE` by PK。每次 upsert 批处理后 `DELETE FROM token_stats_buckets` + `INSERT ... SELECT ... FROM token_stats_daily GROUP BY source, env, date, model` 重建 buckets。
- `token_stats_records`：reader 全量重发变更 session 的 message 记录，`INSERT OR REPLACE` by `(message_id, source, env)`。

### 6.2 source 枚举与 agent 字段

- `source` 枚举：`claude_code | opencode | kimi_code`（下划线形式）。
- `agent` 字段（records 表）：`claude-code | opencode | kimi-code`（连字符形式）。

### 6.3 迁移（PRAGMA user_version）

wipe-rebuild 驱动（派生表都是从采集数据重建）：

- v2：把 daily `date` 从 collector 本地时区改为 UTC bucketing；同时清理已删除 transcript 残留的 session 行。`DELETE FROM token_stats_daily; DELETE FROM token_stats_buckets; DELETE FROM token_stats_sessions;`，`PRAGMA user_version = 2`。
- v3：引入 `token_stats_records` 表时，`DELETE FROM token_stats_records;`，`PRAGMA user_version = 3`。

collector 启动时会做 full rescan，wipe 后自然重建。

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
| `GET /v1/records`  | `session_id`, `source?`, `env?`                                 | `{ records: AgentSessionUsageRecord[] }`（单 session 逐次调用时间线）                  | `token_stats_records`  |
| `GET /v1/status`   | —                                                               | `{ last_updated: number, envs: string[], sources: string[], counts: {...} }`（新鲜度） | 聚合多表               |

约束：

- 所有端点只读，不产生写入。
- `source` 取值：`claude_code` / `opencode` / `kimi_code`。
- `env` 取值：`win` / `wsl`；缺省=全部合并。
- 时间参数 `from` / `to`：ISO date（`YYYY-MM-DD`）或 epoch ms，按 `bucket_date` / `started_at` 过滤。
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
| 0.6 | WSL UNC 路径可达                     | `\\wsl.localhost\Ubuntu-22.04\home\testuser\.claude\metrics\costs.jsonl` 可 `fs.access`                   | WSL 未运行 / UNC 路径不可达 / 权限不足  |
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

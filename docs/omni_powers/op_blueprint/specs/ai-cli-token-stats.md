<!-- omni_powers: blueprint/specs/ai-cli-token-stats -->

# AI CLI Token / Session 统计面板

> 范围：Claude Code + OpenCode，Win + WSL 双环境。
> 前端设计参考：`ai-cli-token-stats-frontend-design.md`（独立设计文档，本 spec 定义数据采集与集成方案）。

## 1. 一句话定位

新增**本地 AI CLI Token 统计**能力：通过独立子进程定时读取 Claude Code 和 OpenCode 的本地数据文件，聚合后在独立窗口展示 token 趋势与 session 列表。**只读**——绝不修改源数据。

**与现有功能的区别**：

|          | 现有连接器          | 本功能                          |
| -------- | ------------------- | ------------------------------- |
| 数据源   | 远程 API / 网页登录 | 本地文件（JSONL / SQLite）      |
| 数据语义 | 实时额度/余额       | 历史 token 累计用量             |
| 采集方式 | 主进程连接器沙箱    | 独立子进程（标准 Node.js）      |
| 更新频率 | 定时轮询（5s+）     | 10 分钟定时增量读取             |
| 展示     | PopupView 用量条    | 独立窗口：趋势图 + session 列表 |

## 2. 数据源（只读约束）

**核心约束**：所有源数据文件只读访问。子进程绝不修改 Claude Code / OpenCode 的任何文件（JSONL、SQLite、WAL、SHM）。读取 SQLite 时使用 `mode: readonly` 打开。

### 2.1 Claude Code

| 数据               | 格式          | Win 路径                                          | WSL 路径                                   |
| ------------------ | ------------- | ------------------------------------------------- | ------------------------------------------ |
| Session 级累积快照 | JSONL         | `~/.claude/metrics/costs.jsonl`                   | `/home/{USER}/.claude/metrics/costs.jsonl` |
| 每次 API 调用明细  | Session JSONL | `~/.claude/projects/{project}/{session_id}.jsonl` | 同                                         |

**costs.jsonl**：每行一次 API 调用后的累积快照。关键字段：`timestamp`、`session_id`、`model`、`input_tokens`、`output_tokens`、`cache_write_tokens`、`cache_read_tokens`。

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

### 2.3 Grok Build（本版不做）

本地 token 用量文件待确认（`signals.json` 实测不存在）。留后续扩展入口。

## 3. 架构：独立子进程

### 3.1 为什么不用连接器

连接器沙箱（`node:vm`）为远程 API 设计。本地文件读取的特殊性：

- OpenCode 的 SQLite 是二进制文件，沙箱的 `ctx.files.read()` 无法执行 SQL 查询
- 绕行方案（host 预查询注入 `ctx.params`）增加不必要的复杂度
- JSONL 解析 + SQLite 查询是纯本地 IO，不需要 auth / endpoint / proxy 等连接器抽象

子进程方案与连接器体系**不冲突**——它们是平行的数据采集通道。连接器管远程 API（额度/余额），子进程管本地文件（历史用量）。

### 3.2 子进程设计

```
src/main/core/token-stats/
├── collector.ts          # 子进程入口（被 fork）
├── claude-reader.ts      # costs.jsonl + session JSONL 读取
├── opencode-reader.ts    # opencode.db 只读查询
├── aggregator.ts         # 按模型/天聚合
├── types.ts              # 共享类型定义
└── manager.ts            # 主进程侧：fork / 生命周期 / IPC 接收
```

**进程模型**：

```
Electron 主进程
  │  app.whenReady() 时 fork
  │
  ├── token-stats 子进程 (Node.js child_process.fork)
  │     │
  │     ├─ 启动时立即执行一次采集
  │     ├─ setInterval(10 分钟) 定时采集
  │     │
  │     ├─ 每次采集：
  │     │   ├─ 读 costs.jsonl（增量 offset）
  │     │   ├─ 遍历 session JSONL（增量 mtime）
  │     │   ├─ 查询 opencode.db（增量 time_updated）
  │     │   ├─ 聚合为 { buckets, sessions }
  │     │   └─ process.send({ type: "update", data })
  │     │
  │     └─ process.on("message") 接收配置更新
  │
  └─ 收到 IPC → 写入 token_stats_* 表 → 广播事件到渲染端
```

**子进程优势**：

- Electron 主进程保持轻量，IO 密集操作不阻塞 UI
- 标准 Node.js 运行，不受 Electron ABI 限制，直接用 `better-sqlite3`
- 进程隔离：子进程崩溃不影响主进程（可自动重启）
- 生命周期清晰：app 启动 fork，退出 kill

**只读保证**：

- JSONL：`fs.readFile` / `fs.createReadStream`，天然只读
- SQLite：`new Database(path, { readonly: true })`，拒绝写操作
- 子进程不 import 任何写入工具（不引入 `fs.writeFile`、`fs.appendFile`）

### 3.3 WSL 路径

Win 端读取 WSL 文件通过 `\\wsl.localhost\{distro}\...` UNC 路径。

子进程启动时从主进程接收配置：

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

- Win Claude Code：`{win_home}\\.claude\\metrics\\costs.jsonl`
- WSL Claude Code：`\\\\wsl.localhost\\{wsl_distro}\\home\\{wsl_user}\\.claude\\metrics\\costs.jsonl`
- OpenCode 同理。

**UNC 超时**：每个文件操作（`readFile`、`access`、`stat`）单独 `Promise.race` + 5 秒超时。超时则跳过该数据源，warn 日志记录，不影响其他源采集。WSL 未运行/挂起时 UNC 会长时间阻塞（实测 30-60 秒），必须防护。

**配置校验**：`wsl_enabled` 为 true 时，`wsl_distro` 和 `wsl_user` 必须非空。启动时 `fs.access` 校验 UNC 基路径可达，不可达则 warn 并跳过 WSL 源（不阻塞 Win 源）。

## 4. 数据模型

### 4.1 新建 SQLite 表

复用现有 `usage.db` 文件路径，新建独立 `token-stats-store.ts` 模块管理建表和读写，不侵入 `observation-store.ts`。

```sql
-- 按天按模型的 token 聚合（趋势图数据源）
CREATE TABLE IF NOT EXISTS token_stats_buckets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,           -- 'claude_code' | 'opencode'
    env TEXT NOT NULL,              -- 'win' | 'wsl'
    bucket_date TEXT NOT NULL,      -- '2026-07-17'（按天）
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
    source TEXT NOT NULL,           -- 'claude_code' | 'opencode'
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
```

**合并策略**：子进程每次采集全量聚合后，用 `INSERT OR REPLACE` 写入。`UNIQUE` 约束保证同源同 session 不重复。

### 4.2 增量状态

子进程内部维护内存状态（不落盘，重启从零重建）：

```typescript
interface IncrementalState {
    costs_jsonl: Map<string, { offset: number; size: number }>; // path → {byte offset, file size at last read}
    session_files: Map<string, { mtime: number; size: number }>; // path → {mtime, size at last read}
    opencode_max_updated: Map<string, number>; // db_path → MAX(time_updated)
}
```

**Offset 安全校验**：每次读取前 `fs.stat(path)`，若 `stat.size < saved.offset`（文件被删除重建/rotate），丢弃 offset 从零读取并 warn 日志。同理 `stat.size === saved.size && stat.mtime === saved.mtime` 时跳过（文件未变化）。

### 4.3 IPC 消息

子进程 → 主进程：

```typescript
// 子进程采集完成后发送
interface TokenStatsUpdate {
    type: "token_stats_update";
    buckets: TokenStatsBucket[]; // 聚合数据
    sessions: TokenStatsSession[]; // session 列表
}
```

主进程收到后 `INSERT OR REPLACE` 写入 `token_stats_*` 表，然后广播 `TOKEN_STATS_UPDATED` 事件到渲染端。

**消息大小上限**：`buckets` + `sessions` 合计不超过 10,000 条记录。超出时 warn 日志截断（保留最新的），避免 `process.send()` JSON 序列化阻塞事件循环。

## 5. 前端：独立窗口

### 5.1 入口

类似 settings 窗，独立窗口：

- 从托盘菜单打开（新增「Token 统计」菜单项）
- 从 PopupView 顶部按钮打开（新增图标按钮）
- 窗口配置：`WINDOW_CONFIGS` 新增 `tokenStats` 条目

### 5.2 窗口布局

```
┌──────────────────────────────────────────────────┐
│  Token 统计                              [─][□][×]│
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

### 5.3 KPI 卡片

| 卡片       | 计算                                              |
| ---------- | ------------------------------------------------- |
| 总 Token   | `SUM(input_tokens + output_tokens)` 跨所有 bucket |
| Session 数 | `COUNT(*)` from token_stats_sessions              |
| 主用模型   | 按`input_tokens + output_tokens` 降序第一         |
| 日均 Token | 总 Token / 天数                                   |

无费用卡片。

### 5.4 趋势图

- X 轴：日期（`bucket_date`）
- Y 轴：tokens（`input_tokens + output_tokens`）
- 系列：按模型拆分
- 类型切换：折线 / 柱状（本版不做日历方块）
- 数据源：`token_stats_buckets` 表，按筛选条件 GROUP BY

### 5.5 Session 列表

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

### 5.6 筛选

| 筛选     | 交互                             |
| -------- | -------------------------------- |
| 时间范围 | 近 7 天 / 近 30 天 / 本月 / 全部 |
| 环境     | Win / WSL / 全部（默认全部合并） |
| 模型     | 多选下拉，带搜索                 |

筛选变更 → KPI + 趋势图 + session 列表同步更新。

### 5.7 Win + WSL 合并

默认合并展示。环境筛选可拆分。

合并逻辑：`token_stats_buckets` 表中 `(source, env)` 不同的记录按 `bucket_date + model` 聚合 SUM。session 列表直接 UNION。

### 5.8 设置项

在 SettingsView 新增「Token 统计」section：

| 设置       | 默认值       | 说明                                            |
| ---------- | ------------ | ----------------------------------------------- |
| 采集间隔   | 10 分钟      | 下拉：5 / 10 / 30 / 60 分钟。改动后下次采集生效 |
| WSL 启用   | false        | 开关。开启后显示 distro / user 输入框           |
| WSL 发行版 | Ubuntu-22.04 | 文本输入                                        |
| WSL 用户名 | —            | 文本输入（启用 WSL 时必填）                     |

## 6. 涉及文件清单

| 文件                                             | 改动                                                | Task     |
| ------------------------------------------------ | --------------------------------------------------- | -------- |
| `scripts/token-stats-spike.ts`                   | 新建：Phase 0 验证脚本（一次性）                    | 0        |
| `src/shared/types/token-stats.ts`                | 新建：共享类型 + Zod schema                         | 1.1      |
| `src/main/core/token-stats/types.ts`             | 新建：模块内部类型                                  | 1.1      |
| `src/main/core/token-stats/token-stats-store.ts` | 新建：token*stats*\* 表建表 + 读写（复用 usage.db） | 1.2      |
| `src/main/core/token-stats/claude-reader.ts`     | 新建：costs.jsonl + session JSONL 解析              | 2.1, 2.2 |
| `src/main/core/token-stats/opencode-reader.ts`   | 新建：opencode.db 只读查询                          | 3.1      |
| `src/main/core/token-stats/aggregator.ts`        | 新建：按模型/天聚合                                 | 4.1      |
| `src/main/core/token-stats/collector.ts`         | 新建：子进程入口，定时采集循环                      | 4.2, 6.1 |
| `src/main/core/token-stats/manager.ts`           | 新建：主进程侧 fork / IPC / 写表                    | 4.3      |
| `src/main/index.ts`                              | 扩展：启动 token-stats manager                      | 4.3      |
| `src/shared/types/ipc.ts`                        | 扩展：TOKEN_STATS IPC channels                      | 5.1      |
| `src/main/ipc/token-stats-ipc.ts`                | 新建：渲染端 IPC handler                            | 5.1      |
| `src/preload/index.ts`                           | 扩展：暴露 tokenStats API                           | 5.1      |
| `src/main/window/window-manager.ts`              | 扩展：新增 tokenStats 窗口配置                      | 5.2      |
| `src/renderer/views/TokenStatsView.tsx`          | 新建：独立窗口主视图                                | 5.3      |
| `src/renderer/components/TokenStatsPanel/`       | 新建：KPI + 图 + 列表组件                           | 5.3–5.5  |

## 7. 明确不做（本版）

- **不做**费用统计（无 cost 卡片、无 cost 排序）
- **不做**日历方块图
- **不做**小时热力图
- **不做**小时粒度聚合（仅按天）
- **不做**Grok Build token 统计
- **不做**Session 对比 / 批量操作
- **不做**Session 详情（逐次调用时间线）
- **不做**导出 CSV / JSON
- **不做**Token 口径切换（计费 vs 含缓存）
- **不做**跨工具对比页
- **不做**实时流式监控
- **不做**文件 watcher

## 8. 成功标准

| #   | 标准                                                                            | 验证方式              |
| --- | ------------------------------------------------------------------------------- | --------------------- |
| 1   | Claude Code Win 端 costs.jsonl 正确解析，session 数与`jq` 手动统计一致          | 自动化测试 + 手工对比 |
| 2   | OpenCode Win 端 session 表正确读取，按模型聚合 token 数与`sqlite3` 手动查询一致 | 自动化测试            |
| 3   | WSL 数据通过 UNC 路径正确读取                                                   | 手工验证              |
| 4   | 子进程 10 分钟自动采集，主进程收到数据并写入 SQLite                             | 日志验证              |
| 5   | 趋势图按天展示 token 分布，系列按模型拆分                                       | 截图验证              |
| 6   | Session 列表可排序、可搜索                                                      | 手工验证              |
| 7   | 增量更新不重复计数（重启后从零重建，INSERT OR REPLACE 去重）                    | 自动化测试            |
| 8   | **源数据零修改**——采集前后 diff 源文件，内容不变                                | 自动化测试            |
| 9   | 子进程崩溃后主进程自动重启子进程，不丢数据                                      | 手工模拟              |
| 10  | 全量测试`pnpm test` 通过                                                        | CI                    |

## 9. 实施顺序

### Phase 0: Spike — 数据源可行性验证（必须先做，不可行则停止）

**目标**：用真实数据验证两个数据源的字段完整性、可用性、Win/WSL 路径可达性。**不可行则立即向用户报告**，不做后续 Phase。

**验证项**：

| #   | 验证                                 | 通过标准                                                                                              | 不可行时的报告内容                      |
| --- | ------------------------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------- |
| 0.1 | Win costs.jsonl 可读、JSONL 解析成功 | 至少 1 行含`session_id` + `model` + `input_tokens` + `output_tokens`                                  | 文件不存在 / 格式不符 / 字段缺失        |
| 0.2 | Win costs.jsonl session 聚合         | 按`session_id` 分组后，取最后一条，至少 1 个非 default session 含非零 token                           | 全部为 default/unknown 零值记录         |
| 0.3 | Win session JSONL 可读               | 至少 1 个`*.jsonl` 文件含 `type: "assistant"` + `message.usage` 记录                                  | 目录为空 / 格式不符 / 无 usage 字段     |
| 0.4 | Win opencode.db 只读打开             | `new Database(path, { readonly: true })` 成功，`SELECT COUNT(*) FROM session` 返回 > 0                | 文件不存在 / 版本不兼容 / 表结构不符    |
| 0.5 | Win opencode.db session 字段         | 查询`id, json_extract(model,'$.id'), tokens_input, tokens_output, title, time_created`，至少 1 行有效 | model JSON 结构不符预期 / tokens 全为 0 |
| 0.6 | WSL UNC 路径可达                     | `\\\\wsl.localhost\\Ubuntu-22.04\\home\\testuser\\.claude\\metrics\\costs.jsonl` 可 `fs.access`          | WSL 未运行 / UNC 路径不可达 / 权限不足  |
| 0.7 | WSL opencode.db 只读查询             | 同 0.4/0.5，路径为 UNC                                                                                | 同上                                    |
| 0.8 | Claude Code session JSONL 去重       | 按`(timestamp, input_tokens, output_tokens)` 去重后，数据量合理（非爆炸式重复）                       | 去重率 < 10%（说明字段组合不唯一）      |

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

### Phase 1–5（Phase 0 通过后执行）

每个 task 可独立 commit，前置依赖用 `→` 标注。

#### Phase 1: 数据层

| Task | Commit 前缀                                | 内容                                                                                                                                                                                 | 前置 |
| ---- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| 1.1  | `feat(token-stats): add shared types`      | `src/shared/types/token-stats.ts` — `TokenStatsBucket`、`TokenStatsSession`、`TokenStatsUpdate`、`IncrementalState`、`TokenStatsConfig` 接口 + Zod schema                            | —    |
| 1.2  | `feat(token-stats): add token stats store` | `src/main/core/token-stats/token-stats-store.ts` — 独立模块，复用 `usage.db` 路径，`CREATE TABLE IF NOT EXISTS` 建表 + `INSERT OR REPLACE` / 查询方法。不侵入 `observation-store.ts` | 1.1  |

#### Phase 2: Claude Code reader

| Task | Commit 前缀                                          | 内容                                                                                                                                            | 前置 |
| ---- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 2.1  | `feat(token-stats): add claude costs.jsonl reader`   | `src/main/core/token-stats/claude-reader.ts` — `read_costs_jsonl(path, offset)` 解析 + session 聚合 + 增量 offset 返回。单元测试：fixture JSONL | 1.1  |
| 2.2  | `feat(token-stats): add claude session jsonl reader` | `claude-reader.ts` 扩展 — `read_session_jsonls(dir, mtime_filter)` 遍历 + 解析 + 去重。单元测试                                                 | 2.1  |

#### Phase 3: OpenCode reader

| Task | Commit 前缀                                     | 内容                                                                                                                                      | 前置 |
| ---- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 3.1  | `feat(token-stats): add opencode sqlite reader` | `src/main/core/token-stats/opencode-reader.ts` — `read_sessions(db_path, max_updated)` 只读查询 + 模型提取。单元测试：内存 SQLite fixture | 1.1  |

#### Phase 4: 采集管道

| Task | Commit 前缀                                | 内容                                                                                                                                                                          | 前置     |
| ---- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 4.1  | `feat(token-stats): add aggregator`        | `src/main/core/token-stats/aggregator.ts` — 合并 Claude + OpenCode 读取结果，按 `(source, env, bucket_date, model)` 聚合。单元测试                                            | 2.1, 3.1 |
| 4.2  | `feat(token-stats): add collector process` | `src/main/core/token-stats/collector.ts` — `child_process.fork` 入口，`setInterval` 按配置间隔（默认 10 分钟）循环，调用 reader + aggregator，`process.send()` 结果。集成测试 | 4.1      |
| 4.3  | `feat(token-stats): add manager`           | `src/main/core/token-stats/manager.ts` — 主进程侧：fork、接收 IPC、写入 token-stats-store、广播事件。`index.ts` 启动 init。集成测试                                           | 1.2, 4.2 |

#### Phase 5: 前端

| Task | Commit 前缀                                 | 内容                                                                                              | 前置 |
| ---- | ------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---- |
| 5.1  | `feat(token-stats): add IPC and preload`    | `ipc.ts` 新增 `TOKEN_STATS_*` channels。`token-stats-ipc.ts` handler。`preload/index.ts` 暴露 API | 4.3  |
| 5.2  | `feat(token-stats): add token stats window` | `window-manager.ts` 新增 `tokenStats` 配置。托盘菜单新增入口。路由注册                            | 5.1  |
| 5.3  | `feat(token-stats): add KPI and chart view` | `TokenStatsView.tsx` — KPI 卡片条 + 趋势图（折线/柱状切换）                                       | 5.2  |
| 5.4  | `feat(token-stats): add session list`       | 扩展 `TokenStatsView.tsx` — session 表格（虚拟滚动、排序、搜索）                                  | 5.3  |
| 5.5  | `feat(token-stats): add filters`            | 扩展 `TokenStatsView.tsx` — 时间范围 / 环境 / 模型筛选栏，筛选联动                                | 5.4  |

#### Phase 6: WSL

| Task | Commit 前缀                                  | 内容                                                                                                                        | 前置 |
| ---- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---- |
| 6.1  | `feat(token-stats): add wsl path resolution` | `collector.ts` 扩展 — 从 config 读 `wsl_distro` + `wsl_user`，拼接 UNC 路径，合并 Win + WSL。配置 schema 新增字段。集成测试 | 4.2  |

#### 依赖总览

```
1.1 → 1.2 ──────────────────────→ 4.3 → 5.1 → 5.2 → 5.3 → 5.4 → 5.5
  ↓                                  ↑
  2.1 → 2.2 ─┐                    4.2 → 6.1
  3.1 ───────→ 4.1 ─┘
```

共 16 个 task，每个独立 commit。

## 10. 与参考文档的关系

| 文档                                    | 关系                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------ |
| `ai-cli-token-stats.md`                 | 数据形态与聚合能力依据（数据源格式、路径、字段、Win/WSL 差异）                             |
| `ai-cli-token-stats-frontend-design.md` | 前端功能与交互愿景（本版实现其子集：概览 + Session 列表，不做对比/日历方块/小时热力/费用） |
| **本文**                                | OmniUsage 集成方案：子进程架构、数据模型、前端窗口、实施范围                               |

## 11. 后续可扩展

- Grok Build token 统计（待本地数据可靠后）
- 日历方块图 + 小时热力图
- 小时粒度聚合
- Session 详情（逐次调用时间线）
- Session 对比 / 批量操作
- 导出 CSV / JSON
- Token 口径切换（计费 vs 含缓存）
- 跨工具对比页
- 手动刷新按钮
- 预算阈值与超支提醒

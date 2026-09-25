# AI CLI Token 统计机制：Claude Code / OpenCode / Grok Build

## 概览

|工具|存储格式|Win 路径|WSL 路径|
|---|---|---|---|
|Claude Code|JSONL|`~/.claude/metrics/costs.jsonl`|同（`/home/$USER/.claude/metrics/costs.jsonl`）|
|Claude Code|Session JSONL|`~/.claude/projects/{project}/{session_id}.jsonl`|同|
|OpenCode|SQLite|`~/.local/share/opencode/opencode.db`|同|
|Grok Build|JSON/JSONL|`~/.grok/sessions/<encoded-cwd>/<session-id>/`|同|

______________________________________________________________________

## 一、Claude Code

### 1.1 costs.jsonl — Session 级累积快照

每次 API 调用后追加一行，同 `session_id` 值递增：

```json
{
    "timestamp": "2026-07-03T22:57:12.103Z",
    "session_id": "a9cd483c-...",
    "transcript_path": "C:\\Users\\...\\xxx.jsonl",
    "model": "deepseek-v4-pro",
    "input_tokens": 2977090,
    "output_tokens": 1202057,
    "cache_write_tokens": 0,
    "cache_read_tokens": 287025472,
    "estimated_cost_usd": 113.069767
}
```

**字段完整性问题**：并非所有行都包含 `transcript_path`、`cache_write_tokens`、`cache_read_tokens`。实测中约 80% 的行只有基础字段（`timestamp/session_id/model/input_tokens/output_tokens/estimated_cost_usd`），完整字段通常出现在有对应 session JSONL 的记录里。

**`model` 字段**：通常是 provider 返回的真实模型名（如 `deepseek-v4-pro`、`gpt-5.4`、`mimo-v2.5-pro`），但也会遇到 `session_id="default"` 且 `model="unknown"` 的零值记录，这些记录所有 token 与 cost 均为 0，聚合时应过滤掉。

**`estimated_cost_usd` 字段**：实测 Win 端非 `default` session 的该字段均有非零值，可直接用于费用统计。

**粒度**：每个 session 有多条累积快照。取每个 `session_id` 的最后一条 = 该 session 最终用量。**时间粒度到秒**，可聚合到小时/天。

### 1.2 Session JSONL — 每次 API 调用的精确用量

`~/.claude/projects/{project}/{session_id}.jsonl` 中，`type: "assistant"` 的记录包含 `message.usage`：

```json
{
    "type": "assistant",
    "timestamp": "2026-07-12T21:55:53.334Z",
    "message": {
        "model": "gpt-5.6-sol",
        "usage": {
            "input_tokens": 10258,
            "output_tokens": 283,
            "cache_creation_input_tokens": 0,
            "cache_read_input_tokens": 55808
        }
    }
}
```

**注意**：同一次 API 调用可能产生多条相同 timestamp 的记录（streaming 重复快照），需按 `(timestamp, input_tokens, output_tokens)` 去重。

**粒度**：每次 API 调用一条，**精确到秒级**，天然支持小时聚合。

### 1.3 Win vs WSL 差异

|维度|Win|WSL|
|---|---|---|
|`costs.jsonl` 路径|`C:\Users\{USER}\.claude\metrics\costs.jsonl`|`/home/{USER}/.claude/metrics/costs.jsonl`|
|Session JSONL 路径|`C:\Users\{USER}\.claude\projects\{C--path}\{id}.jsonl`|`/home/{USER}/.claude/projects/{path}\{id}.jsonl`|
|格式|完全相同|完全相同|
|`model` 字段|真实模型名|真实模型名|
|`transcript_path`|Windows 绝对路径|Linux 绝对路径|

Win/WSL 的 `costs.jsonl` 是**独立的**——在 Win 下使用的 session 只出现在 Win 的文件中，WSL 同理。需要合并两个文件才能得到完整统计。

### 1.4 按模型/天/小时聚合

#### 从 costs.jsonl（session 级）

```bash
# 每个 session 最终用量（JSONL 需用 -s 读成数组，过滤 default 零值）
jq -s -c 'group_by(.session_id) | map(last) | map(select(.session_id != "default"))[]' ~/.claude/metrics/costs.jsonl

# 按模型汇总（过滤掉 default/unknown 零值记录）
jq -s '[group_by(.session_id) | map(last)
  | map(select(.session_id != "default"))
  | group_by(.model)[] |
  {model: .[0].model, sessions: length,
   input: (map(.input_tokens) | add),
   output: (map(.output_tokens) | add),
   cost: (map(.estimated_cost_usd) | add)}]' ~/.claude/metrics/costs.jsonl

# 按天汇总（过滤掉 default/unknown 零值记录）
jq -s '[group_by(.session_id) | map(last)
  | map(select(.session_id != "default"))
  | group_by(.timestamp[:10])[] |
  {date: .[0].timestamp[:10],
   tokens: (map(.input_tokens + .output_tokens) | add)}]' ~/.claude/metrics/costs.jsonl
```

#### 从 Session JSONL（每次调用级，支持小时聚合）

```bash
# 按小时按模型汇总（去重后）
jq -c 'select(.type=="assistant" and .message.usage!=null) |
  {h: .timestamp[:13], model: .message.model,
   in: .message.usage.input_tokens,
   out: .message.usage.output_tokens}' ~/.claude/projects/*/*.jsonl |
  jq -s 'unique_by([.h, .model, .in, .out])
    | group_by(.h) | map({hour: .[0].h,
      models: (group_by(.model) | map({model: .[0].model,
        input: (map(.in) | add), output: (map(.out) | add)}))})'
```

### 1.5 数据结构总结

```
~/.claude/
├── metrics/
│   └── costs.jsonl              ← session 级累积快照（Win 实测 2847 行；WSL 数据需独立读取）
├── history.jsonl                ← 用户输入历史（非 token 统计）
└── projects/
    └── {project-path}/
        ├── {session_id}.jsonl   ← 每次 API 调用的完整记录（含 message.usage）
        └── {session_id}/subagents/
```

______________________________________________________________________

## 二、OpenCode

### 2.1 SQLite 数据库

路径：`~/.local/share/opencode/opencode.db`

核心表：

#### session 表 — Session 级汇总

核心字段（实际 schema 还包含 `project_id`、`workspace_id`、`parent_id`、`slug`、`path`、`version`、`share_url`、`summary_*`、`metadata`、`revert`、`permission`、`agent`、`time_compacting`、`time_archived` 等）：

```sql
CREATE TABLE session (
  id TEXT PRIMARY KEY,            -- "ses_097c80..."
  model TEXT,                     -- JSON: {"id":"deepseek-v4-pro","providerID":"new_api","variant":"default"}
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  tokens_reasoning INTEGER DEFAULT 0,
  tokens_cache_read INTEGER DEFAULT 0,
  tokens_cache_write INTEGER DEFAULT 0,
  cost REAL DEFAULT 0,            -- 实测恒为 0，无法直接用于费用统计
  title TEXT,
  directory TEXT,
  time_created INTEGER NOT NULL,  -- Unix epoch ms
  time_updated INTEGER NOT NULL
  -- 还有更多字段 ...
);
```

**`cost` 字段**：schema 中有该字段，但实测 Win 端所有 session 的 `cost` 均为 `0.0`，OpenCode 未写入真实费用。需要按模型和 token 数量，外部维护 API 定价表自行计算。

**`model` 字段**：JSON 字符串，通常含 `id`、`providerID`，新版还可能出现 `variant`，需 `json_extract(model, '$.id')` 提取模型名。

**粒度**：每个 session 一行，`time_created` 精确到毫秒，天然支持天/小时聚合。

#### part 表 — 每步 API 调用的精确用量

核心字段（实际 schema 还包含 `time_updated` 及外键约束）：

```sql
CREATE TABLE part (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  time_created INTEGER NOT NULL,  -- Unix epoch ms
  time_updated INTEGER NOT NULL,
  data TEXT NOT NULL              -- JSON，step-finish 类型含 tokens
);
```

`data` 中 `type: "step-finish"` 的记录包含逐次 token 用量：

```json
{
    "type": "step-finish",
    "reason": "stop",
    "tokens": {
        "total": 17137,
        "input": 15088,
        "output": 769,
        "reasoning": 0,
        "cache": { "write": 0, "read": 1280 }
    },
    "cost": 0 // 实测恒为 0，无费用信息
}
```

**注意**：`tokens` 值为**累积值**（同 session 内递增），计算增量需取相邻两条的差值。`cost` 字段实测为 0，不可直接用于费用统计。

### 2.2 按模型/天/小时聚合

#### Session 级（session 表）

```sql
-- 按模型汇总（cost 字段实测为 0，如需费用需外部定价表计算）
SELECT json_extract(model, '$.id') AS model_id,
  COUNT(*) AS sessions,
  SUM(tokens_input) AS total_in,
  SUM(tokens_output) AS total_out,
  SUM(tokens_cache_read) AS cache_read,
  SUM(tokens_cache_write) AS cache_write
FROM session GROUP BY model_id ORDER BY total_in DESC;

-- 按天按模型汇总
SELECT date(time_created/1000, 'unixepoch') AS day,
  json_extract(model, '$.id') AS model_id,
  SUM(tokens_input) AS total_in,
  SUM(tokens_output) AS total_out
FROM session GROUP BY day, model_id ORDER BY day DESC;

-- 按小时按模型汇总
SELECT strftime('%Y-%m-%d %H:00', time_created/1000, 'unixepoch') AS hour,
  json_extract(model, '$.id') AS model_id,
  SUM(tokens_input) AS total_in,
  SUM(tokens_output) AS total_out
FROM session GROUP BY hour, model_id ORDER BY hour DESC;
```

#### Step 级（part 表，支持小时聚合）

```sql
-- 每步 token 增量（需 LAG 窗口函数）
SELECT session_id,
  datetime(time_created/1000, 'unixepoch') AS time,
  json_extract(data, '$.tokens.input') AS cum_input,
  json_extract(data, '$.tokens.output') AS cum_output,
  json_extract(data, '$.tokens.cache.read') AS cache_read
FROM part
WHERE data LIKE '%"tokens"%'
ORDER BY session_id, time_created;
```

### 2.3 Win vs WSL 差异

|维度|Win|WSL|
|---|---|---|
|DB 路径|`%USERPROFILE%\.local\share\opencode\opencode.db`|`~/.local/share/opencode/opencode.db`|
|格式|完全相同|完全相同|
|日志路径|`%USERPROFILE%\.local\share\opencode\log\`|`~/.local/share/opencode/log/`|
|数据量|2 sessions / 213 messages / 1252 parts|130 sessions（当前环境未验证）|

Win/WSL 的 `opencode.db` 是**独立的**，需分别读取或合并。

### 2.4 数据结构总结

```
~/.local/share/opencode/
├── opencode.db          ← SQLite（session/message/part 表）
├── opencode.db-shm      ← WAL 共享内存
├── opencode.db-wal      ← WAL 日志
├── log/
│   └── opencode.log     ← 运行日志
├── repos/               ← Git 仓库快照
└── snapshot/            ← 项目快照
```

______________________________________________________________________

## 三、Grok Build

### 3.1 Session 存储结构

```
~/.grok/sessions/<encoded-cwd>/<session-id>/
  summary.json            # 元数据：session ID、工作目录、时间戳、模型 ID、消息数
  summary.json.lock       # 锁文件
  updates.jsonl           # ACP 会话更新流（对话 + 工具调用）
  chat_history.jsonl      # 原始聊天消息
  events.jsonl            # 运行时事件日志（MCP 启动等）
  prompt_context.json     # prompt 上下文（含引用文件内容）
  system_prompt.txt       # system prompt 文本
  # 以下文件在实测 session 中未出现，可能为特定功能/版本才有：
  # signals.json          # token 用量 + turn 计数器（待确认）
  # plan.json             # TODO/任务列表状态
  # rewind_points.jsonl   # 文件快照（用于 /rewind）
  # feedback.jsonl        # 用户反馈
  # compaction_checkpoints/ # 压缩检查点
  # subagents/            # 子 agent 元数据
```

`<encoded-cwd>` 是工作目录的 URL 编码。超过 255 字节时用 slug + hash，原始路径记录在同目录的 `.cwd` 文件中（实测未出现，待验证）。

### 3.2 summary.json

包含字段（基于 WSL 实测）：

- `info.id` — session ID（文档常见误写为 `info.session_id`）
- `info.cwd` — 工作目录
- `session_summary` — 会话摘要（实测为空字符串）
- `created_at` / `updated_at` — 创建和最后更新时间戳（ISO 8601 字符串，含纳秒）
- `num_messages` / `num_chat_messages` — 更新消息和聊天消息计数
- `current_model_id` — 使用的模型（真实模型名，如 `grok-4.5`）
- `next_trace_turn` — trace turn 计数器
- `chat_format_version` — chat 格式版本
- `grok_home` — grok home 路径
- `agent_name` — session 使用的 agent 定义
- `sandbox_profile` — sandbox 配置
- `reasoning_effort` — reasoning effort 设置
- 部分 session 还有 `last_active_at`、`request_id`

**实测未出现**：`generated_title`、`parent_session_id`。

### 3.3 Token 用量存储位置（待确认）

实测 WSL session 目录中**不存在** `signals.json`，`updates.jsonl`、`events.jsonl`、`chat_history.jsonl`、`prompt_context.json` 中也未发现 `input_tokens` / `output_tokens` / `total_tokens` / `modelUsage` / `costUSD` 等字段。本地**无 token 用量，也无费用数据**。

可能情况：

- 这些 session 未产生实际 API 调用，因此无 token 记录；
- token 用量仅在 headless 模式（`--output-format json`）或特定配置下才输出/记录；
- 新版 Grok Build 将用量信息存到了其他位置。

文档原描述的 `signals.json` 与实际不符，需用真实含 token 的 session 或 headless 输出进一步验证。

### 3.4 Headless JSON 输出（每次调用级）

`grok -p "..." --output-format json` 的输出含精确 token 数据。**以下字段结构来自 Grok Build 相关文档/描述，尚未经当前环境实测验证**：

```json
{
    "sessionId": "abc123",
    "num_turns": 7,
    "usage": {
        "input_tokens": 7210,
        "cache_read_input_tokens": 41000,
        "output_tokens": 1893,
        "reasoning_tokens": 412,
        "total_tokens": 50103
    },
    "modelUsage": {
        "grok-4-1": {
            "inputTokens": 7210,
            "outputTokens": 1893,
            "cacheReadInputTokens": 41000,
            "modelCalls": 7,
            "costUSD": 0.01268905
        }
    },
    "total_cost_usd": 0.01268905,
    "total_cost_usd_ticks": 126890500
}
```

**Token 字段策略**：

- `usage.input_tokens` = **仅未缓存**的输入 token
- `cache_read_input_tokens` = 缓存命中
- `total_tokens` = input + cache_read + output
- `modelUsage` 按模型拆分，含 `modelCalls`（调用次数）和 `costUSD`
- 子 agent 的 token 单独出现在 `modelUsage` 的对应模型 key 下
- `total_cost_usd_ticks` = 整数精度费用（1 USD = 10^10 ticks），用于精确对账
- `cost_is_partial` = true 时，所有 cost 浮点数被省略（部分调用未报告费用）

**streaming-json 模式**下的 `end` 事件含相同字段。

### 3.5 相关命令

|命令|用途|
|---|---|
|`/session-info`|当前 session 详情（模型、context 用量、turn 数）|
|`/usage`|信用额度/计费|
|`/context`|上下文窗口用量分类明细|
|`grok sessions list`|列出当前目录的 session（SQLite FTS5 索引）|
|`grok sessions search "keyword"`|搜索 session 标题和内容|

**无 `/stats` 命令**（不同于 Claude Code）。无按模型/天的聚合视图。

### 3.6 Win vs WSL

格式相同。路径：Win = `C:\Users\{USER}\.grok\sessions\`，WSL = `~/.grok/sessions/`。

当前机器 Win 端 Grok Build v0.2.101 已安装但 auth 失败（`error sending request for url (https://auth.x.ai/.well-known/openid-configuration)`），无 session 数据。WSL 端（Ubuntu-22.04，用户 `testuser`）已安装 Grok Build v0.2.101，session 数据位于 `/home/testuser/.grok/sessions/`。

### 3.7 安全警告

Grok Build v0.2.93 被发现会将整个代码库（含 .env 密钥）静默上传到 `gs://grok-code-session-traces` GCS 存储桶，且关闭"改进模型"选项无法阻止上传。xAI 已通过服务端开关关闭默认上传行为，但使用时仍需注意数据安全。

### 3.8 数据结构总结

```
~/.grok/
├── bin/                   ← grok.exe, agent.exe
├── sessions/
│   ├── session_search.sqlite   ← FTS5 全文搜索索引
│   ├── prompt_history.jsonl    ← prompt 历史（待确认）
│   └── <encoded-cwd>/
│       └── <session-id>/
│           ├── summary.json        ← session 元数据（模型、时间戳）
│           ├── summary.json.lock   ← 锁文件
│           ├── updates.jsonl       ← 对话记录（ACP 事件）
│           ├── chat_history.jsonl  ← 原始聊天消息
│           ├── events.jsonl        ← 运行时事件日志
│           ├── prompt_context.json ← prompt 上下文
│           └── system_prompt.txt   ← system prompt
│           # 以下文件实测未出现，可能为特定功能/版本才有：
│           # ├── signals.json       ← token 用量 + turn 计数（待确认）
│           # ├── plan.json          ← TODO/任务列表状态
│           # ├── rewind_points.jsonl ← 文件快照
│           # ├── feedback.jsonl     ← 用户反馈
│           # └── compaction_checkpoints/
├── logs/
│   └── unified.jsonl      ← 运行日志
├── memtrace/              ← 内存追踪
├── skills/                ← 内置技能
├── config.toml            ← 配置
└── version.json           ← 版本信息
```

______________________________________________________________________

## 四、小时级聚合方案

### Claude Code

数据源：Session JSONL 的 `message.usage` + `timestamp`

```bash
# 遍历所有 session JSONL，提取每次调用的小时级 token（去重）
find ~/.claude/projects -name "*.jsonl" -exec \
  jq -c 'select(.type=="assistant" and .message.usage!=null) |
    {h: .timestamp[:13], model: .message.model,
     in: .message.usage.input_tokens,
     out: .message.usage.output_tokens}' {} \; |
  jq -s 'unique_by([.h, .model, .in, .out])
    | group_by([.h, .model]) | map({
      hour: .[0].h, model: .[0].model,
      input: (map(.in) | add), output: (map(.out) | add)})'
```

### OpenCode

数据源：`session` 表的 `time_created` + `tokens_*`

```sql
SELECT strftime('%Y-%m-%d %H:00', time_created/1000, 'unixepoch') AS hour,
  json_extract(model, '$.id') AS model,
  SUM(tokens_input) AS input,
  SUM(tokens_output) AS output,
  SUM(tokens_cache_read) AS cache_read
FROM session
GROUP BY hour, model ORDER BY hour DESC;
```

### Grok Build

数据源：`summary.json` 的 `created_at`/`updated_at` + `current_model_id`。实测 session 目录中未找到本地存储的 token 用量文件，`signals.json` 不存在，因此目前只能做 session 级的时间和模型分布统计，无法直接做 token 用量聚合。

```bash
# 遍历所有 session 的 summary.json，按小时按模型汇总（仅 session 分布）
find ~/.grok/sessions -name "summary.json" -exec \
  jq -c '{model: .current_model_id, created: .created_at, updated: .updated_at}' {} \; |
  jq -s 'group_by(.created[:13]) | map({
    hour: .[0].created[:13],
    models: (group_by(.model) | map({model: .[0].model, sessions: length}))})'
```

Headless JSON 输出（`--output-format json`）理论上含每次调用级 token 数据，但实际输出结构待验证；文档原描述的 `modelUsage` / `costUSD` / `total_cost_usd_ticks` / `cost_is_partial` 字段尚未经实测确认。

### 合并 Win + WSL

两个数据源各自独立，合并策略：

```bash
# Claude Code：合并两个 costs.jsonl（示例路径，按实际 WSL 发行版调整）
cat ~/.claude/metrics/costs.jsonl \
    /wsl.localhost/Ubuntu-22.04/home/$USER/.claude/metrics/costs.jsonl |
  jq -s 'map(select(.session_id != "default"))' > /tmp/claude_merged.json

# OpenCode：附加查询 WSL DB（示例路径，按实际 WSL 发行版调整）
sqlite3 /wsl.localhost/.../opencode.db "SELECT ... FROM session" \
  >> /tmp/opencode_merged.csv

# Grok Build：合并所有 summary.json（注意 Win/WSL 的 encoded-cwd 互相独立）
find ~/.grok/sessions -name "summary.json" -exec cat {} \; | jq -s '.'
```

______________________________________________________________________

## 五、Session 级统计

### Claude Code

- **costs.jsonl**：每个 `session_id` 的最终累积值（取最后一条）
- **Session JSONL**：完整的对话记录，含每条消息的 model、usage、timestamp
- `/stats` 命令直接展示：Sessions 数、Longest session、Active days、Most active day

### OpenCode

- **session 表**：每个 session 一行，含 model、tokens\_\*、time_created/time_updated；`cost` 字段实测为 0，不可直接用
- **session_input 表**：用户输入记录（`prompt`、`delivery`、`time_created`，实际还有 `admitted_seq`、`promoted_seq`）
- `time_updated - time_created` = session 持续时间

```sql
-- session 详情（cost 实测为 0，如需费用需外部定价表计算）
SELECT id,
  json_extract(model, '$.id') AS model,
  tokens_input, tokens_output, tokens_cache_read,
  datetime(time_created/1000, 'unixepoch') AS started,
  datetime(time_updated/1000, 'unixepoch') AS ended,
  (time_updated - time_created) / 1000 AS duration_sec
FROM session ORDER BY time_created DESC;
```

### Grok Build

- **summary.json**：每个 session 的元数据（模型、时间戳、消息数）
- **updates.jsonl**：完整对话记录（ACP 事件）
- **chat_history.jsonl**：原始聊天消息
- **events.jsonl**：运行时事件日志
- `/session-info` 命令查看当前 session 详情
- `grok sessions list` 列出当前目录的历史 session
- 无内置 `/stats` 聚合视图
- **本地 token 用量文件尚未确认**：实测未找到 `signals.json`，`updates.jsonl` / `events.jsonl` / `chat_history.jsonl` 中也无 `input_tokens` / `output_tokens` / `modelUsage` 等字段

```bash
# 列出所有 session 的模型和时间
find ~/.grok/sessions -name "summary.json" -exec \
  jq '{id: .info.id, model: .current_model_id,
       created: .created_at, updated: .updated_at,
       messages: .num_messages}' {} \;
```

______________________________________________________________________

## 六、外部工具

|工具|支持|用途|
|---|---|---|
|[ccusage](https://github.com/ryoppippi/ccusage)|Claude Code + OpenCode|读取本地数据生成日报/周报|
|[tokscale](https://github.com/junhoyeo/tokscale)|多工具|跨 Claude Code/OpenCode/Codex/Gemini 等|
|[opencode-tokenscope](https://github.com/ramtinJ95/opencode-tokenscope)|OpenCode|Token 分析和费用追踪|
|[opencode-stats](https://lib.rs/crates/opencode-stats)|OpenCode|终端仪表盘，类似 `/stats`|
|[AgentsView](https://github.com/kenn-io/agentsview)|多工具|本地 session 搜索 + token 统计|

______________________________________________________________________

## 七、与 OmniUsage 的关系

OmniUsage 的 `PluginChart` schema（`src/shared/schemas/plugin-output.ts`）已定义 `model + tokens` 按天分桶的数据结构，可直接消费上述数据源的聚合结果。

______________________________________________________________________

## 八、可采集数据汇总

### 8.1 三端数据对比

|Agent|平台|存储格式|最小粒度|Token 字段|时间字段|Cost 字段|主要限制|
|---|---|---|---|---|---|---|---|
|Claude Code|Win/WSL|JSONL|每次 API 调用|`input_tokens`, `output_tokens`, `cache_*_tokens`|ISO 8601 字符串|`estimated_cost_usd`（✅ 有真实值）|需过滤 `default`/`unknown` 零值记录；约 80% 行缺 cache 字段|
|OpenCode|Win/WSL|SQLite|每步调用（`part` 表）|`tokens_input`, `tokens_output`, `tokens_reasoning`, `tokens_cache_*`|Unix epoch ms|`cost`（❌ 实测恒为 0）|`part.data.tokens` 为累积值，需算增量；费用需外部定价表|
|Grok Build|Win/WSL|JSON/JSONL|Session 级元数据|**本地未找到**|ISO 8601 字符串|**本地未找到**|`signals.json` 不存在；token/cost 需 headless 输出验证或外部定价|

### 8.2 Cost 可用性

|Agent|本地费用数据|是否可用|替代方案|
|---|---|---|---|
|Claude Code|`estimated_cost_usd`|✅ 可用|直接用|
|OpenCode|`session.cost` / `part.data.cost`|❌ 恒为 0|按模型 token 数 × 外部 API 定价表|
|Grok Build|本地无|❌ 无|headless JSON 待验证；或按模型 token 数 × 外部 API 定价表|

### 8.3 可聚合维度

- **Claude Code**：session 级、调用级；按模型 / 天 / 小时聚合 token 和 cost。
- **OpenCode**：session 级、step 级；按模型 / 天 / 小时聚合 token（cost 需外部计算）。
- **Grok Build**：session 级；按模型 / 小时统计 session 分布（token/cost 本地不可聚合）。

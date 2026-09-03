# Spike report

## 问题

用量面板已有 codex connector（`connectors/codex/`，按 (model, day) 聚合），但**代理面板**（TokenStats：`AgentFilter` / collector / store agent 口径）与**会话面板**（session-history：`HistorySource` / locator / extractor / resume）均只有 claude_code / opencode / kimi_code / grok 四端。需实测回答：codex rollout JSONL 能否支撑两面板接入？字段路径、过滤规则、游标、缺口分别是什么？

## 成功判据

- 定位 codex 会话正文（user/assistant 文本）的确切字段路径与需过滤的行型。
- 定位 token 用量字段及其累计/差分语义，确认可按会话归因。
- 指明接入两面板需改的契约点（类型联合、路径层、resume 命令）。

## 尝试

真实本机数据采样（脚本在 `code/`，gitignore 外的 spike 产物；只读 `~/.codex`）：

- `code/sample_rollouts.py`：40 个文件 / 2154 行，envelope type、payload type、role、content type、session_meta / turn_context 键分布。
- `code/probe_details.py`：user/assistant 正文样例、token_count 全貌、user 信封标记统计、assistant 空文本统计。
- `code/probe_more.py`：同文件 token_count 累计性、单文件多 model、archived_sessions、`session_index.jsonl` / `history.jsonl` 作用、web_search_call、文件名与 session_id 关系。
- `code/probe_agent_panel.py`：按 (day) 差分汇总、会话行字段（session_id/cwd/首条 user）、input/output/reasoning 配比。
- 代码核查：`AgentFilter`（`src/renderer/lib/token-stats/types.ts:6`）、`HistorySource`（`session-locator.ts:110`）、`token-stats-store.ts:335` agent 口径、`session-resume.ts`、`paths.ts`、`codex --help` / `codex resume --help`。

## 证据

### 会话文件格式（rollout JSONL）

- 路径：`~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<session_id>.jsonl`；**文件名尾部 UUID 即 `session_meta.payload.session_id`**（实测一致）。无 `archived_sessions` 目录（manifest 声明的该路径当前不存在，按 missing 处理即可）。
- 每行信封 `{timestamp, ordinal, type, payload}`；**全部行自带 ISO `timestamp`**（2154 行零缺失），`ordinal` 单调递增——天然支持 byte_offset 增量游标 + `HistoryMessage.timestamp` 非空（优于 grok 无时间）。
- `type` 分布：`session_meta` / `event_msg` / `response_item` / `world_state` / `turn_context`。`payload.type` ∈ task_started / item_completed / token_count / task_complete / thread_settings_applied / turn_aborted（event_msg）；message / reasoning / function_call / function_call_output / web_search_call（response_item）。

### 会话面板：正文提取路径

- user/assistant 正文：`response_item.payload.type=="message"`，`payload.role` ∈ user/assistant，文本在 `payload.content[]`（`{type:"input_text"|"output_text", text}` 拼接）。实测 41 user / 201 assistant，assistant 无空文本。
- 过滤（剔除）：`role=="developer"`（系统提示）、`payload.type` ∈ reasoning（加密内容为主）/ function_call / function_call_output（790 条 role 缺失即此类）/ web_search_call；world_state / task_started 等非 response_item 全剔。
- user 信封：45 个 input_text 中 8 个含 `<environment_context>` / `<skills_instructions>` 大信封（本机 codex 会话由上层 agent 驱动注入），`<command-name>` 为 0。展示层需沿用 `normalize_user_display_text` 思路处理（类 kimi/grok 的 system-reminder 丢弃规则，t436 模式）。
- 首条 user 文本可用作会话标题（与四端 session 标题同源规则一致）；`session_meta` 提供 `cwd`（会话 directory 列）、`cli_version`、`model_provider`、`turn_context` 提供 `model`（单文件内实测单一 model，多 model 按 turn_context 切换分段）。
- 会话发现：按 `session_id` 扫 dated 目录 `rollout-*-<id>.jsonl`（MAX_DEPTH 下目录层 YYYY/MM/DD 在现有 locator 递归深度内需确认，或走 `session_index.jsonl` `{id, thread_name, updated_at}` 做索引加速——`thread_name` 可作标题回退）。

### 代理面板：用量归因

- 用量字段：`event_msg.payload.type=="token_count"`，`payload.info.total_token_usage{input_tokens, output_tokens, reasoning_output_tokens, total_tokens}` + `last_token_usage`。**同文件内单调累计**（8865→18719→30144），差分语义与现有 codex connector 一致（`prev_total` 差分）。
- 按会话归因可行：token_count 与 session_meta 同文件 → (source=codex, session_id, model, directory=cwd)。可写入 token-stats 明细（hour_start 按 `timestamp` 小时桶），接上现有 `agent` 列（store PK 含 agent，查询按 `agent = 'codex'` 过滤）。
- 配比参考（40 文件）：input 2236万 / output 12.7万 / reasoning 4.4万——input 占绝对主导（含大信封注入），代理面板展示时建议与四端同样只计 tokens 总量，cacheRate 对 codex 无数据（`cached_input_tokens` 全 0）→ 按 0 处理。
- 现有 codex connector 只做 (model, day) 聚合 observations，不落会话明细——代理面板要会话行/小时趋势，需走 token-stats reader（新增 `codex_jsonl` kind，对齐 claude_jsonl/kimi_jsonl/grok_jsonl），而非复用 connector observations。

### 接入改动点（代码核查）

- `AgentFilter`（token-stats/types.ts:6）+ `AGENT_OPTIONS`（TokenStatsView.tsx:31-37）+ store 335 行 agent 联合：加 `"codex"`。
- collector：新增 `codex_jsonl` kind + `codex_sessions_path`（paths.ts 仿 grok_sessions_path，`~/.codex/sessions`；env 现仅本机 linux/mac，无 wsl 双源问题）。
- session-history：`HistorySource` 加 `"codex"`；locator 加 codex 分支（dated 目录文件名匹配）；新增 `codex-extractor.ts`（全量 + byte_offset 增量 + first_user，与 claude extractor 同构）；subscription-service 三处 switch 加分支。
- resume：`codex resume {session_id}`（UUID 优先，实测 `--help` 确认）→ session-resume.ts 加 `codex: "codex resume {session_id}"`。
- 已就绪：`Icon.tsx` 已有 `codex` vendor logo（235 行 + svg 资源），用量面板侧零改动。

## 结论

两面板均可接入，无格式层 blocker：

- 会话面板：rollout JSONL 字段路径明确（message/input_text|output_text），有 timestamp + ordinal（增量游标可用 byte_offset；timestamp 非空优于 grok）。唯一注意是 user 大信封过滤（8/45 含环境注入）与 tools/reasoning 行剔除。
- 代理面板：token_count 累计语义确认（差分归因），可按会话落明细接现有 agent='codex' 查询链路；cacheRate 按 0。
- 可信度高（40 文件/2154 行真实数据 + CLI `--help` 实测）。限制：采样仅本机 linux 单 model_provider=cpa；`archived_sessions` 不存在；session_index.jsonl 仅 38 行样本，其作为标题/索引源为可选优化。

## 是否采纳

- 决定：是
- 理由：正文路径、用量语义、接入点全部实测确认，可直接拆 task。
- 后续 task：无（待 task-create 拆分：codex token-stats reader、codex session-history extractor+locator、AgentFilter/HistorySource/resume 接线）

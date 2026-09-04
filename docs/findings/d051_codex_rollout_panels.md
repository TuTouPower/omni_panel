# d051 codex rollout JSONL 正文与用量字段路径（2026-09-04）

- 来源：s034（40 文件 / 2154 行本机真实采样 + `codex resume --help` 实测）
- 结论：codex 会话正文在 `response_item.payload.type=="message"`（`role=user/assistant`，`content[]` 的 `input_text/output_text` 拼接）；用量在 `event_msg.payload.type=="token_count"` 的 `info.total_token_usage`（同文件单调累计，差分归因）；每行自带 ISO `timestamp` + 单调 `ordinal`；文件名尾部 UUID 即 `session_meta.payload.session_id`；resume 命令为 `codex resume {session_id}`。
- 证据：`docs/spikes/s034_codex_agent_session_panels/report.md` + `code/sample_rollouts.py`、`probe_details.py`、`probe_more.py`、`probe_agent_panel.py`；user 信封 8/45 含 `<environment_context>`/`<skills_instructions>` 需展示层过滤；`~/.codex/archived_sessions` 不存在。
- t448 就地修订（2026-09-04，116 文件本机重采样）：**`cached_input_tokens` 非全 0**——s034 采样误判，现 948/948 事件 cached 非零；OpenAI 语义 `input_tokens` 已含 `cached_input_tokens`，透传须归一（仿 claude-reader），否则面板 input+cache 双计。codex 会对**同 total 连续重复落盘** token_count（116 文件 75 相邻重复、零增量），差分时 delta<=0 须记 0，不可按全量计入（p214 1.3B 虚增根因）；`total_tokens` 全程单调（0 回绕），零增量处理不丢数。
- 影响：codex 接入代理面板（新增 `codex_jsonl` reader 落会话明细）与会话面板（新增 `codex-extractor.ts` + locator 分支 + `HistorySource`/`AgentFilter` 加 `"codex"` + resume 接线）的实现依据；`Icon.tsx` 的 codex logo 已就绪。
- 现状：有效（cached 全 0 部分作废，见 t448 修订）

# Spike report

## 问题

四端（claude_code / opencode / kimi_code / grok）会话 transcript 的正文消息字段路径与过滤规则，spec 未知契约（UNVERIFIED-SPIKE）需实测确认。

## 成功判据

- 每端能定位 user/assistant 文本的确切字段路径与事件/行型。
- 指明过滤规则（剔除 tool/reasoning/system 等）。

## 尝试

用真实本机/WSL 数据采样（脚本在 `.scratch/`，gitignore）：

- opencode：`~/.local/share/opencode/opencode.db`（SQLite）。
- kimi_code：`~/.kimi-code/sessions/<wd>/<sess>/agents/main/wire.jsonl`。
- grok：`//wsl.localhost/Ubuntu-22.04/home/testuser/.grok/sessions/<enc_cwd>/<sess>/chat_history.jsonl`（**非** updates.jsonl）。
- claude_code：`~/.claude/projects/<proj>/*.jsonl`（现有 reader 已解析，无需 SPIKE）。

## 证据

### opencode（SQLite）

- `message.data`（JSON）含 `role`（user/assistant）。
- `part.data`（JSON）`{type, text}`；type ∈ text/tool/reasoning/step-start/step-finish/patch/compaction。
- 取 `part.data.type === "text"` 的 `text`；role 从关联 `message.data.role`。
- 时间：`part.time_created`（ms）。assistant text part 含 `data.time.start/end`。

### kimi_code（wire.jsonl）

- 事件 `type` ∈ metadata/config.update/tools.set_active_tools/turn.prompt/context.append_message/context.append_loop_event/llm.request/usage.record/...
- 正文在 `context.append_message`：`message.role`（user/assistant）+ `message.content`（数组，`{type:"text",text}` + toolCalls）。
- 时间：事件顶层 `time`（ms）。`turn.prompt` 也有 user 输入（与 append_message 重复，取后者去重）。

### grok（chat_history.jsonl，WSL）

- **正文文件是 `chat_history.jsonl`，不是 `updates.jsonl`**。`updates.jsonl` 只存 `turn_completed` usage 元数据（现有 token-stats reader 用的它）。
- `chat_history.jsonl` 每行 `{type, content}`，type ∈ system/user/assistant/reasoning/tool_result。
- content 为字符串或 `[{type:"text",text}]`。
- 取 `type === "user" || type === "assistant"` 的 content（字符串直接取，数组取 text 段）。
- 过滤 system/reasoning/tool_result。
- **无顶层 timestamp**：按行序，时间不可得（仅有序）。
- 边界：实测 45 行中 9 行 parse_error（长行/截断），提取器须跳过非 JSON 行不报错。

### claude_code

- 现有 `~/.claude/projects/<proj>/<sess>.jsonl` reader 已解析消息，t209 复用其定位与解析，按决策 2 过滤（只留 user/assistant 文本，剔 tool_use/tool_result/system/thinking）。

## 结论

四端正文来源全部确认：

- opencode：SQLite message.role + part text。
- kimi_code：wire.jsonl 的 context.append_message。
- grok：**chat_history.jsonl**（非 updates.jsonl），无 timestamp。
- claude_code：现有 jsonl reader + 过滤。

可信度高（真实数据采样）。

## 是否采纳

- 决定：是
- 理由：四端字段路径全部实测确认，提取器可按此实现。
- 后续 task：t209

## 对 spec 的契约偏离

- spec 范围「按字节 offset（JSONL 端）或等价游标（opencode）的增量提取」：grok chat_history.jsonl 无 timestamp 但可按字节 offset 增量（与 claude_code 同）；opencode 按 part.id/max(rowid) 增量。
- spec AC 时间戳「顺序与时间戳正确」：grok 无 timestamp，AC 对 grok 应为「顺序正确」（时间戳用 null 或行序近似）。

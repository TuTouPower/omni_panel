# d017 四端会话 transcript 正文消息来源与字段路径（2026-08-05）

- 来源：s015（t209 SPIKE）
- 结论：四端（claude_code/opencode/kimi_code/grok）会话正文消息的字段路径（实测本机/WSL 真实数据）：
    - claude_code：`~/.claude/projects/<proj>/<sess>.jsonl`，复用现有 reader + 决策 2 过滤（留 user/assistant 文本，剔 tool_use/tool_result/system/thinking）。
    - opencode：`~/.local/share/opencode/opencode.db` SQLite，`message.data.role` + `part.data{type:"text",text}`（过滤 tool/reasoning/step-start/step-finish/patch/compaction）；时间 `part.time_created`。
    - kimi_code：`~/.kimi-code/sessions/<wd>/<sess>/agents/main/wire.jsonl`，`context.append_message.message.{role,content[type=text].text}` + 顶层 `time`；`turn.prompt` 与 append_message 重复 user 输入，取 append_message 去重。
    - grok：**正文在 `chat_history.jsonl`（WSL `~/.grok/sessions/<enc_cwd>/<sess>/`），不是 `updates.jsonl`**（后者只有 turn_completed usage 元数据，现有 token-stats reader 用它）。每行 `{type:"user|assistant|system|reasoning|tool_result", content}`（字符串或 `[{type:"text",text}]`），**无顶层 timestamp**（按行序）。
- 证据：s015 真实数据采样脚本（`.scratch/`，gitignore），opencode part.type 分布、kimi wire.jsonl 事件类型、grok chat_history.jsonl 45 行 9 parse_error 边界。
- 影响：t209 提取器按上述路径实现；grok 时间戳为 null（chat_history.jsonl 无时间字段），窗口按行序展示；grok 提取器须读 chat_history.jsonl 而非 updates.jsonl，与现有 token-stats reader（读 updates.jsonl）是两个独立文件。
- 现状：有效

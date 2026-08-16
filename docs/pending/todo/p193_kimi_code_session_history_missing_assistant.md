# p193 kimi_code 会话历史只见 user、不见 assistant 正文

- 现象：打开 kimi_code 会话历史，期望 user/assistant 交替展示；实际**只出现 user 气泡**，agent 回复正文缺失。复现（2026-08-16）：本机 `~/.kimi-code/sessions/wd_repo_template_*/session_2ef64974-.../agents/main/wire.jsonl` 中有 2 段 assistant 文本，但 `extract_kimi_code` 只产出 4 条 user、0 条 assistant。
- 影响：会话历史 / 订阅增量 / 依赖 kimi extractor 的正文展示（含 searchContent 扫到的 kimi 正文）在**当前 kimi-code 主 agent wire** 上系统性缺 assistant；token-stats 用量读 `usage.record`，不受本 bug 影响。
- 根因（产品缺陷）：
    1. `kimi-extractor.ts` 只消费 `type === "context.append_message"`，并从 `message.role` 取 user/assistant（s015 / d017 时期路径）。
    2. **当前 kimi-code 主 agent wire 格式已变**：`context.append_message` 几乎只写 `role=user`；assistant 正文写在 `context.append_loop_event` → `event.type === "content.part"` → `event.part.type === "text"` → `event.part.text`（顶层 `time` 仍可用）。
    3. 抽样 40 个近期 wire：38 个「append_message 仅 user + 有 content.part text」；仅 2 个子 agent wire 仍用 `append_message` role=assistant（旧/并行格式）。
    - 分类：产品缺陷（源格式漂移，提取器未跟）
    - 已确认同类位点（同一提取入口，须一并改）：
        - `src/main/core/session-history/kimi-extractor.ts`：`process_line` 过滤 `context.append_message` only
        - `extract_kimi_code` / `extract_kimi_code_incremental` / `extract_kimi_code_first_user`（后两者经同一 `process_line`/`event_to_message`；first_user 仍可只认 user，但 fixture 与真实格式应对齐）
    - 已扫、**同因不成立**（不并入修复范围）：
        - `kimi-reader.ts`（token-stats）：只从 append_message 取 **user 标题** + `usage.record` 计费，不负责会话正文；缺 assistant 正文不构成同类展示 bug。
        - claude/opencode/grok extractors：各自源格式不同，无 `append_loop_event` 路径。
    - 待确认（机制不同，**不默认算同类**）：`session-locator` resolve_kimi_code 对同 session 多 wire（main/agent-N）取**第一个**匹配文件；若序到非 main，可能看到不同消息集，与本「assistant 路径缺失」无关。
- 测试缺口：
    - fixture `tests/fixtures/session-history/kimi/wire.jsonl` 仍按旧格式写 `append_message` role=assistant，**单测绿但与生产 wire 脱节**。
    - 无用例覆盖 `context.append_loop_event` / `content.part type=text` → assistant；也无「真实形态：user-only append_message + content.part text」断言。
    - 补测方向：新增/改写 fixture 含 loop_event text part；断言 `extract_kimi_code` 产出 user + assistant；保留旧 append_message assistant 兼容；过滤 `part.type=think` 与 tool.call；增量追加 content.part 行仍能抽出 assistant。
- 线索：`.scratch/task_bug_kimi_agent_msgs/repro_notes.md`
- 处理：未开

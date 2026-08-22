# kimi_code 会话正文提取（双路径）

需求：`kimi-extractor` 从 wire.jsonl 提取会话历史 user/assistant 文本。当前 kimi-code 主 agent wire 格式漂移：`context.append_message` 几乎只写 user；assistant 正文写在 `context.append_loop_event → event.type=content.part → part.type=text`。提取器须双路径兼容（t425，来源 p193）。

## 提取契约

- `context.append_message.message.{role,content[type=text]}`（user/assistant，旧/子 agent 路径）→ 产出对应 role 消息；`turn.prompt` 与 append_message 重复 user 输入，取 append_message 去重。
- `context.append_loop_event.event.type=content.part` 且 `part.type=text` 且 text 非空 → 产出 role=assistant 消息（行序，一条 content.part 一条消息）。
- 顶层 `time`（ms epoch）为消息时间戳；缺失/非法为 null。
- id 为行字节 offset（`kimi:${offset}`），全量/增量一致。
- 过滤：`part.type=think`、tool.call/tool.result、step.begin/step.end、turn.prompt、非 JSON 行、空 text 不产生消息；assistant 不含 tool 载荷（决策 2）。user 正文再经 `normalize_user_display_text`：纯 `<system-reminder>`（interrupted / TodoList 等）不产出消息（t436）；`extract_kimi_code_first_user` 与 kimi-reader 标题同源跳过。
- 增量（`extract_kimi_code_incremental`）与全量对同一物理行产出相同 id；追加 content.part 行可抽出 assistant。

## 验收标准

- AC-001：新形态 wire（append_message user + content.part text）产出 user 与 assistant，assistant 文本等于各 `part.type=text` 非空 text（行序）。
- AC-002：旧形态（append_message role=assistant 含 text）仍产出 assistant（兼容不回归）。
- AC-003：think / tool.call / tool.result / step.begin / step.end / turn.prompt / 非 JSON / 空 text 不产生消息。
- AC-004：全量与增量对同一 content.part 物理行产出相同 id；追加后增量等于全量尾部且不重发。
- AC-005：`extract_kimi_code_first_user` 返回首条 user 文本，不把 content.part 当 user。

## 来源与约束

- 来源：p193（2026-08-16 本机 40 wire 抽样：38 主路径 user-only append_message + content.part text；2 子 agent 仍 append_message assistant）。
- 非范围：不改 session-locator 多 wire 选取、不展示 think/tool 正文、不改 UI。token-stats 用量计数不改；kimi-reader **标题**与会话历史共用 user 信封归一（t436），`usage.record` 路径不变。
- 风险：若未来 kimi 并存 append_message assistant 与 content.part 同一正文，双路径可能重复气泡；当前抽样无并存。
- 测试：`tests/unit/main/core/session-history/kimi-extractor.test.ts` + `tests/fixtures/session-history/kimi/`（`wire.jsonl` 旧路径、`wire-loop.jsonl` 新形态、`wire-envelopes.jsonl` reminder 过滤）。

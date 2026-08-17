# Task spec

## 背景

kimi_code 会话历史只显示 user 消息，agent 正文整段缺失。根因：`kimi-extractor` 仍只消费 `context.append_message`（s015/d017 旧路径）；当前 kimi-code 主 agent 的 `wire.jsonl` 中 assistant 正文写在 `context.append_loop_event` → `event.type=content.part` → `event.part.type=text`。旧 fixture 仍用 `append_message` role=assistant，单测假绿。

## 契约区

### 范围

- 更新 `src/main/core/session-history/kimi-extractor.ts`：在保留 `context.append_message`（user/assistant text）的同时，从 `context.append_loop_event` 的 `content.part`（`part.type === "text"` 且非空）产出 `role=assistant` 消息。
- 更新 kimi 会话 history fixture 与 `kimi-extractor` 单测，覆盖新路径、旧路径兼容、过滤与增量。
- 增量路径（`extract_kimi_code_incremental`）与全量对同一物理行产出稳定 id；追加 content.part 行可抽出 assistant。

### 非范围

- 不改 `kimi-reader.ts`（token-stats / `usage.record`）。
- 不改 claude / opencode / grok 提取器。
- 不改 `session-locator` 多 wire（main/agent-N）选取策略（p193 待确认项）。
- 不展示 `part.type=think`、tool.call/tool.result 等非 text 正文（决策 2）。
- 不改 UI 布局/样式。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。

<!-- /规范 -->

- [ ] AC-001：对「仅 `append_message` user + `append_loop_event` content.part text」形态的 wire，`extract_kimi_code` 产出 user 与 assistant 文本，assistant 文本等于各 `part.type=text` 的非空 `text`（行序）。
- [ ] AC-002：对旧形态「`append_message` 含 role=assistant 且 content 含 text」的 wire，仍产出对应 assistant 文本（兼容不回归）。
- [ ] AC-003：`part.type=think`、`tool.call` / `tool.result`、`step.begin` / `step.end`、`turn.prompt`、非 JSON 行不产生消息；assistant content 不含 tool 载荷字段。
- [ ] AC-004：全量与增量对同一 content.part 物理行产出相同 id；在已有 cursor 后追加一条 content.part text 行，增量结果等于全量尾部且不重发已提取消息。
- [ ] AC-005：`extract_kimi_code_first_user` 在新形态 wire 上仍返回首条 user 文本（不把 content.part 当 user）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试（`tests/unit/main/core/session-history/kimi-extractor.test.ts` + kimi fixture）。

## 上下文区

- 来源：p193（2026-08-16；本机 40 个 wire 抽样：38 个主路径仅 user append_message + content.part text；2 个子 agent 仍有 append_message assistant）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 真实 `~/.kimi-code` 磁盘 e2e：单测 fixture 已覆盖双路径与增量；人工 `[deploy]` 打开会话面板非本 task 门禁。
- 同一 turn 多条 content.part text 是否 UI 合并：提取层按事件各出一条 assistant（行序），展示合并属 UI 非范围。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- fixture：`tests/fixtures/session-history/kimi/`（可扩展新文件或改写 `wire.jsonl`，保留旧路径样例）。
- 断言：`messages[].role/text/timestamp/id`；增量 `toEqual` 全量尾部；think/tool 不入列。
- 不 mock 提取器内部；直接读写临时 wire 文件。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无（content.part 路径已由 p193 本机真实 wire 核实；修复时再以 fixture 固化）。

### 风险与回退

- 风险：若未来 kimi 同时写 append_message assistant 与 content.part 同一正文，双路径可能重复气泡；当前抽样主 agent 无此并存，子 agent 以 append_message 为主且 content.part 极少。
- 回退：还原 `kimi-extractor` 与 fixture/测试至修复前；会话历史回退为仅 user。

### 依赖与约束

- 决策 2：只留 user/assistant 文本，剔 tool/thinking。
- id 仍用行字节 offset（`kimi:${offset}`），与 t209/t365/t366 增量去重契约一致。
- finalization 时同步 `docs/findings/d017_transcript.md` / domain 中 kimi 正文路径描述（见下）。

### Finalization 时更新的 blueprint

- `docs/findings/d017_transcript.md`：kimi_code 正文路径补 `content.part` assistant；注明 append_message 现以 user 为主、assistant 兼容保留。
- `docs/blueprint/domain.md`：kimi_code 会话正文来源条目同步上述路径（若该条仍写 append_message only）。

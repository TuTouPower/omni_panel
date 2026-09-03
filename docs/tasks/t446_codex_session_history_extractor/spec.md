# Task spec

## 背景

会话面板（session-history）只有 claude_code / opencode / kimi_code / grok 四端：`HistorySource` 联合、locator 路径解析、extractor、subscription-service 三处 switch 均无 codex。s034 实测确认 rollout JSONL 正文路径（`response_item.message` + `input_text/output_text`）与过滤规则，可新增 `codex-extractor.ts` 对齐 claude extractor 形态（全量 + byte_offset 增量 + first_user）（来源 d051）。

## 契约区

### 范围

- `HistorySource` 接纳 `codex`；locator 新增 codex 分支：dated 目录（`~/.codex/sessions/YYYY/MM/DD/`）按文件名 `rollout-*-<session_id>.jsonl` 匹配。
- 新增 codex 提取器：全量提取、byte_offset 增量提取、首条 user 文本提取；`HistoryMessage.timestamp` 取行 `timestamp`（非空）。
- 过滤规则：只取 `payload.type=="message"` 且 `role` 为 user/assistant 的 `content` 文本；剔除 developer、reasoning / function_call / function_call_output / web_search_call、非 response_item 行；非 JSON 行跳过不报错。
- user 大信封（含 `<environment_context>` / `<skills_instructions>` 的 input_text）按 t436 模式在展示归一层处理，不当作用户气泡原文展示。
- subscription-service 全量/增量/first_user 三处 switch 接 codex 分支。

### 非范围

- 不做用量采集（归 t445）。
- 不做面板展示与 resume 接线（归 t447）。
- 不用 `session_index.jsonl` 做索引加速（可选优化，留后续）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `.repo_template/docs/usage.md`「命名与格式」。

<!-- /规范 -->

- [ ] AC-001：给定含 user/assistant message + reasoning/function_call 干扰行的 rollout fixture，全量提取只返回 user 与 assistant 文本消息（顺序与 fixture 行序一致），timestamp 全部非空。
- [ ] AC-002：同一 fixture 追加新 message 行后，byte_offset 增量提取只返回新增消息，不重返旧消息。
- [ ] AC-003：给定 fixture 的首条 user 文本，first_user 提取返回该文本（与全量首条 user 一致）。
- [ ] AC-004：locator 以 session_id 可解析到对应 dated 目录下的 rollout 文件；不存在的 session_id 返回未找到而非报错。
- [ ] AC-005：含 `<environment_context>` 大信封的 user 行经归一后不展示信封原文（断言归一输出不含该标记）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试（fixture 构造 rollout JSONL，提取器/locator/normalize 单元断言）。

## 上下文区

- 来源：d051（s034 实测：正文路径、过滤行型、timestamp+ordinal 游标、文件名-session_id 对应、user 信封 8/45；2026-09-04）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 按项目默认（session-history extractor/locator 测试基建，对齐 claude-code-extractor 测试形态）。
- fixture 来源：s034 采样形态手工精简；mock 边界为文件系统（fixture 目录），不碰真实 `~/.codex`。
- AC-005 断言目标为归一函数输出（复用 t436 的 normalize 路径，不断言窗口渲染）。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无（s034 已核实；新行型按提取器既有「跳过未知」原则处理）。

### 风险与回退

- 风险：codex rollout 格式漂移（如新增 payload type）——提取器对未知行型一律跳过（宁可漏不可错），与四端同约束。
- 回退：git revert。

### 依赖与约束

- 无前置 task；与 t445 无共享文件，可并行。
- 对会话源文件全程只读。

### Finalization 时更新的 blueprint

- `docs/blueprint/decisions.md`：无。

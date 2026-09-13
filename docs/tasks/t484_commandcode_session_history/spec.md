# Task spec

## 背景

会话历史面板（session-history）只有 claude_code / opencode / kimi_code / grok / codex / antigravity 六端，Command Code 未接入：`HistorySource` 联合、locator 路径解析、extractor、subscription-service 三处 switch 均无 commandcode。s037 实测确认 `~/.commandcode/projects/<encoded-cwd>/<session-id>.jsonl` 的正文路径与过滤规则：正文在 `message.content[]` 的 `text` 块（user/assistant），需过滤 assistant 的 `thinking`/`tool_use` 与 user 的 `tool_result`（`message.meta.source=="tool"`），时间戳取 message 顶层 ISO8601，无信封标签；恢复命令 `cmd --resume <session-id>`。可新增 `commandcode-extractor.ts` 对齐 codex extractor 形态接入两面板（来源 d059）。

## 契约区

### 范围

- `HistorySource` / `ExtractorKind` 接纳 `commandcode`；locator 新增 commandcode 分支：`~/.commandcode/projects/<encoded-cwd>/` 下按文件名 `<session_id>.jsonl` 匹配。
- 新增 commandcode 提取器：全量提取、增量提取、首条 user 文本提取；`HistoryMessage.timestamp` 取 message 顶层 ISO8601。
- 过滤规则：只取 `type=="message"` 且 `message.content[]` 的 `text` 块；user 需 `message.meta.source=="user"`（真人），剔除 `source=="tool"` 的 tool_result；assistant 剔除 `thinking`/`tool_use` 块；非 JSON 行跳过不报错。
- subscription-service 全量/增量/first_user/last_user 四处 switch 接 commandcode 分支。
- 两面板接线：代理面板 AgentFilter 下拉与展示名、dashboard agent 标签/色/图例、会话历史展示名/abbrev/vendor logo/accent、resume 命令模板（`cmd --resume {session_id}`）与设置页标题。
- 补 panels-wiring 型接线测试。

### 非范围

- 不做用量采集（归 t483）。
- 不做 Windows/WSL 路径——本批仅本机 `linux`/`mac`（用户 2026-09-14 决定）。
- 不消费 `.meta.json` title / `.checkpoints.jsonl` / `history.jsonl`（标题首屏可空，留后续优化）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `.repo_template/docs/usage.md`「命名与格式」。

<!-- /规范 -->

- [ ] AC-001：给定含 user/assistant text + thinking/tool_use/tool_result 干扰块的 commandcode fixture，全量提取只返回 user 与 assistant 文本消息（顺序与 fixture 行序一致），timestamp 全部非空。
- [ ] AC-002：同一 fixture 追加新 message 行后，增量提取只返回新增消息，不重返旧消息。
- [ ] AC-003：first_user / last_user 提取分别返回 fixture 首条与末条 user 文本（与全量一致）。
- [ ] AC-004：locator 以 session_id 可解析到 `~/.commandcode/projects/<encoded-cwd>/<session_id>.jsonl`；不存在的 session_id 返回未找到而非报错。
- [ ] AC-005：代理面板 agent 下拉接纳 `commandcode` 且请求以 `agent=commandcode` 过滤；dashboard 含 commandcode 标签/色，其余端数值不受影响。
- [ ] AC-006：会话历史展示名/abbrev/vendor logo/accent 对 commandcode 有独立映射（不落 fallback），resume 模板产出 `cmd --resume <sid>`。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试（fixture 构造 commandcode JSONL，走 extractor/locator/subscription 单元断言；AC-005/006 走 wiring 映射层断言，面板渲染行为由现有 view 测试形态覆盖）。

## 上下文区

- 来源：d059（s037 实测：正文块类型、user 的 `meta.source` 区分、时间戳顶层 ISO8601、过滤规则、恢复命令 `cmd --resume`；2026-09-14）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 面板实际渲染像素/交互：归 view 层既有测试与人工签收，本 task 只断言映射层（friendly/slug/accent/logo/resume/筛选），同 t447 先例。
- title 为空的首屏展示：归会话库既有空 title 处理，不另测。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 按项目默认（session-history extractor/locator 测试基建，对齐 `codex-extractor.test.ts` 形态）。
- fixture 来源：s037 采样形态手工精简；mock 边界为文件系统（fixture 目录），不碰真实 `~/.commandcode`。
- 接线测试克隆 `codex_panels_wiring.test.ts` 形态。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无（本机 mac/linux 的正文路径、过滤规则与恢复命令已由 s037/d059 实测核实；`cmd` 新增 content block 类型按提取器既有「跳过未知行型」原则处理，不属未知项）。

### 风险与回退

- 风险：`meta.source` 区分漏判导致工具回填内容混入用户气泡——按 t436 normalize 路径 + 显式过滤，测试覆盖 AC-001。
- 风险：增量游标跨字节边界半行——对齐 codex extractor 的半行容忍策略。
- 回退：git revert。

### 依赖与约束

- 与 t483 共用类型枚举/collector 注册点，建议 t483 先实施以固定 source/agent 枚举；无硬依赖可并行开发。
- 对会话源文件全程只读。

### Finalization 时更新的 blueprint

- `docs/blueprint/decisions.md`：无。

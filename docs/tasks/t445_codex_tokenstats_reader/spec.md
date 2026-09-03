# Task spec

## 背景

用量面板已有 codex connector（`connectors/codex/`，按 (model, day) 聚合 observations），但代理面板（TokenStats）只采集 claude_code / opencode / kimi_code / grok 四端：collector 无 `codex_jsonl` kind，`paths.ts` 无 `~/.codex/sessions` 解析，store agent 口径无 codex。s034 实测确认 rollout JSONL 的 `event_msg.token_count.info.total_token_usage` 同文件单调累计、可差分归因到会话，可落会话明细接入现有查询链路（来源 d051）。

## 契约区

### 范围

- `paths.ts` 新增 `codex_sessions_path`（`~/.codex/sessions` 本机解析；`archived_sessions` 不存在按 missing 处理）。
- collector 新增 `codex_jsonl` kind：扫描 dated 目录 `rollout-*.jsonl`，按 `token_count` 累计差分归因到 (session_id, model, directory=cwd, hour_start=`timestamp` 小时桶），写入 token-stats 明细。
- store agent 口径接纳 `codex`（查询 `agent='codex'` 可过滤；dashboard agent_totals 含 codex）。
- 无 `token_count` 的文件跳过；`cached_input_tokens` 全 0 的场景 cacheRate 按 0 计。
- 不动用量面板 codex connector（observations 聚合保持现状）。

### 非范围

- 不做会话正文提取（归 t446）。
- 不做 AgentFilter 下拉 / 面板展示接线（归 t447）。
- 不做 WSL 双源（codex 数据仅本机 `~/.codex`，无 wsl 对侧）。

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

- [ ] AC-001：给定含 session_meta（cwd）+ turn_context（model）+ 递增 token_count 的 rollout fixture，采集后按 `agent='codex'` 查询返回该 session，其 tokens 等于各 token_count 差分之和，model 与 directory 与 fixture 一致。
- [ ] AC-002：token_count 跨小时的 fixture，其 tokens 按 `timestamp` 小时桶拆分到对应 hour_start 行，而非全部落在一行。
- [ ] AC-003：无 token_count 行的 rollout 文件被跳过，不产生明细行也不报错；`archived_sessions` 路径缺失时采集轮不报错。
- [ ] AC-004：dashboard agent_totals 含 codex 项且数值等于 AC-001 口径的汇总；其余四端数值不受影响。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试（fixture 构造 rollout JSONL，走 collector/store 单元路径断言）。

## 上下文区

- 来源：d051（s034 实测：token_count 累计语义、session_id=cwd/model 归因字段、archived 缺失；2026-09-04）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 超大文件截断分支（connector 侧 MAX_FILE_CHARS 属用量面板逻辑，本 task reader 按 collector 现有大文件策略走，不另测）。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 按项目默认（token-stats collector/store 测试基建）。
- fixture 来源：s034 采样形态手工精简（session_meta + turn_context + 3 个递增 token_count + 少量 response_item 干扰行），断言差分和/model/directory/hour_start。
- mock 边界：文件系统（fixture 目录）+ paths 输入注入；不碰真实 `~/.codex`。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无（s034 已核实字段路径与累计语义；采样限本机 linux + model_provider=cpa，多 provider 形态出现时按新行型跳过原则处理，不属本 task 未知项）。

### 风险与回退

- 风险：同文件出现 model 切换（多 turn_context 不同 model）时差分归因错位——按 turn_context 分段归因，测试覆盖双 model fixture。
- 回退：git revert；codex 明细行可按 source 删除重采。

### 依赖与约束

- 无前置 task；与 t446（正文提取）无共享文件，可并行。
- 只读 `~/.codex`，不写业务文件。

### Finalization 时更新的 blueprint

- `docs/blueprint/decisions.md`：无。

# Task spec

## 背景

代理面板（TokenStats）当前只采集 claude_code / opencode / kimi_code / grok / codex 五端。s037 只读探针（`docs/spikes/s037_commandcode_token_session_source/code/probe_commandcode.py`）在本机采样到 Command Code CLI（`cmd`）会话落盘于 `~/.commandcode/projects/<encoded-cwd>/<session-id>.jsonl`：文件首行 `type:"session"`，此后每行 `type:"message"`，assistant 行顶层带 `usage{inputTokens,outputTokens,cacheReadTokens,cacheWriteTokens,costUsd}`、`model`、`effort`；202 会话文件名与 session id 全量一致。

**token 语义（2026-09-14 复核修正 d059/s037 原结论）**：`usage` 是**每轮单次请求用量（非累计）**。判据：逐行 `outputTokens` 在 193/202 会话出现回落、`costUsd` 在 199/202 会话回落——累计量不可能下降；`inputTokens` 虽在 198/202 会话递增，但增长的是**每轮上下文窗口大小**（prompt 规模），不是会话累计消耗。因此 reader 按**每轮 usage 直接相加**归因，**不做累计差分**。原 d059「累计差分（fresh≈31.7M）」结论错误，已修正；`inputTokens` 4 次 ≤10% 的小幅回落按每轮原值计入，不归零、不设分段基准。`cacheReadTokens` 恒为 `inputTokens` 子集（202/202），`fresh=inputTokens-cacheReadTokens` 仅用于缓存率展示，不改变每轮相加的归因方式；`cacheWriteTokens` 实测恒 0。

## 契约区

### 范围

- `paths.ts` 新增 `commandcode_projects_path`（`~/.commandcode/projects` 本机解析）。
- collector 新增 `commandcode_jsonl` kind：扫描 `<project>/*.jsonl`（跳过 `.checkpoints.jsonl`），按 assistant 行每轮 `usage` 归因到 (session_id, model, directory, hour_start=`message.timestamp` 小时桶），写入 token-stats 明细。
- reader 按**每轮 usage 直接相加**归因（不做累计差分）：`input` 归一 `inp-cacheRead` 用于缓存率，`output` 每轮相加，`cacheWrite` 随字段，`costUsd` 每轮相加；逐轮数值落对应小时桶。
- store / 类型 / 渲染层代理面板接纳 `commandcode`（查询 `agent='commandcode'` 可过滤；dashboard agent_totals 含 commandcode；AgentFilter 下拉选项与展示名接线）。**公共类型/枚举与筛选接线由 t484 负责（两 task 共用注册点），本 task 只负责 reader/collector/口径与 store 采集侧**，避免重复。
- session_id 取文件首行 `session` 记录的 `id`（采样观察 == 文件名，实现期断言），directory 取 `cwd`，title 从同目录 `<session-id>.meta.json` 的 `title` 读取（缺失按 null）。
- 不做会话正文提取、locator、resume 命令（归 t484）。

### 非范围

- 不做会话历史提取与两面板接线（归 t484）。
- 不做 Windows/WSL 路径（`win`/`wsl` env）——本批仅本机 `linux`/`mac`（用户 2026-09-14 决定）。
- 不做 `.checkpoints.jsonl` / `history.jsonl` / `.meta.json` 除 title 外的信息消费。
- 不动用量面板（`~/.commandcode` 无用量面板 connector 需求）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：给定含 session 首行（id/cwd）+ 多条 assistant `usage` 的 commandcode fixture，采集后按 `agent='commandcode'` 查询返回该 session，model 与 directory 与 fixture 一致；tokens 数值等于**各轮 usage 的逐轮相加之和**（每轮独立计费，非累计差分）。
- [ ] AC-002：`outputTokens`/`costUsd` 在相邻轮出现回落的 fixture，按每轮原值直接计入，总和不因回落而减少或归零（体现「每轮值」语义）；`inputTokens` 小幅回落（≤上下文缩减）同样按原值计入，不产生负增量。
- [ ] AC-003：`usage` 跨小时的 fixture，其 tokens 按 `message.timestamp` 小时桶拆分到对应 hour_start 行，而非全部落在一行。
- [ ] AC-004：无 `usage` 的 message 行 / 非 assistant 行不产生明细；`.checkpoints.jsonl` 与 `.meta.json` 不被当作会话文件采入。
- [ ] AC-005：`fresh` 缓存率口径为 `inputTokens - cacheReadTokens`（fixture 给 `cacheReadTokens > 0` 时断言缓存命中被扣除，不双计）；该项只影响缓存展示，不影响 tokens 归因（每轮 input 仍按归一值计入）。
- [ ] AC-006：dashboard agent_totals 含 commandcode 项且数值等于 AC-001 口径汇总；其余五端数值不受影响。
- [ ] AC-007：口径由可复现证据固定：`docs/findings/d059` 记录的复核（`outputTokens` 193/202、`costUsd` 199/202 会话回落 ⇒ 每轮值；`inputTokens` 增长为上下文窗口）作为依据；`cmd` 版本升级或字段语义变化时须重新复核并更新 d059。
- [ ] AC-008：幂等/增量/重启行为可验证：同一 fixture 重复扫描不重复计数；追加消息后增量扫描只归因新增部分；采集进程重启后从 scan-state 续扫，结果与不重启单次全量扫描一致。
- [ ] AC-009：回落数值验证：对含 `outputTokens`/`costUsd` 回落的 fixture，其会话汇总与逐小时行给出确定的、可复算的期望值（等于逐轮相加，不出现负值），并与 d059 的每轮语义一致。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试（fixture 构造 commandcode JSONL，走 reader/collector/store 单元路径断言）。
- AC-007 的复核证据已由 d059（2026-09-14）给出（`outputTokens`/`costUsd` 会话回落计数），实施期只需按该口径实现；`cmd` 升级重核属后续维护。

## 上下文区

- 来源：d059（s037 采样 + 2026-09-14 复核修正：单文件双用、文件名==id、时间戳/模型字段、**每轮用量语义**、`.checkpoints.jsonl` 与 `.meta.json` 旁证）。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- `win`/`wsl` env 分支：本批不做（用户决定），collector 侧按既有 `platform_source_defs` 仅注册本机 env，不写路径测试。
- `.meta.json` title 读取失败/文件缺失：按 title=null 处理，不单测边界 IO。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 按项目默认（token-stats reader/collector/store 测试基建，对齐 `codex-reader.test.ts` 形态）。
- fixture 来源：按 d059 每轮用量语义手工构造（每轮独立 usage，包含相邻轮回落用例）；断言逐轮相加口径、model/directory/hour_start、缓存率归一、幂等/增量/重启。
- mock 边界：文件系统（fixture 目录）+ paths 输入注入；不碰真实 `~/.commandcode`。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无（`usage` 每轮语义已由 2026-09-14 复核证据确立，见 d059 与 AC-007；`~/.commandcode` Windows/WSL 形态明确不在本批范围；`cmd` 新增字段按「未知行型跳过」处理）。
- 残留未定项（不阻塞本 task 口径）：`inputTokens` 4 次 ≤10% 回落的归因（上下文裁剪 vs 计数重排）——按每轮原值计入即可，不影响归因正确性，记为 d059 遗留。

### 风险与回退

- 风险：口径假设错误致 tokens 虚高/虚低或负增量。回退：按 d059 每轮相加口径实现，回落按原值计入（测试覆盖 AC-002/AC-009）；若 `cmd` 版本升级致语义变化，重核 d059 后再调整。
- 风险：`cacheWriteTokens` 恒 0 致写缓存指标缺失——不影响 token 总数，如实落 0。
- 回退：git revert；commandcode 明细行可按 source 删除重采（reader 幂等 upsert）。

### 依赖与约束

- 无前置 task；与 t484 共用类型枚举/collector 注册点，**公共类型/筛选接线归 t484**，建议 t483 先实施以固定 source/agent 枚举与口径。
- 只读 `~/.commandcode`，不写业务文件。
- 口径以 d059（2026-09-14 复核）为准。

### Finalization 时更新的 blueprint

- `docs/blueprint/decisions.md`：commandcode token 口径（每轮用量直接相加，非累计差分）——与 d059 复核一致。

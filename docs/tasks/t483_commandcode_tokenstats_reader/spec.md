# Task spec

## 背景

代理面板（TokenStats）当前只采集 claude_code / opencode / kimi_code / grok / codex 五端。s037 实测确认 Command Code CLI（`cmd`）会话落盘在 `~/.commandcode/projects/<encoded-cwd>/<session-id>.jsonl`，单文件同时承载会话正文与 token 用量：文件首行 `type:"session"`，此后每行 `type:"message"`，assistant 行顶层带 `usage{inputTokens,outputTokens,cacheReadTokens,cacheWriteTokens,costUsd}`、`model`、`effort`。`usage` 是**累计值**（逐行 `inputTokens` 单调递增，`cacheReadTokens` 是其中的缓存命中子集，`cacheWriteTokens` 实测恒 0），口径同 codex-reader 的累计差分（`fresh = inputTokens - cacheReadTokens`）。据此可新增 `commandcode_jsonl` kind 接入现有查询链路（来源 d059）。

## 契约区

### 范围

- `paths.ts` 新增 `commandcode_projects_path`（`~/.commandcode/projects` 本机解析）。
- collector 新增 `commandcode_jsonl` kind：扫描 `<project>/*.jsonl`（跳过 `.checkpoints.jsonl`），按 assistant 行 `usage` 累计差分归因到 (session_id, model, directory, hour_start=`message.timestamp` 小时桶），写入 token-stats 明细。
- reader 支持累计差分与回落处理（`delta <= 0` 视为零增量，按文件内分段基准），`fresh = inputTokens - cacheReadTokens`；`cacheWriteTokens` 随字段（实测恒 0）。
- store / 类型 / 渲染层代理面板接纳 `commandcode`（查询 `agent='commandcode'` 可过滤；dashboard agent_totals 含 commandcode；AgentFilter 下拉选项与展示名接线）。
- session_id 取文件首行 `session` 记录的 `id`（实测 == 文件名），directory 取 `cwd`，title 从同目录 `<session-id>.meta.json` 的 `title` 读取（缺失按 null）。
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

<!-- 规范（门禁必留，不得删除） -->

每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `.repo_template/docs/usage.md`「命名与格式」。

<!-- /规范 -->

- [ ] AC-001：给定含 session 首行（id/cwd）+ 多条 assistant 递增 `usage` 的 commandcode fixture，采集后按 `agent='commandcode'` 查询返回该 session，其 tokens 等于各轮差分之和（非累计值直接相加），model 与 directory 与 fixture 一致。
- [ ] AC-002：`inputTokens` 出现回落的 fixture（模拟同文件基准重排），回落处的增量按零计，不产生负增量也不污染后续差分。
- [ ] AC-003：`usage` 跨小时的 fixture，其 tokens 按 `message.timestamp` 小时桶拆分到对应 hour_start 行，而非全部落在一行。
- [ ] AC-004：无 `usage` 的 message 行 / 非 assistant 行不产生明细；`.checkpoints.jsonl` 与 `.meta.json` 不被当作会话文件采入。
- [ ] AC-005：`fresh` 口径为 `inputTokens - cacheReadTokens`（fixture 给 `cacheReadTokens > 0` 时断言 tokens 扣减缓存命中）。
- [ ] AC-006：dashboard agent_totals 含 commandcode 项且数值等于 AC-001 口径汇总；其余五端数值不受影响。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试（fixture 构造 commandcode JSONL，走 reader/collector/store 单元路径断言）。

## 上下文区

- 来源：d059（s037 实测：单文件双用、累计差分语义、ID/时间戳/模型字段、`.checkpoints.jsonl` 与 `.meta.json` 旁证；2026-09-14）

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
- fixture 来源：s037 采样形态手工精简（`session` 首行 + 3~4 条递增 `usage` + 干扰 message 行），断言差分和/model/directory/hour_start/cache 扣减。
- mock 边界：文件系统（fixture 目录）+ paths 输入注入；不碰真实 `~/.commandcode`。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无（本机 mac/linux 的路径、字段与累计语义已由 s037/d059 实测核实；`cmd` 新增字段按 reader 既有「未知行型跳过」原则处理，不属未知项）。

### 风险与回退

- 风险：累计回落（实测全库 4 次/0.05%）处理不当致口径虚高或负增量——按文件内分段基准 + `delta<=0` 归零，测试覆盖 AC-002。
- 风险：`cacheWriteTokens` 恒 0 导致写缓存指标缺失——不影响 token 总数，如实落 0。
- 回退：git revert；commandcode 明细行可按 source 删除重采（reader 幂等 upsert）。

### 依赖与约束

- 无前置 task；与 t484 无共享 reader 文件（共用类型/collector 注册点，建议 t483 先实施以固定 source/agent 枚举）。
- 只读 `~/.commandcode`，不写业务文件。

### Finalization 时更新的 blueprint

- `docs/blueprint/decisions.md`：无（累计差分已同 codex 先例，不构成新决策）。

# Task spec

## 背景

代理面板（TokenStats）当前只采集 claude_code / opencode / kimi_code / grok / codex 五端。s037 只读探针（`docs/spikes/s037_commandcode_token_session_source/code/probe_commandcode.py`）在本机采样到 Command Code CLI（`cmd`）会话落盘于 `~/.commandcode/projects/<encoded-cwd>/<session-id>.jsonl`：文件首行 `type:"session"`，此后每行 `type:"message"`，assistant 行顶层带 `usage{inputTokens,outputTokens,cacheReadTokens,cacheWriteTokens,costUsd}`、`model`、`effort`；202 会话文件名与 session id 全量一致。

**证据边界（必须诚实保留）**：现有 s037 探针只统计了 `inputTokens` 的首末值与递增性，**不能证明** `outputTokens`/`cacheReadTokens`/`costUsd` 也是累计值，也**不能排除**「逐行增长其实是 context 窗口增长、而各字段本身是每轮增量」的替代解释。因此本 task 不把「usage 是累计值」「`fresh = inputTokens - cacheReadTokens`」当作已核实事实写入 AC；它们属待验证项（见「未知契约清单」）。在受控实验/实现证据确立前，**不得固定任何数值口径、不得据假设写死归一化顺序**。

## 契约区

### 范围

- `paths.ts` 新增 `commandcode_projects_path`（`~/.commandcode/projects` 本机解析）。
- collector 新增 `commandcode_jsonl` kind：扫描 `<project>/*.jsonl`（跳过 `.checkpoints.jsonl`），按 assistant 行 `usage` 归因到 (session_id, model, directory, hour_start=`message.timestamp` 小时桶），写入 token-stats 明细。
- reader 支持**待定口径**的差分/归一化：口径经「未知契约清单」的受控实验确立后再固定；实现须把口径写成显式、可测的纯函数/常量，便于据实验结论替换。
- store / 类型 / 渲染层代理面板接纳 `commandcode`（查询 `agent='commandcode'` 可过滤；dashboard agent_totals 含 commandcode；AgentFilter 下拉选项与展示名接线）。**公共类型/枚举与筛选接线由 t484 负责（两 task 共用注册点），本 task 只负责 reader/collector/口径与 store 采集侧**，避免重复。
- session_id 取文件首行 `session` 记录的 `id`（采样观察 == 文件名，待实现期断言），directory 取 `cwd`，title 从同目录 `<session-id>.meta.json` 的 `title` 读取（缺失按 null）。
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

- [ ] AC-001：给定含 session 首行（id/cwd）+ 多条 assistant `usage` 的 commandcode fixture，采集后按 `agent='commandcode'` 查询返回该 session，model 与 directory 与 fixture 一致；tokens 数值严格等于该 task 已确立口径（见 AC-007）下的逐轮归因之和，而非对原始字段直接求和。
- [ ] AC-002：`inputTokens` 出现回落的 fixture（模拟同文件基准重排），回落处的增量按零计，不产生负增量也不污染后续差分；回落行为有专门用例。
- [ ] AC-003：`usage` 跨小时的 fixture，其 tokens 按 `message.timestamp` 小时桶拆分到对应 hour_start 行，而非全部落在一行。
- [ ] AC-004：无 `usage` 的 message 行 / 非 assistant 行不产生明细；`.checkpoints.jsonl` 与 `.meta.json` 不被当作会话文件采入。
- [ ] AC-005：`fresh` 口径为 `inputTokens - cacheReadTokens`（fixture 给 `cacheReadTokens > 0` 时断言 tokens 扣减缓存命中）——**仅当 AC-007 的受控实验确认 `cacheReadTokens` 为 `inputTokens` 子集且两者同口径时**该口径成立；实验否定时本 AC 改为实验结论口径。
- [ ] AC-006：dashboard agent_totals 含 commandcode 项且数值等于 AC-001 口径汇总；其余五端数值不受影响。
- [ ] AC-007：受控实验/实现证据先于数值口径固定：在 `docs/spikes/` 以可复现脚本确立 commandcode `usage` 各字段（input/output/cacheRead/cacheWrite/cost）的语义（累计 vs 每轮增量）、字段包含关系（cacheRead 是否为 input 子集）与是否可用 context 增长解释逐行增长；实验结论回填本 spec 后再固定 reader 口径与 AC-001/AC-005 的期望值。
- [ ] AC-008：幂等/增量/重启行为可验证：同一 fixture 重复扫描不重复计数；追加消息后增量扫描只归因新增部分；采集进程重启后从 scan-state 续扫，结果与不重启单次全量扫描一致。
- [ ] AC-009：回落数值验证：对含回落的 fixture，其会话汇总与逐小时行给出确定的、可复算的期望值（不出现负值/虚高），并与回落处理前后的实现证据对应。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试（fixture 构造 commandcode JSONL，走 reader/collector/store 单元路径断言）。
- AC-007 的实验需真实只读采样本机 `~/.commandcode`：属受控实验，需用户放行的执行轮次；本轮（文档修订）不执行，也不在此伪造结果。

## 上下文区

- 来源：d059（s037 采样：单文件双用、文件名==id、时间戳/模型字段、`.checkpoints.jsonl` 与 `.meta.json` 旁证；2026-09-14）。**s037 结论中「累计值/子集/成本」部分为未充分证实的观察，本 task 降级为待验证项处理，不直接断言原发现错误，也不凭假设完成验证。**

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
- fixture 来源：**按 AC-007 已确立的语义手工构造**（不得按未验证假设构造）；断言差分/归因口径、model/directory/hour_start、回落处理、幂等/增量/重启。
- mock 边界：文件系统（fixture 目录）+ paths 输入注入；不碰真实 `~/.commandcode`。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- commandcode `usage` 各字段的数值语义（`inputTokens`/`outputTokens`/`cacheReadTokens`/`cacheWriteTokens`/`costUsd` 是累计还是每轮增量）、字段包含关系（`cacheReadTokens` 是否为 `inputTokens` 子集）与「逐行增长是否可由 context 增长解释」：`UNVERIFIED-SPIKE`，由 `docs/spikes/` 下受控只读探针在用户放行的执行轮次复核（扩展 s037 探针：对同一会话逐行比较各字段，构造/选取独立请求对照以排除 context 增长假设），结论回填后才固定口径。
- 若受控实验仍无法排除 context 增长假设、或无法安全取得明确期望值，则本项在执行期不得降级为已结论：保持当前未决标记并停止固定数值口径，向用户报告后由用户裁定是否转为需人工环境核实的阻塞项；本轮不读真实用户会话、不做上游实验，如实保留该未决状态。
- `~/.commandcode` 路径在 Windows/WSL 的形态：本批明确不做（非未知，范围外）。
- `cmd` 新增 content/usage 字段：按 reader 既有「未知行型跳过」原则处理（非未知契约）。

### 风险与回退

- 风险：口径假设错误致 tokens 虚高/虚低或负增量。回退：口径未确立前不固定数值；实现须在 AC-007 结论后固定，并保留回退到「逐轮归零」的安全路径。
- 风险：累计回落（s037 采样称全库 4 次）处理不当致口径虚高——按文件内分段基准 + `delta<=0` 归零，测试覆盖 AC-002/AC-009。
- 风险：`cacheWriteTokens` 值异常——若实验证明确为 0 则如实落 0；否则按实验结论。
- 回退：git revert；commandcode 明细行可按 source 删除重采（reader 幂等 upsert）。

### 依赖与约束

- 无前置 task；与 t484 共用类型枚举/collector 注册点，**公共类型/筛选接线归 t484**，建议 t483 先实施以固定 source/agent 枚举与口径。
- 只读 `~/.commandcode`，不写业务文件。
- 口径未验证前不得固定数值期望（与 AC-007 一致）。

### Finalization 时更新的 blueprint

- `docs/blueprint/decisions.md`：commandcode token 口径决策（仅当 AC-007 实验确立后写入；未确立则记「待验证，不构成决策」）。

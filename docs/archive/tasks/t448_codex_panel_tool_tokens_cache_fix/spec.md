# Task spec

## 背景

t445–t447 新增 codex 采集与面板接线，但展示层漏 codex 分支、codex-reader 差分口径 double 计重复事件且丢弃缓存字段。用户报会话表工具误标 OpenCode、Tokens 1.3B（实约 0.19B）、缓存率恒 0。kimi 空面板经核查为 CPA 网关 monitor_kimi 配置语义，非本 task 范围。

## 契约区

### 范围

- 会话表 codex 行工具 Badge 显示 Codex（SessionTable 补 codex 分支）。
- 同机制已确认同类位点一并补 codex：chart-data 三套 agent labels（AGENT_LABELS / BUCKET_AGENT_LABELS / ROLLUP_AGENT_LABELS）、agent_color、AGENT_COLOR_VAR/agent_accent、local-api agent 类型收窄四处。
- codex-reader 重复 total_token_usage 事件去重（同 total 连续重复不 double 计），tokens 回落真实增量。
- codex-reader 透传 cached_input_tokens 到 daily/records（含 input 归一，防双重计数），缓存率恢复非零。
- 上述行为的单测覆盖（reader 去重、缓存透传归一、面板 codex 分支/labels/颜色）。

### 非范围

- kimi 空面板（CPA 网关 monitor_kimi=true 配置语义，用户关开关即消失，不改仓）。
- p213 分项精度改 last_token_usage 行值口径（独立 pending，依赖本 task 去重先行）。
- codex WSL/Windows 对侧采集（t445 既定仅本机口径）。
- DESIGN 新增 codex 品牌色（若设计未定，颜色回退不断言具体色值，只断言 codex 可分辨且非 accent 误用；以 reviewer 结论为准）。

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

- [ ] AC-001：codex 会话行工具列显示 Codex，不再显示 OpenCode。
- [ ] AC-002：agent donut 三套口径（records/buckets/rollup）均含 codex 独立段，codex 用量不落入“其他”。
- [ ] AC-003：codex 行徽标色与会话库 accent 可分辨归属，不回退为通用 primary/accent 误用。
- [ ] AC-004：local-api 会话查询 `agent=codex` 过滤返回 codex 行且不丢字段。
- [ ] AC-005：含重复 total 事件的 rollout 文件，会话 tokens 等于去重后真实增量（复现文件口径从 1356472098 回落至 196124034 量级，允许实现口径百分位误差，不逐字锁定）。
- [ ] AC-006：cached_input_tokens 非零的 codex 会话，缓存率大于 0 且不大于 1（复现文件约 0.96）；input 已含 cached 部分须归一，不双重计数。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

全部 AC 可自动测试。AC-003 若 DESIGN 缺 codex 品牌 token，色值断言改为“非回退值”谓词，仍自动可测。

## 上下文区

- 来源：p214（2026-09-04 核查：reader 口径 1356472098 vs 真实 196124034，复现脚本 `.scratch/bug_codex_tokens_cacheread_repro.py`）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- codex-reader 单测：自造最小 rollout fixture（含连续重复 total 事件、cached 非零事件），断言去重后 sums 与 cache_read 透传及 input 归一；沿用现有 codex-reader.test.ts 结构。
- 面板单测：SessionTable 行 Badge 文案、chart-data 三套 agentSegments 含 codex、agent_color/agent_accent 非回退；沿用 codex_panels_wiring.test.ts。
- local-api 单测：agent=codex 过滤不断言真实服务，只断言参数透传与类型接纳。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：去重键选择不当误杀真实增量（同 total 但 last_token_usage 不同的边界）；input 归一方向反了导致 tokens 缩水；颜色改动偏离 DESIGN。
- 回退：单 commit 还原；已入库虚胖数据由 store 重算或用户手动重扫恢复（执行期确认口径并写进实施笔记）。

### 依赖与约束

- 前置：无（p213 依赖本 task，不是反向）。
- 约束：AC-005 不逐字锁定 196124034（实现改行值口径后数字会变，只锁定去重语义与量级）。

### Finalization 时更新的 blueprint

- `DESIGN.md`：若新增 codex agent token，走 designmd 流程登记；未新增则无。

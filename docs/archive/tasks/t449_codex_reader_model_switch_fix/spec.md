# Task spec

## 背景

t448 已修 codex reader 重复 total 事件 double 计，但残留缺陷：`turn_context.model` 变化时 reader 把差分基准 `segment_prev_total`/`segment_prev_cache` 重置，下个 token_count 按全量计入。codex `total_token_usage` 实测为文件级连续单调累计（116 文件 0 回绕，含 model 切换处无跳变），不随 model 重置——双 model 会话在切换点整段双计。真实 example_game gpt-5.6-sol 会话入库 tokens 392M（应 196M）。p216。

## 契约区

### 范围

- codex-reader `parse_rollout_file`：差分基准改为文件级连续（首事件 prev=0 起，model 切换不重置 prev），model 仅作增量归因标签。
- 补测试：同文件双 model 连续累计 fixture，断言不因切换双计。

### 非范围

- p213 last_token_usage 行值口径（独立 pending）。
- 已入库历史数据自动订正（重扫即可覆盖，见验收）。

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

- [ ] AC-001：含多次 model 切换且 total 连续累计的 rollout，会话 tokens 等于累计末值，不因切换 double 计。
- [ ] AC-002：真实 example_game gpt-5.6-sol 文件（948 事件 2 切换）重扫后入库 tokens 回落约 196M 量级（读库或 reader 输出，允许百分位误差）。
- [ ] AC-003：单 model 会话行为不变（t445/t448 既有用例全绿）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

AC-001/003 自动可测（reader 单测）。AC-002 用仓库外的真实文件（`.codex/sessions`）黑盒验证，测试侧以自造双 model fixture 等价覆盖。

## 上下文区

- 来源：p216（2026-09-04 实测：example_game gpt-5.6-sol 会话入库 392M vs 文件累计 196M；116 文件 0 回绕含 model 切换处无跳变）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- codex-reader.test.ts 增双 model fixture：turn_context model 在累计中途切换、total 连续单调，断言 session tokens == 末 total（首从 0 起）且 cache_read 不翻倍；沿用现有 fixture 结构。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：真存在上游按 model 重置 total 的场景（当前 116 文件实测无，假设 codex 全为文件级连续）；model 归因随切换仅作标签，若未来上游语义变需重审。
- 回退：还原差分基准重置行为；库数据重扫订正。

### 依赖与约束

- 前置：无（独立修复 t448 残留）。
- 约束：AC-002 量级不逐字锁定。

### Finalization 时更新的 blueprint

- 无

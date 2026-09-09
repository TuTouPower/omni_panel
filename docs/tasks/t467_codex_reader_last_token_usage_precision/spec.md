# Task spec

## 背景

Codex reader 当前按累计 `total_token_usage` 的差分，并按 input/total 比例拆分 input/output。总量正确，但当真实分项值与总量比例不一致时，分项会产生系统偏差。来源 p213（t445 review 遗留，2026-09-09 核实仍未有等价 task）。

## 契约区

### 范围

- 使用 Codex rollout 中的 `last_token_usage` 行值作为可用时的分项增量口径。
- 保持累计 total、cache_read 及跨文件/模型分段的既有语义；处理首行 `last_token_usage === total` 的一致性。
- 增加包含两个 model 分段的 fixture 与回归测试，验证每个分段的 input/output 分项精度。

### 非范围

- 不改变 Codex connector 的外部用量接口。
- 不改变非 Codex reader、存储 schema、UI 展示或历史数据迁移。
- 不在缺少有效 `last_token_usage` 时伪造分项值；保留并测试明确的兼容回退语义。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：对包含有效 `last_token_usage` 的连续 Codex 行，reader 输出的 input/output/cache_read 分项增量等于对应行值差分，而不是按 input/total 比例推算。
- [ ] AC-002：首行、模型切换和双 model 分段场景不会重复累计或丢失 token；fixture 中每个分段的总量与分项均可独立断言。
- [ ] AC-003：既有仅提供累计 total 的 Codex 数据仍按既定兼容规则产出，不影响现有 reader 与 collector 测试。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

全部 AC 可自动测试。

## 上下文区

- 来源：p213 / t445_code_f001（2026-09-09 核实；t445 review 已确认总量正确但分项比例拆分存在系统偏差，当前无等价有效 task）

### 有意不测

- 无

### 测试策略

- 在 `tests/unit/main/core/token-stats/codex-reader.test.ts` 使用真实 reader 入口，增加双 model 分段与首行一致性 fixture；断言每段明细及汇总分项。
- 保留既有累计 total/兼容回退测试，并新增 last-token 行值与 total 比例明显不同的样本。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

无；`last_token_usage` 的输入解析与累计语义已在现有 Codex reader 测试/类型中核实，实施期只需补齐分段样本。

### 风险与回退

- 风险：模型切换或首行快照语义误判可能造成重复计数；旧文件缺少分项字段可能改变历史总量。
- 回退：保留累计 total 的兼容路径；若 last-token 行值不满足单调/一致性校验，回退既有安全口径并记录测试证据。

### 依赖与约束

- 依赖 t445/t448/t449 已完成的 Codex reader 输入与扫描状态契约。
- 不修改 task front matter；实现期仅在 task worktree 修改生产代码与测试。

### Finalization 时更新的 blueprint

- 无

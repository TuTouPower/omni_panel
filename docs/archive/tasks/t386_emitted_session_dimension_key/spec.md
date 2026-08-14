# Task spec

## 背景

collector 的 `emitted_record_keys` 为记录级 key `source|env|message_id`（record 带 `session_id` 但未入 key），`prune_emitted` 按 key 时间戳整体裁剪（EMITTED_WINDOW_MS=30d）。裁剪后，活跃长会话（>30 天持续触碰）任一 jsonl mtime 变化触发 reader 整会话重合并（`merge_session_files`）→ 整段历史因 key 已过窗而重发，重引入 ~200k records/collect 写放大（DB REPLACE 幂等，非数据损坏）。spec 已接受裁剪权衡，概率限「会话 >30 天未触碰又被触碰」罕见场景；但常驻 agent 长会话会周期性触碰，不改进则周期性整段重发。p166 已核实（2026-08-15）：方向与代码结构吻合，record 已带 session_id、key 加会话维度成本低。

## 契约区

### 范围

- `src/main/core/collector/collector.ts`：`emitted_record_keys` 的 key 带会话维度（`source|env|session_id|message_id` 或等价），`prune_emitted` 裁剪时保留「近期（窗口内）mtime 有变化的会话」的 key，避免活跃长会话整段重发。
- 实现方案自选：key 加会话维度 + 按会话活动度保留，或按会话级去重标记；只要覆盖「活跃长会话不整段重发」行为。

### 非范围

- emitted map 持久化（重启全量重发为既有行为，不属本 task）
- 扫描状态与 emission 原子性（p163，独立 task t385）
- 非活跃会话（>30 天未触碰）的既有裁剪语义变更——其过窗后重触碰仍整段重发（spec 已接受）

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

- [ ] AC-001：活跃长会话不整段重发——会话窗口内持续触碰（mtime 更新），到窗口边界时该会话 key 不被整体裁剪，下次 mtime 变化只发新增记录、不重发已发历史（对比修复前：整段历史重发）。
- [ ] AC-002：非活跃会话裁剪语义不变——会话 >30 天未触碰、key 过窗删除后，若重新触碰，仍按既有裁剪语义整段重发（spec 已接受，行为不退化）。
- [ ] AC-003：去重仍生效——同一 message_id 在 key 带会话维度后不会被重复发（跨会话同 message_id 不误合并，同会话内去重保持）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：collector 单测构造窗口内持续触碰的会话（mtime 更新触发重合并）与过窗裁剪，断言 key 保留/删除与重发记录数。

## 上下文区

- 来源：p166（`docs/pending/todo/p166_emitted_window_active_session_reshi.md`；2026-08-15 子代理核实：机制一致、改进方向未实施且吻合代码结构，record 已带 session_id）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- `tests/unit/main/core/collector/collector.test.ts`：补 AC-001（构造窗口内持续触碰会话，断言过窗后只发增量不整段重发）、AC-002（非活跃会话过窗后重触碰仍整段重发）、AC-003（跨会话同 message_id 不误去重）。
- prune_emitted 独立函数若有单测，补保留近期活跃会话 key 的用例。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：key 加会话维度后 emitted map 条目量增加（会话×记录，但窗口裁剪仍限总量）；「近期活跃会话」定义（按 mtime 窗口）与 reader 的 per-file mtime 可见性——prune 侧当前不可见 reader 的 per-file mtime，需在 emit 时记录会话最后触碰时间。
- 回退：git 回退；既有 emitted 语义由 AC-002/AC-003 用例锁定，回归即可捕获。

### 依赖与约束

- 无前置依赖。实现约束：不得改变非活跃会话的既有裁剪行为（AC-002）；跨会话同 message_id 去重语义保持（AC-003）。

### Finalization 时更新的 blueprint

- 无

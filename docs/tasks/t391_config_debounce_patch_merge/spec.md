# Task spec

## 背景

config-debounce 的 `flush_pending` catch 里 `Object.assign(pending, patch)`（src/renderer/hooks/config-debounce.ts:62）——`patch` 是失败时的快照，assign 覆盖回 pending；若 flush 失败在途期间用户又 patch 同键新值，失败旧值覆盖新值，重试保存旧值、丢最新修改。t356 引入失败合并重试机制，同键并发覆盖未覆盖。p175 已核实（2026-08-15）：`Object.assign(pending, ...)` 全仓仅 config-debounce.ts 两处（:62 catch 为问题位点、:79 为正常 patch 合并），无其它 flush-pending 快照回并位点。

## 契约区

### 范围

- `src/renderer/hooks/config-debounce.ts`：`flush_pending` 失败合并 patch 改「只补缺失键」（不覆盖 pending 中已存在的同键新值）或按时间序（后 patch 优先）。
- 保证失败重试不丢在途最新修改。

### 非范围

- use-config save 回滚机制（t390，独立机制：双失败回滚到乐观中间值）
- 正常 patch 合并路径（:79，行为不变）

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

- [ ] AC-001：失败后同键新值不被覆盖——flush 失败（patch 含键 K）在途期间用户又 patch 键 K 新值，重试保存用最新值（对比修复前：失败旧值覆盖新值）。
- [ ] AC-002：失败合并保留非冲突键——失败 patch 中 pending 不存在（无冲突）的键仍合并回 pending 不丢（失败重试不丢任何未确认修改）。
- [ ] AC-003：正常合并行为不变——非失败路径的 patch 合并语义不变（t356 既有用例保持绿）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：config-debounce 测试 mock 写盘失败 + 在途同键 patch，断言最终保存用最新值。

## 上下文区

- 来源：p175（`docs/pending/todo/p175_config_debounce_failed_patch_overwrite.md`；2026-08-15 子代理核实：机制一致，Object.assign(pending,...) 仅 config-debounce 两处，无其它同因位点）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- `config-debounce` 相关测试（t356 AC-003 已有失败合并重试与失败重排 timer 用例）：补「失败后同键再 patch，最终保存用最新值」用例（AC-001）、失败合并非冲突键保留用例（AC-002）。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：「只补缺失键」语义在失败重试时若 pending 已含同键（新值），旧失败值被丢弃——这正是期望行为；需确认失败重试不丢其它未确认键（AC-002 防）。
- 回退：git 回退；AC-003 既有用例锁定正常路径。

### 依赖与约束

- 无前置依赖。实现约束：失败合并不得覆盖 pending 中已存在键；正常 patch 合并路径不改。

### Finalization 时更新的 blueprint

- 无

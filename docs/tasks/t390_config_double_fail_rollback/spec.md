# Task spec

## 背景

use-config 的 `save()`（src/renderer/hooks/use-config.ts:80-100）与 `update_config()`（:102-122）回滚用 `if (config_ref.current === newConfig) { ... setConfig(previous) }`——`previous` 是本次 save 的乐观前值，非「最近一次确认」值。串行 save_queue_ref 下连续两次写盘失败（A、B 依次入队）：先失败者（A）回滚实际被跳过（config_ref 已是后值），后失败者（B）回滚到前一乐观值 A——终态内存=A、磁盘=base 漂移。t356 引入回滚机制，双失败场景未覆盖。p174 已核实（2026-08-15，trace 细节：A 回滚被跳过而非「回滚到 base」，终态结论不变）。

## 契约区

### 范围

- `src/renderer/hooks/use-config.ts`：save() 与 update_config() 回滚目标改为「最近一次确认值」（本次 save 前已成功写入的值），而非本次调用的乐观前值。
- 串行队列语义：失败回滚到最近确认值，无论前面失败多少次。

### 非范围

- config-debounce（t391，独立机制：失败合并 patch 覆盖同键新值）
- 其它 renderer hooks（use-popup-ui-config 为读+默认回退，非保存回滚，不动）

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

- [ ] AC-001：双失败回滚到最近确认值——save 连续两次写盘失败（A、B 依次入队、均 reject），最终 config == base（最近确认值），而非 A（对比修复前：内存=A、磁盘=base 漂移）。
- [ ] AC-002：单失败回滚正确——单次写盘失败回滚到 base，既有行为不变（t356 AC-002 用例保持绿）。
- [ ] AC-003：update_config 同机制——update_config 连续两次失败同样回滚到最近确认值（同因位点随本修复覆盖）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：use-config 测试 mock 写盘连续 reject，断言最终 config 值与磁盘值一致（== base）。

## 上下文区

- 来源：p174（`docs/pending/todo/p174_config_save_double_fail_rollback_mid.md`；2026-08-15 子代理核实：机制一致，trace 修正 A 回滚被跳过，update_config 同因成立，renderer 无其它同类位点）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- `use-config` 相关测试（t356 AC-002 已有单次失败回滚用例，save 与 update_config 各一）：补 A/B 均 reject 双失败用例，断言最终 config==base（而非 A）；update_config 同机制补双失败用例。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：回滚目标改为「最近确认值」需在队列中跟踪确认点（每次成功写盘更新）；串行队列中确认值推进时序处理不当可能回滚过头或未回滚。
- 回退：git 回退；AC-002 既有单失败用例锁定基本行为，AC-001 锁定新语义。

### 依赖与约束

- 无前置依赖。实现约束：回滚目标 = 最近一次已成功写入的确认值；单失败行为与 t356 语义保持一致。

### Finalization 时更新的 blueprint

- 无

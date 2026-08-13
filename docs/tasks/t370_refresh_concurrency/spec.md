# Task spec

## 背景

refresh-service 并发/force/状态缺陷：(1) `refreshNow`/`start` 的 immediate 刷新不做 in-flight 去重，与 per-instance 锁两层并发控制，spinner 与真实执行错位；(2) `refresh` 的 `force` 参数无任何行为，手动刷新在自动刷新持锁时被静默跳过；(3) 全轮失败后的 stale 副本插入段无 try/catch，insert 抛错跳过 updateState(failed) 使 runtime store 卡在 loading；(4) refreshAll 失败仅 log 不推送 failed 状态。

## 契约区

### 范围

- `refreshNow` 返回是否已受理（或被锁），spinner 绑定受理结果。
- force 为 true 时绕过锁（或等待当前刷新结束后重跑），并保证调用方可见反馈；否则删除该参数。
- stale 副本插入段包 try/catch（失败仅告警），确保 failed 状态更新无条件执行。
- refreshAll 失败时推送 failed 快照或逐实例状态。

### 非范围

- 不改刷新调度节奏。

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

- [ ] AC-001：手动刷新在自动刷新持锁时不静默跳过（force 生效或有可见反馈）。
- [ ] AC-002：stale 副本插入失败不影响 failed 状态更新，UI 不卡在「加载中」。
- [ ] AC-003：refreshAll 失败时用户可见失败状态（推送 failed 或逐实例）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：refresh-service 单测（mock 锁占用/stale insert 抛错/refreshAll 失败）。

## 上下文区

- 来源：review_20260813_114911/review_intensive.md（`connector-scheduler.ts:98`、`refresh-service.ts:226`/`:489`、`connector-ipc.ts:283`、`scheduler-orchestrator.ts:317`、`connector-scheduler.ts:347`）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- refresh-service 单测：mock is_locked 断言 force 绕过；mock insert 抛错断言 updateState(failed) 仍执行；refreshAll 失败断言 failed 快照推送。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：force 绕过锁导致并发刷新重叠。
- 回退：force 仅在锁非当前实例持有时生效，或排队等当前刷新结束。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无

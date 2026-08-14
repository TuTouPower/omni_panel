# Task spec

## 背景

connector runtime 超时/脚本隔离缺陷：(1) `race_with_timeout` 超时后不取消脚本异步工作，脚本继续在后台运行，同一实例并发多个脚本实例反复打上游；(2) await 后同步死循环可饿死事件循环使超时机制整体失效（未缓解的 DoS/稳定性风险）；(3) 超时经 AbortController abort 的错误消息无 "timeout" 字样，下游分类失效；(4) schema 校验失败仅 warn 静默丢条，不 report_failed_account。

## 契约区

### 范围

- 超时时向脚本暴露 AbortSignal（ctx.signal），脚本 HTTP 请求绑定 signal；至少对已超时实例的并发执行计数并拒绝重叠启动。
- 为脚本执行引入隔离进程/worker + 进程级超时强杀（或文档明示「await 后不得长同步循环」并加执行耗时监控日志）。
- abort 前先置超时标志或 reject 用明确超时错误消息。
- schema 校验失败时调用 `report_failed_account`（至少可辨识场景）或计入 error 摘要返回。

### 非范围

- 不改 vm 沙箱安全模型本身。

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

- [ ] AC-001：脚本超时后不再有后台残留脚本继续打上游（并发拒绝或 signal 取消）。
- [ ] AC-002：abort 产生的错误可被 is_timeout_error 识别，重试分类正确。
- [ ] AC-003：schema 校验失败不再静默丢条（report_failed_account 或计入错误）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- AC-002/003 可自动测试；AC-001 的进程级强杀若走 worker 隔离则 [deploy] 验证（跨进程强杀难单测）。

## 上下文区

- 来源：review_20260813_114911/review_intensive.md（`runtime.ts:174`/`:114`/`:183`/`:145`/`:305`、`net-client.ts:218`）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 跨进程强杀真实行为不自动化，[deploy] 验证。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- runtime 单测：mock 超时 abort，断言错误含 timeout 字样；schema 失败断言 report_failed_account 被调。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 进程级隔离方案：`UNVERIFIED-SPIKE`，实施前先评估 worker_threads/child_process 与 VM 注入兼容性。

### 风险与回退

- 风险：进程级隔离改动大，引入跨进程序列化成本。
- 回退：先做 AbortSignal 透传 + 并发拒绝（轻量），进程隔离留 spike 决策。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：connector 执行隔离模型。

# Task spec

## 背景

session-history 主进程健壮性缺口：(1) fs.watch watcher 死亡后订阅静默停摆（error 回调只 log.warn，`watcher` 仍非 null 不重建）；(2) poll watcher 只比对 mtime，文件被替换/截断重写时字节游标静默跳过新内容；(3) session-locator 模块级可变单例状态（含定时器）易串状态；(4) cookie 捕获成功但 vault.set 失败时用户得无上下文错误且 cookie 丢失。

## 契约区

### 范围

- watcher error 回调 stop 当前 watcher 并置 null（或降级 poll），触发重建。
- poll 分支校验 size 回退（重写）时重置 cursor 走全量。
- session-locator 状态收进 `create_session_locator(paths)` 实例化或注释声明单例约束。
- cookie 保存失败包装可读错误（「登录成功但保存失败，请重试」）。

### 非范围

- 不改订阅/定位语义。

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

- [ ] AC-001：watcher 死亡后可重建（或降级 poll），订阅不静默停摆。
- [ ] AC-002：文件被截断/重写时增量游标重置，不丢新内容。
- [ ] AC-003：cookie 保存失败返回可读错误，用户可区分「未捕获」与「保存失败」。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：subscription/locator/session-manager 单测（mock watcher error、文件重写、vault.set 失败）。

## 上下文区

- 来源：review_20260813_114911/review_intensive.md（`subscription-service.ts:437`/`:223`/`:248`、`session-locator.ts:41`、`session-manager.ts:179`）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- subscription 单测：mock fs.watch error 断言重建/降级；mock 文件 size 回退断言 cursor 重置。
- session-manager 单测：mock vault.set 抛错断言可读错误。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：watcher 重建引入重复事件。
- 回退：重建前 stop 旧 watcher，去重按字节游标保证。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无

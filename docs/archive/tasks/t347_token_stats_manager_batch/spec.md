# Task spec

## 背景

token-stats manager 批处理有四处健壮性/性能问题：(1) `upsert_sessions` 每批末尾全量重建 buckets 表（INSERT...SELECT...GROUP BY 全表聚合），100 批就 100 次全表重建；(2) `apply_batches` 单批 DB 失败即中断剩余批次，剩余 records 永久丢失且无重试；(3) 熔断跳闸后 collector 无恢复路径，只能重启应用；(4) `same_config` 注释声称 order-independent 比较，实为 `JSON.stringify` 序相关。

## 契约区

### 范围

- buckets 重建推迟到整轮最后一批（manager 在 apply_batches 收尾单次重建），或按受影响 (source, env, date) 增量重算。
- 单批 DB 失败记录断点并继续/重试剩余批次，最后仍回调 on_update。
- 熔断跳闸后有恢复路径（配置更新或应用重启时复位计数并允许重新 spawn）。
- `same_config` 改为规范化比较（按 key 排序后序列化）或逐字段比较，并同步注释。

### 非范围

- 不改 collector 侧数据正确性（见 t345）。

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

- [ ] AC-001：一轮 upsert 只触发一次 buckets 重建（或改为增量重算），不再每批全表聚合。
- [ ] AC-002：单批 DB 失败不丢弃剩余批次，剩余 records 被继续处理或重试。
- [ ] AC-003：熔断跳闸后可通过配置更新/重启恢复 collector，状态可区分「已停止」与「熔断」。
- [ ] AC-004：`same_config` 比较与键序无关（`{a:1,b:2}` 与 `{b:2,a:1}` 判等）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：单测断言 buckets 重建次数、批失败后继续、same_config 键序无关、熔断恢复。

## 上下文区

- 来源：review_20260813_114911/review_intensive.md（`token-stats-store.ts:977`、`manager.ts:80`、`:172`、`:37-43`）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 单测：mock store 抛错于中间批，断言后续批次仍被调用；注入多批数据断言 buckets 重建次数 == 1；same_config 表驱动键序用例。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：buckets 重建推迟到末批后，若中途崩溃则本轮 buckets 未更新。
- 回退：重建逻辑幂等，下轮重算；或改为增量按 (source,env,date) 重算以缩小失败面。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无

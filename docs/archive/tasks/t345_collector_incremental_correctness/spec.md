# Task spec

## 背景

token-stats collector/reader 增量采集有多处数据静默丢失：(1) grok 源部分文件不可读时整轮结果被丢弃并误报 unavailable；(2) claude/kimi reader 文件读取失败前已提交 mtime，该文件永久跳过；(3) 超上限被截断的 sessions/daily 已推进扫描状态、永不再发射；(4) emitted 标记先于 postMessage，发送失败时记录已标已发出；(5) claude costs.jsonl 缺 timestamp 按 1970 处理并可能成为 latest；(6) wsl_user 首次探测空串被缓存，整段运行期 WSL 源不可用。

## 契约区

### 范围

- grok 源 `missing` 区分「目录缺失」与「file_unreadable」，部分可读时返回已解析部分并置 failed 状态。
- claude/kimi reader 文件读取失败时不提交 mtime，下一轮重读。
- 超上限被截断的 sessions/daily 记入未发射集合，或上限命中时不推进扫描状态。
- postMessage 失败时不留存 emitted 标记。
- claude costs.jsonl 过滤缺 timestamp 的行。
- wsl_user 空结果不缓存，每轮重试。

### 非范围

- 不改 emitted_record_keys 的内存有界问题（见 t346）。
- 不改 buckets 重建/批处理（见 t347）。

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

- [ ] AC-001：grok 源部分文件不可读时返回已成功解析的 sessions/daily/records 并置 failed 状态，仅目录缺失才报 unavailable。
- [ ] AC-002：claude/kimi reader 读取失败的文件下一轮重读（mtime 未提交）。
- [ ] AC-003：超上限被截断的 sessions/daily 不永久丢失（缓存到下一轮或上限命中时不推进扫描状态）。
- [ ] AC-004：postMessage 失败时对应记录下一轮重发。
- [ ] AC-005：claude costs.jsonl 缺 timestamp 的行不进入 timestamps，不按 1970 处理。
- [ ] AC-006：wsl_user 探测为空时下轮重试，不缓存空串。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：reader/collector 单测（mock 文件不可读/截断/postMessage 抛错/缺字段）。

## 上下文区

- 来源：review_20260813_114911/review_intensive.md（`collector.ts:409`、`:503`、`:519`、`:247`；`claude-reader.ts:574`、`:152`；`kimi-reader.ts:387`）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 复用 grok/claude/kimi reader 既有测试 fixture，补「部分文件不可读」「读取失败」「截断」「postMessage 失败」场景断言。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：部分可读返回逻辑改变 refresh-service 对 grok 的成功/失败判定。
- 回退：部分可读置 failed 状态（保留旧数据、不标正常），与 t039 语义一致。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无

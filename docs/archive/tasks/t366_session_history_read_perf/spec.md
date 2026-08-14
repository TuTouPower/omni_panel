# Task spec

## 背景

session-history 提取多处全量重读性能问题：(1) grok 增量提取每次全量重 parse 游标前全部行（O(N) per poll）；(2) claude 增量提取整文件 read 只消费尾部（每次 write 触发全量磁盘 IO）；(3) kimi `scan_lines` 每行重复切片同一区间（2 倍临时字符串分配）；(4) opencode 首条 user 只扫前 50 条 text part。

## 契约区

### 范围

- grok 把「合法消息计数」持久化进 ExtractCursor（字节 offset + valid_count），增量从 offset 续读，cursor 版本不匹配时回退全量。
- claude/kimi 增量读改用 `openSync`/`readSync` 从 cursor.offset 只读剩余字节，或先 statSync size 比较仅读增量。
- kimi scan_lines 复用单个 slice 变量避免重复分配。
- opencode 首条 user 提取改为 SQL 精确 `WHERE role='user' LIMIT 1` 或提高 LIMIT 上界。

### 非范围

- 不改提取语义/字段。

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

- [ ] AC-001：grok 增量提取不再每轮全量重 parse 前缀，从游标 offset 续读。
- [ ] AC-002：claude/kimi 增量只读新增字节，不全量读盘。
- [ ] AC-003：opencode 前 50 条全是 assistant 时仍能取到真实首条 user 摘要。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：extractor 单测断言续读字节量、opencode 首条 user 提取边界。

## 上下文区

- 来源：review_20260813_114911/review_intensive.md（`grok-extractor.ts:161`、`claude-code-extractor.ts:126`、`kimi-extractor.ts:61`、`opencode-extractor.ts:95`）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- extractor 单测：断言增量读取字节范围、cursor 推进；opencode 补「前 50 条 assistant」用例。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：游标持久化格式变化需迁移旧 cursor。
- 回退：cursor 版本不匹配时回退全量重计（grok 已有此兜底）。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无

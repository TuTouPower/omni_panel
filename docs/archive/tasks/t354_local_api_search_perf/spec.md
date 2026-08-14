# Task spec

## 背景

session history 内容搜索（web `server.ts` 与 desktop `session-history-ipc.ts`）多处全量分页枚举 + 逐行文件系统操作：(1) `metadata_rows.includes(row)` 用对象引用比较（O(n·m) 且引用比较恒 false）；(2) 全量分页枚举无总量上限；(3) 同一请求内候选行与 metadata 行两次独立全量枚举；(4) RECENT 的 limit 被 provider 默认 100 静默截断。

## 契约区

### 范围

- 预构建 `Set`（按 session key）替代 `includes` 线性扫描，合并循环一次遍历。
- 分页枚举加总量上限（如 100k）或复用 abort 信号，必要时降级扫最近 N 天。
- 候选与 metadata 合并为单次枚举（search 命中集内存再过滤）。
- RECENT 直接传 `{source, env, limit, offset: 0}` 避免默认 100 截断。

### 非范围

- 不改搜索匹配语义。

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

- [ ] AC-001：搜索合并循环用 Set/key 判断，不再 `metadata_rows.includes(row)` 对象引用比较。
- [ ] AC-002：RECENT 请求 limit>100 时返回请求条数，不再被默认 100 静默截断。
- [ ] AC-003：搜索分页枚举有总量上限或 abort 支持，不随会话库规模无界。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：server/ipc 单测断言 RECENT limit 透传、搜索去重正确。

## 上下文区

- 来源：review_20260813_114911/review_intensive.md（`server.ts:449`/`:254`/`:419-432`/`:452`、`session-history-ipc.ts:87`/`:295`/`:207`）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 单测：构造 metadata/candidate 重叠行，断言去重后并集正确；RECENT 传 limit 断言返回条数。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：总量上限过低导致搜索结果不全。
- 回退：上限取保守值（100k），超出时明确降级提示。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无

# Task spec

## 背景

t354 AC-002 移除 recent_sessions 隐式 100 cap 后，RECENT IPC 的 limit 直传 token-stats store `query_sessions`，无上界校验（SQLite LIMIT 巨大值等价不设限）。核实确认三处同因直传：RECENT（session-history-ipc.ts:210-226）、TOKEN_STATS_SESSIONS（token-stats-ipc.ts:52-61，活跃调用方 RecentSessionsModal.tsx:24）、TOKEN_STATS_RECORDS（token-stats-ipc.ts:71-80）。t353 的 parse_int_param（local-api/server.ts:764-785）仅校验有限数 + min、无 max 上界。复验（.scratch/p171_repro.test.ts）：query_sessions limit=MAX_SAFE_INTEGER 返回全量 150，无钳制。p173 已核实（2026-08-15）。

## 契约区

### 范围

- 桌面 IPC 三处 limit 直传加参数校验/钳制：RECENT、TOKEN_STATS_SESSIONS、TOKEN_STATS_RECORDS（limit 校验为有限正整数 + 上界钳制或拒绝超限）。
- 对齐 t353 `parse_int_param` 校验模式：拒绝非数/0/负，超上界钳制或拒绝。
- 补三处通道的超大/负/非数 limit 用例。

### 非范围

- local-api /v1/sessions（有 parse_int_param 校验层但无 max——上界缺失同根因，但已有校验层非「直传无校验」，本次不扩；如需统一上界另立 task）
- dashboard 双通道（zod 已有界：session_limit max 100、offset max 100_000）
- SESSION_HISTORY_QUERY（limit 只切内存数组，非 SQLite LIMIT）
- store 层 query_sessions/query_records 的 `?? 100`/`?? DEFAULT_RECORDS_LIMIT` 缺省语义

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

- [ ] AC-001：RECENT limit 超上界被拒或钳制——limit 为超大值（如 MAX_SAFE_INTEGER）时请求被拒（错误响应）或钳制到上界，不触发全量拉取（对比修复前返回全量 150）。
- [ ] AC-002：TOKEN_STATS_SESSIONS 同校验——同根因通道 limit 超上界被拒或钳制，正常小 limit 行为不变（RecentSessionsModal 现有调用不受影响）。
- [ ] AC-003：TOKEN_STATS_RECORDS 同校验——同根因通道 limit 超上界被拒或钳制，缺省 limit 语义不变。
- [ ] AC-004：非法 limit 被拒——limit 为 0/负数/非数时请求被拒（对齐 parse_int_param），不落入 store 默认值兜底。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：IPC handler 测试注入超大/0/负数/非数 limit 断言被拒或钳制；正常 limit 断言行为不变。

## 上下文区

- 来源：p173（`docs/pending/todo/p173_recent_limit_validation.md`；2026-08-15 子代理核实：RECENT 全链无校验直传 query_sessions，parse_int_param 仅 min 无 max，TOKEN_STATS_SESSIONS/RECORDS 两处同因直传）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- `session-history-ipc.test.ts:357-370` 已有 RECENT limit 透传断言；扩展为超大/0/负/非数 limit 被拒或钳制用例。
- `token-stats-ipc.test.ts`：TOKEN_STATS_SESSIONS / TOKEN_STATS_RECORDS 补超上界与非法 limit 用例，正常 limit 行为不变。
- 校验若抽成共享函数（对齐 parse_int_param 模式），补其单测；否则在 IPC handler 测试内覆盖。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：上界钳制 vs 拒绝的选择影响调用方——若钳制，超大 limit 静默变上界值；若拒绝，调用方需处理错误。现有调用方（RecentSessionsModal 固定小 limit）不受影响，但需与既有错误处理路径一致（对齐 parse_int_param 拒绝语义）。
- 回退：git 回退；AC-002 既有调用方行为由正常 limit 用例锁定。

### 依赖与约束

- 无前置依赖。实现约束：校验语义与 t353 parse_int_param 一致（拒绝非法 + 上界）；不得改变正常 limit 的既有行为。

### Finalization 时更新的 blueprint

- 无

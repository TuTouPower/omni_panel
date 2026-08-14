# Task review t354（reviewer_focus: 通用）

- task：`t354_local_api_search_perf`
- spec：`docs/tasks/t354_local_api_search_perf/spec.md`
- diff_anchor：`97878b405a6e8632430acf934d63b7e1641f37d7`
- target：`git diff 97878b405a6e8632430acf934d63b7e1641f37d7`
- round：1
- reviewed_at：2026-08-14 00:40 UTC+8

## Findings

### t354_gen_f001 - AC-001 测试对旧实现恒真，实现/测试注释对旧 includes 语义判断错误（非功能缺陷，仅可信度）

- 严重度：minor
- 锚点：AC-001（Set/key 判断替代 includes）；行为缺陷场景：无
- 位置：`tests/unit/ipc/session-history-ipc.test.ts:515-564`；`src/main/ipc/session-history-ipc.ts:291-293`；`src/main/core/local-api/server.ts:463-465`
- 问题：AC-001 测试 `mockReturnValueOnce([shared_session]).mockReturnValueOnce([shared_session])` 两次返回**同一对象引用**。旧实现 `metadata_rows.includes(row)` 对 metadata 数组自身元素是**引用相等、恒真**（`row` 即该数组元素，`includes` 用 SameValueZero 比较对象引用），因此 metadata 行在旧代码下同样无条件进 `response_keys` 并 push session，candidate 重复行由 `response_keys.has(key)` 去重——旧代码同样输出 `["s1"]`，测试对旧实现也通过，不构成对 Set 改动的红绿保护。注释与测试内注释「旧 includes 引用比较恒 false 导致重叠行重复进 sessions」与事实不符（恒 false 仅对 candidate 行的 O(n·m) 扫描成立，metadata 行自身是恒 true）。经穷举比对旧/新条件分支（metadata 行 / candidate 行 key∈metadata_keys / key∉metadata_keys 三类），新实现为行为保持（输出不变），仅性能改善，无功能回归；问题集中在**不成立的 rationale 与不具判别力的测试**。
- 建议：测试改用**不同引用**的 candidate/metadata 重叠行（贴近生产两次独立 provider 调用），并在注释中修正「引用比较恒 false」表述为「对跨数组重复行 O(n·m) 且语义依赖引用恒等式」；或将注释改为说明本改动为纯性能优化、行为保持。

### t354_gen_f002 - 枚举超限静默截断，无「明确降级提示」，与 spec 风险与回退承诺不符

- 严重度：minor
- 锚点：AC-003（有总量上限）满足；spec 上下文「风险与回退：超出时明确降级提示」（`docs/tasks/t354_local_api_search_perf/spec.md:90-91`）
- 位置：`src/main/core/local-api/server.ts:262-268`（cap 循环）、`:477-479`（response 无截断信号）；`src/main/ipc/session-history-ipc.ts:94-100`、`:305-313`
- 问题：`SEARCH_ENUM_CAP=100_000` 触发后循环静默停止，返回的 `{hits, sessions}` 无任何截断标记/告警，客户端无法区分「搜索结果全」与「超过 100k 被截断」。spec 上下文区明确承诺「上限取保守值（100k），超出时明确降级提示」，实现仅完成前半句。会话库规模超 100k 时搜索将静默返回不完整结果。
- 建议：cap 触发时在响应加 `truncated: true` 字段（或 service 返回截断标记），或至少在 server 侧记一条 warning 日志，对齐「明确降级提示」；若认定静默截断可接受，应在 spec 风险与回退中删除该承诺。

### t354_gen_f003 - 范围「候选与 metadata 合并为单次枚举」仅部分落地：仍两次独立枚举，各自 cap，最坏 2×100k

- 严重度：minor
- 锚点：spec 范围第 3 条「候选与 metadata 合并为单次枚举（search 命中集内存再过滤）」（`docs/tasks/t354_local_api_search_perf/spec.md:13`）；背景第 3 条「同一请求内候选行与 metadata 行两次独立全量枚举」
- 位置：`src/main/core/local-api/server.ts:279-289`（content_search_candidates → session_history_query_all_sessions）+ `:447-456`（metadata 枚举）；`src/main/ipc/session-history-ipc.ts:105-119`、`:240-249`
- 问题：内存合并循环（`[...metadata, ...candidate]` 单次遍历 + `response_keys`）已实现，但**存储层枚举仍是两次独立全量分页**，各自独立 `SEARCH_ENUM_CAP`，最坏取 2×100k=200k 行，超出 spec「上限取保守值（100k）」的总量意图。原背景问题（3）的两次独立枚举以「各加 cap」而非「合并为单次枚举」方式缓解，perf 收益打折。
- 建议：若性能仍敏感，可合并为单次 `query_all_sessions` 枚举 + 内存按 search 命中集/搜索过滤二次过滤（即 spec 范围原意）；否则确认范围第 3 条以「cap 替代合并」方式收口并在 spec 中更新范围描述，避免范围与实际不一致。

### t354_gen_f004 - AC-002 移除 provider 隐式 100 cap 后，RECENT limit 直传 store 无上界校验

- 严重度：minor
- 锚点：AC-002（limit 透传）；行为缺陷场景：limit 为负/极大时 store 无界取数
- 位置：`src/main/core/session-history/subscription-service.ts:608`；`src/main/ipc/session-history-ipc.ts:213-227`（RECENT handler 无 limit 校验）
- 问题：改动前 provider 以 `(source, env)` 调用时 store 默认 `limit=100`（`src/main/core/token-stats/token-stats-store.ts:1192`），是隐式安全阀；改动后 `limit` 原样透传。token-stats store 的 SQL 为 `LIMIT @limit`，SQLite 中 `LIMIT -1` 表示**不设限**（取全部行）。RECENT IPC handler 对 `limit` 无任何校验（t353 已为 web 读端点统一 400 数值校验，但 IPC RECENT 通道未覆盖）。当前 renderer 无该通道活跃调用方（RecentSessionsModal 走 `tokenStats.getSessions`），故为理论风险。
- 建议：RECENT handler 或 `recent_sessions` 入口对 limit 做 `Number.isInteger(limit) && limit > 0 && limit <= 上限`（如复用 100k）校验，与 t353 数值参数校验口径对齐。

## 结论

- 前轮 finding 复核：Round 1，无。
- 本轮新发现：4 条（均 minor）。
- 未进表的提示：AC-003 ipc 测试内注释「每枚举 1001 次」有 off-by-one（实际 cap 循环 1000 次/枚举、共 2000 次，`≤2005` 断言仍安全）；web `server.ts` 新逻辑（`metadata_keys` 非空分支、cap 超限分支）无独立单测，由 ipc 并行实现覆盖 + integration 冒烟（metadata 为空路径）兜底。
- 总体判断：AC-001/002/003 均有实现且有测试，实现正确（Set 替换为行为保持的纯性能优化；cap 边界因 100 整除 100k 且检查在前，无超 push，恰停在 100k；AC-002 provider 对象形态在 index.ts:494 与 token-stats store 均支持，query_all_sessions 已走对象形态验证过真实 provider）。4 条 minor 均为可信度/边界/范围收口类，无未解决 critical/important，可 PASS。
- 系统性 follow-up：建议标题「RECENT IPC limit 数值校验（对齐 t353 读端点 400 校验）」，slug `recent_limit_validation`；另可评估「搜索单次枚举合并」是否立项，无则写无。

verdict: PASS

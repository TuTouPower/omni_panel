# p173 RECENT IPC limit 直传 store 无上界校验

- 现象：t354 AC-002 移除 recent_sessions 的隐式 100 cap（provider 现在收到真实 limit），RECENT IPC 的 limit 直传 token-stats store query_sessions，无上界校验（SQLite LIMIT 巨大值等价不设限）。
- 影响：RECENT 请求超大数据量 limit 可触发全量拉取；RECENT 通道当前无活跃调用方（RecentSessionsModal 走 tokenStats.getSessions），但同因位点 TOKEN_STATS_SESSIONS 为活跃通道（renderer 传固定小 limit），renderer 受控时低风险，被入侵/回归时全量拉取。
- 根因：t354 移除默认 100 截断后未补校验/上界。RECENT 路径全链无校验：session-history-ipc.ts:210-226（RECENT handler，limit 裸 number）→ service.recent_sessions（subscription-service.ts:644-663，`sessions_provider({source, env, limit, offset: 0})`）→ sessions_provider（main/index.ts:507-531）→ query_sessions（token-stats-store.ts:1192 `filters.limit ?? 100`，无钳制）。t353 的 parse_int_param（local-api/server.ts:764-785）仅校验有限数 + min，本身亦无 max 上界——对齐其模式可拒 0/负/非数，但不含钳制。复验（.scratch/p171_repro.test.ts）：query_sessions limit=MAX_SAFE_INTEGER 返回全量 150，无钳制。
- 已扫同类位点（检索轴：IPC handler 将 limit 直传 store SQL 查询且无 zod/参数校验或钳制）：
    - TOKEN_STATS_SESSIONS（token-stats-ipc.ts:52-61）：filters.limit 直传 query_sessions，无校验无钳制；活跃调用方 RecentSessionsModal.tsx:24 `getSessions({limit})`。同因成立。
    - TOKEN_STATS_RECORDS（token-stats-ipc.ts:71-80）：filters.limit 直传 query_records，显式 limit 无钳制（仅缺省 DEFAULT_RECORDS_LIMIT=5000）。同因成立。
    - 相关非同类：local-api /v1/sessions（server.ts:1393-1399）用 parse_int_param 校验（有限数、min 0）但无 max 上界——有校验层故非「直传无校验」，上界缺失同根因；dashboard 双通道 zod 有界（session_limit max 100、offset max 100_000，token-stats.ts:319-320/426-427）；SESSION_HISTORY_QUERY options.limit 只切内存数组非 SQLite LIMIT。
- 测试缺口：RECENT IPC 测试（session-history-ipc.test.ts:357-370）仅断言 limit 透传 service；recent_sessions 测试（subscription-service.test.ts:776/818/854）只测 limit 截断切片；均无超大/负 limit 被拒或钳制用例。应补超大 limit 被拒或截断断言。
- 线索：t354 review_general.md f004。
- 处理：t389
- 核实：2026-08-15 问题仍存在；根因与现状一致（RECENT limit 全链无校验直传 query_sessions）；parse_int_param 确认仅 min 无 max；同类位点确认 TOKEN_STATS_SESSIONS/RECORDS 两处同因直传；测试缺口成立。

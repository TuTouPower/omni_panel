# p172 会话内容搜索分页超限静默截断，无降级提示

- 现象：t354 AC-003 加 SEARCH_ENUM_CAP=100_000 后，会话库超 10 万条时搜索分页枚举被静默截断，响应无 truncated 信号，客户端无法感知结果不完整。
- 影响：会话内容搜索（web server.ts + desktop session-history-ipc.ts）在超大会话库下结果不全且无提示；现实触发概率极低（10 万会话）。
- 根因：t354 实现取 spec「上限取保守值（100k）」，但 spec 风险与回退还承诺「超出时明确降级提示」，响应契约（hits/sessions）无 truncated 字段，超限静默截断。已扫：搜索路径仅此一处 cap（桌面 IPC session-history-ipc.ts:71 + web local-api/server.ts:181 双入口同 while 循环机制，均仅用于 search content 枚举）。
- 测试缺口：IPC 已有 t354 AC-003 cap 收敛测试（session-history-ipc.test.ts 断言 provider 调用次数有界，不涉 truncated 标志）；web server.test.ts 搜索路径无 cap 测试；truncated 降级标志断言全缺。补测需注入小 cap 或 mock 超限 provider，断言响应带 truncated 标志，并补 web 路径覆盖。
- 线索：t354 review_general.md f002。
- 处理：t388
- 核实：2026-08-15 问题仍存在，根因与现状一致。`SEARCH_ENUM_CAP=100_000` 双入口（src/main/ipc/session-history-ipc.ts:71、src/main/core/local-api/server.ts:181）同机制 while 枚举；响应契约 SessionHistorySearchContentResponse（src/shared/types/ipc.ts）仅 hits/sessions，无 truncated 字段；renderer SessionLibrary.tsx 消费无截断感知。同类位点扫描：cap 仅存在于搜索内容路径双入口，订阅服务 searchContent 枚举已 resolve 的 locs 无独立 cap，「搜索路径仅此一处 cap」成立，已扫无其它同类枚举 cap。检索轴：SEARCH_ENUM_CAP / query_all_sessions / session_history_query_all_sessions / `while (page.length === CONTENT_SEARCH_PAGE_SIZE)`。

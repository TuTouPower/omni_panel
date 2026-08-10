# p083 GET /v1/sessionHistory 缺 source/env 时全量枚举（t259 code f004）

- 来源：t259 code review f004（minor）
- 内容：source/env 缺省时 `session_history_query_all_sessions(deps, {})` 分页取全部会话再 find——O(总会话数) provider 调用，无 auth 可反复触发；find 取首个 id 匹配，多 source 同 id 歧义。web query 恒透传 source/env，此路径仅兼容 id-only 调用方。建议移除回退或加 bound。（2026-08-08 核实：仍在，`server.ts:252-259`；该回退被集成测试 `server.test.ts:858-877` 显式断言，移除需同步改测试。）
- 处理：t263

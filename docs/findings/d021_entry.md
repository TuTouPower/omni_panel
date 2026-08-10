# d021 会话库查询扩展与内容搜索并集（2026-08-06）

- 来源：t227
- 结论：
    1. `tokenStatsStore.query_sessions` 扩展 sources[]/start_at/end_at/order_by/direction：时间范围用活动时间交集（`ended_at >= start_at AND started_at <= end_at`），order_by 白名单（ended_at/tokens 表达式/calls/started_at）+ direction 白名单（ASC/DESC）防 SQL 注入。
    2. 「包含消息内容」搜索语义 = 元信息命中 ∪ 正文命中（并集）：纯正文命中会话须显示，不能只 filter 元信息结果。正文命中异步逐候选读消息，必须用序号守卫防旧查询迟到覆盖；命中结果须用响应式 state（ref + force_update 不会触发 useMemo 重算）。
    3. 会话主键是 (id, source, env)：勾选/dock/列表 key 须含三者，只按 id 跨 source/env 会串选。
- 证据：t227 query_sessions 扩展测试（多 source IN/时间交集/tokens/calls 排序）、SessionLibrary 内容搜索并集测试。
- 影响：会话库/后续会话类 UI 沿用「时间交集 + 并集搜索 + 序号守卫 + 三元主键」四不变量；新增会话查询扩展走白名单排序防注入。
- 现状：有效

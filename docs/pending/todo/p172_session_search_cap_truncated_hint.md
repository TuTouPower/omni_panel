# p172 会话内容搜索分页超限静默截断，无降级提示

- 现象：t354 AC-003 加 SEARCH_ENUM_CAP=100_000 后，会话库超 10 万条时搜索分页枚举被静默截断，响应无 truncated 信号，客户端无法感知结果不完整。
- 影响：会话内容搜索（web server.ts + desktop session-history-ipc.ts）在超大会话库下结果不全且无提示；现实触发概率极低（10 万会话）。
- 根因：t354 实现取 spec「上限取保守值（100k）」，但 spec 风险与回退还承诺「超出时明确降级提示」，响应契约（hits/sessions）无 truncated 字段，超限静默截断。已扫：搜索路径仅此一处 cap。
- 测试缺口：无超限路径测试；补测需注入小 cap 或 mock 超限 provider，断言响应带 truncated 标志。
- 线索：t354 review_general.md f002。
- 处理：未开

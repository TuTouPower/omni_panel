# p173 RECENT IPC limit 直传 store 无上界校验

- 现象：t354 AC-002 移除 recent_sessions 的隐式 100 cap（provider 现在收到真实 limit），RECENT IPC 的 limit 直传 token-stats store query_sessions，无上界校验（SQLite LIMIT 巨大值等价不设限）。
- 影响：RECENT 请求超大数据量 limit 可触发全量拉取；当前无活跃调用方（renderer 传固定小 limit），理论风险。
- 根因：t354 移除默认 100 截断后未补上界校验；对齐 t353 的 parse_int_param 校验模式即可。
- 测试缺口：RECENT IPC limit 超大值应校验或钳制；补用例断言超大 limit 被拒或截断。
- 线索：t354 review_general.md f004。
- 处理：未开

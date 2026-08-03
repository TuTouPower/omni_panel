---
tid: "t190"
slug: "tokenstats_query_swr_cache"
title: "P1 代理面板查询缓存与切换静默刷新"
status: "done"
branch: "t190_tokenstats_query_swr_cache"
worktree: ""
review_level: "full"
diff_anchor: "fd910318fab9cdc0e025bdbdf02db51d0c0cc4a7"
depends_on: "t189"
conflicts_with: ""
note: "P1"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

- 在 renderer 新增 TokenStats 查询缓存，按 agent、platform、时间窗、metric、xaxis、gran 生成稳定 query key；缓存条目存储已组装的面板查询结果，不改变现有 IPC 返回结构。
- 使用有界 LRU（8 条）限制内存；fresh 命中直接复用，stale 条目保留旧数据并触发刷新；同 key、同 generation 的在途请求共享 Promise。
- collector 更新递增缓存 generation 并标记已有条目 stale；request id 继续负责最新选项可见性，避免旧请求覆盖新状态。
- 配置别名读取从统计数据加载路径拆出，仅在首次打开读取，并通过 `CONFIG_CHANGED` 广播同步。
- 按 TDD 补充 query cache 单元测试与 TokenStatsView renderer 测试，覆盖缓存命中、在途合并、LRU 淘汰、collector 静默刷新、配置读取隔离和别名广播。
- 已完成 targeted renderer tests、`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`；最终 code/test review 均 PASS，待执行 task finish。

### Round 5 (2026-08-03 09:10 UTC+8)

| finding_id     | severity  | status | rationale                                                                      | fix_ref                                                       |
| -------------- | --------- | ------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| t190_code_f001 | important | 已修   | 未缓存查询在已有面板数据时显示非阻塞刷新状态。                                 | src/renderer/views/TokenStatsView.tsx:336-346                 |
| t190_code_f002 | important | 已修   | 预设时间窗增加 TTL，并在筛选变化时重新检查过期范围。                           | src/renderer/views/TokenStatsView.tsx:218-253                 |
| t190_code_f003 | minor     | 遗留   | 展示维度仍进入底层查询 key，已登记后续优化。                                   | p026                                                          |
| t190_code_f004 | minor     | 已修   | fresh cache 命中不再重复提交整组面板状态。                                     | src/renderer/views/TokenStatsView.tsx:418-420                 |
| t190_code_f005 | important | 已修   | 预设时间窗在筛选变化时触发 TTL 重新检查，避免继续复用过期边界。                | src/renderer/views/TokenStatsView.tsx:218-253                 |
| t190_test_f001 | important | 已修   | 删除被就地改写的平台测试，恢复独立平台筛选测试，并将缓存命中行为放入独立测试。 | tests/unit/renderer/views/token_stats_view.test.tsx           |
| t190_test_f002 | minor     | 已修   | 独立缓存命中测试同步断言旧面板可见、无全屏 loading、IPC 次数不增加。           | tests/unit/renderer/views/token_stats_view.test.tsx           |
| t190_test_f003 | minor     | 已修   | 覆盖更新前已缓存的非当前 query 在 collector 更新后回访刷新。                   | tests/unit/renderer/views/token_stats_view.test.tsx:393-420   |
| t190_test_f004 | minor     | 已修   | 覆盖首次 config.get 返回别名并应用到首屏 BarChart。                            | tests/unit/renderer/views/token_stats_view.test.tsx:277-296   |
| t190_test_f005 | minor     | 已修   | 覆盖 renderer 8-entry LRU 的容量内命中与超限淘汰。                             | tests/unit/renderer/views/token_stats_view.test.tsx:422-472   |
| t190_test_f006 | minor     | 已修   | 按 agent、platform、range、metric、xaxis、gran、query_mode 逐维验证 key 隔离。 | tests/unit/renderer/lib/token_stats_query_cache.test.ts:66-86 |

## 收尾报告

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：targeted renderer/query-cache tests 37/37 通过；`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build` 均通过；review gate overall=PASS。

### Reviewer verdict

- Round 1 code：FAIL
- Round 1 test：FAIL
- Round 2 test：FAIL
- Round 3 code：PASS
- Round 3 test：FAIL
- Round 4 code：FAIL
- Round 4 test：PASS
- Round 5 code：PASS
- Round 5 test：PASS

### 结果摘要

新增 renderer TokenStats 有界 LRU/SWR 查询缓存、在途请求合并、collector stale 刷新、非阻塞刷新提示、配置别名同步与过期预设窗口重建；遗留展示维度缓存 key 优化登记为 `p026`。

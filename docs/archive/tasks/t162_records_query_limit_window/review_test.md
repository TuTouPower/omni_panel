# Task review t162（reviewer_focus: 测试）

- task：`t162_records_query_limit_window`
- spec：`docs/tasks/t162_records_query_limit_window/spec.md`
- diff_anchor：`43c6d1637387694101c1113bc138afa69d81df04`
- round：1
- reviewed_at：2026-07-30 22:25 UTC+8

## Findings

零 finding。

## AC 覆盖核对

| AC（spec L30-34）                                                      | 覆盖位置                                                                                                            | 结论 |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---- |
| `query_records` SQL 含 `LIMIT`，`filters.limit` 缺省时默认兜底（5000） | `token-stats-store.test.ts`：「applies an explicit limit」「applies a default limit」                               | OK   |
| `TokenStatsView.loadData` 向 `getRecords` 传入当前时间窗 start/end     | `token_stats_view.test.tsx`：「passes the current time window (start/end) to getRecords」                           | OK   |
| 渲染进程持有 records 数 ≤ limit                                        | 间接覆盖（store 层断言 `toHaveLength(DEFAULT_RECORDS_LIMIT)`；view 层 mock getRecords 不触达 store）                | OK   |
| 超 limit 时按 `ORDER BY timestamp DESC` 保留最新 N 条                  | 「applies an explicit limit」断言 `["m3","m2"]`；「respects limit alongside window filters」断言 `["m9","m8","m7"]` | OK   |
| 新增/更新单测覆盖 limit 下推（start/end 下推已有，不重复测）           | 同上                                                                                                                | OK   |

## 危险模式扫描（逐条）

| 模式                                           | 命中 | 调查结论                                                                                                                                                                                                                 |
| ---------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 弱化断言 `toBe → toContain / objectContaining` | 命中 | `token_stats_view.test.tsx:103/113/121/127` 把 `{}` / `{env}` 改为 `objectContaining(...)`。归因正当：实现现在向 getRecords 传 `start/end`，精确等价断言会失败。且新增第 5 个测试已严格验证 start/end 数值范围。非掩盖。 |
| 恒真断言 / 纯存在性                            | 无   | —                                                                                                                                                                                                                        |
| 删除/反转/注释 expect                          | 无   | —                                                                                                                                                                                                                        |
| 删测试块                                       | 无   | —                                                                                                                                                                                                                        |
| `.skip` / `.only`                              | 无   | —                                                                                                                                                                                                                        |
| `@ts-ignore` / `eslint-disable`                | 无   | —                                                                                                                                                                                                                        |
| mock 被测逻辑本身                              | 无   | view 测试 mock 的是 IPC 边界 `window.usageboard.tokenStats.getRecords` 与子组件，未 mock `TokenStatsView` 自身逻辑。                                                                                                     |
| 阈值掩盖                                       | 无   | 第 5 个测试用 `±5000ms` 容差比较 start/end，因 `Date.now()` 在 render 与断言间存在自然漂移，合理。                                                                                                                       |
| 条件跳过弱化断言                               | 无   | —                                                                                                                                                                                                                        |
| 程序赋值替代真实交互                           | 无   | platform 切换用 `user.click`；range 切换用 `user.click(screen.getByRole("button", { name: "7 天" }))`（按钮由 `TokenStatsView.tsx:324` 渲染，非 RangePicker mock 内）。                                                  |

## 测试可信评估

- **store 层**：直连 `:memory:` better-sqlite3，无 mock，通过实际 SQL 行为验证 LIMIT/ORDER BY。5005 行插入性能可接受。
- **view 层**：mock 在系统边界（IPC + 子组件），断言 `get_records` 被调用的参数形态——这是 AC 要求的用户可观察行为（IPC 契约）。
- **异步时序**：`waitFor` + `toHaveBeenNthCalledWith` 正确等待；第 5 个测试取 `mock.calls.at(-1)` 配合 `waitFor` 重试，无 race。

## 覆盖缺口（不出 finding，仅记录）

1. 「applies a default limit」插入的 5005 行未传 timestamp override（默认全为 `T0`），不断言顺序。若实现误对默认 limit 走 ASC 排序，此测试仍会通过。但该路径被 explicit limit 测试的 DESC 顺序断言间接覆盖（同一 SQL `ORDER BY timestamp DESC LIMIT @limit`），可信度足够。如需更强保证，可给循环里的 record 传 `timestamp: T0 + i` 并断言首条为 `m5004`。
2. `filters.limit = 0` 或负数/非法值未测，spec 也未要求。
3. view 第 1 个测试用 `objectContaining({})` 不校验 start/end 存在；但 start/end 传递由第 5 个测试专责覆盖，非掩盖。

## 结论

- 本轮新发现：0 条
- 总体判断：测试覆盖 spec 全部 AC，store 层直连真实 SQLite 验证 LIMIT/ORDER BY 行为，view 层在 IPC 边界正确验证 start/end 传递，危险模式扫描命中项均有正当归因，无掩盖或弱化。测试通过 34/34。

verdict: PASS

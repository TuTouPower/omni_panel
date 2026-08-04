# Task review t202（reviewer_focus: 代码）

- task：`t202_tokenstats_incremental_test_gaps`
- spec：`docs/tasks/t202_tokenstats_incremental_test_gaps/spec.md`
- diff_anchor：`89c91d5cf679a534be326fe6ea7f7f0f1993e834`
- target：`git diff 89c91d5cf679a534be326fe6ea7f7f0f1993e834`
- round：1
- reviewed_at：2026-08-04 13:50 UTC+8

## Findings

### t202_code_f001 - AC5 EXPLAIN 断言方向与注释矛盾，断言随优化器选择变脆

- 严重度：minor
- 锚点：行为缺陷——SQLite 对 `token_stats_hour_rollup` 改用 PK 索引（SEARCH）时断言 `SCAN token_stats_hour_rollup` 为 false，测试红，尽管「不 SCAN records」这一核心不变量仍满足
- 位置：`tests/unit/main/core/token-stats/token-stats-store.test.ts:1934`（注释）、`:1946`（断言）
- 问题：测试注释声称「the window resolves via the rollup table with indexed seeks」，断言却强制 `plan.some(d => d.includes("SCAN token_stats_hour_rollup"))` 为 true。实测 EXPLAIN 计划（better-sqlite3 12.10.0 内嵌 SQLite 3.53.1）：rollup 侧确为 `SCAN token_stats_hour_rollup`（无索引），records 侧为 `MULTI-INDEX OR / SEARCH ... idx_records_ts`。两处描述自相矛盾：注释描述的「indexed seeks」正是断言会使其失败的场景。AC5 的不变量是「命中 rollup 且不 SCAN records」，断言方向应与之对齐。
- 建议：断言改为 `plan.some(d => d.includes("token_stats_hour_rollup")) && !plan.some(d => d.includes("token_stats_records"))`，对 SEARCH/SCAN 两种计划形状均稳健；同步修正注释。

### t202_code_f002 - AC3 测试产生 React act(...) 未包裹警告

- 严重度：minor
- 锚点：测试反模式——异步状态更新落在 act 块外，可掩盖真实 re-render 时序
- 位置：`tests/unit/renderer/views/token_stats_view.test.tsx:586-605`（`updated_listener?.(1)` 在 `:593` act 块内触发，`first_pending.resolve` 在 `:603` 于 act 块外）
- 问题：运行该用例持续输出 `An update to TokenStatsView inside a test was not wrapped in act(...)`。`updated_listener` 触发后 loadData #2 的 `apply_query_data`/`setLoading` 等状态更新在 act 块结束后异步落板（微任务），未纳入 act。断言当前成立不依赖该时序，但属于 React 测试文档明确的反模式，且本文件既有用例无此警告，是本 diff 新引入。
- 建议：将事件触发与后续落板包裹进 `await act(async () => { updated_listener?.(1); })`（或合并等待），消除警告。

### t202_code_f003 - spec 已验证描述中 onUpdated 位置行号随本 diff 代码移动而过时

- 严重度：minor
- 锚点：文档同步——引用随实现漂移，未来读者按行号找不到逻辑
- 位置：`docs/tasks/t202_tokenstats_incremental_test_gaps/spec.md:73`
- 问题：spec 上下文区「已验证」描述注明 preload 解析逻辑在 `src/preload/index.ts:155-163`。本 diff 已把该逻辑抽出至 `src/preload/token-stats-events.ts`（`index.ts:156` 仅剩委托调用），行号引用过期。描述事实本身仍成立（逻辑确已被抽出并注明），仅位置标注失效。
- 建议：将行号引用更新为 `src/preload/token-stats-events.ts:13-25`（或去掉精确行号，仅留文件）。

## 结论

- 前轮 finding 复核：Round 1，无。
- 本轮新发现：3 条（均为 minor）。
- 未进表的提示：
    - 文件过大：`tests/unit/main/core/token-stats/token-stats-store.test.ts`（1969 行，本 task +148，≥1200 important 阈值）；`tests/unit/renderer/views/token_stats_view.test.tsx`（627 行，+23，≥600 minor 阈值）。两文件均已达阈值且本 task 继续净增，按降级规则仅在此列出，未出 finding。
    - `tests/unit/main/core/token-stats/token-stats-store.test.ts:1937` 的 EXPLAIN 用 `new Database(db_path, { readonly: true })` 内联连接未 `close()`，与同文件 `read_rollup`/`oracle_rollup` 的 try/finally close 模式不一致；better-sqlite3 依赖 finalizer 回收，Windows 下可能短暂占用句柄，`with_temp_store` 的 rmSync 重试已兜底，未构成可观测失败。
    - 圈复杂度：本 diff 未引入复杂函数（新钩子与各测试均为线性流程），无 ≥10/≥15 项。
- 总体判断：6 条 AC 全部有对应实现且可独立验证，生产改动仅行为保持的 `create_on_updated_subscriber` 最小提取，全量 `pnpm test` 206 文件 / 2152 用例绿，`tsc --noEmit` 干净；仅 3 条 minor，无未解决 critical/important。
- 系统性 follow-up：无。

verdict: PASS

## Round 2 (2026-08-04 14:01 UTC+8)

### Findings

本轮无新 finding。

### 结论

- 前轮 finding 复核（以 `git diff 89c91d5cf` 为准）：
    - **t202_code_f001（已消除）**：AC5 EXPLAIN 断言改为 `plan.some(d => d.includes("token_stats_hour_rollup"))` 为 true + `plan.some(d => d.includes("SCAN token_stats_records"))` 为 false，与建议方向一致；rollup 侧 SEARCH/SCAN 两种计划形状均命中（子串 `token_stats_hour_rollup` 同时匹配 `SCAN ...` / `SEARCH ...`），records 侧仅禁止全表 SCAN，恰好对齐 AC5 契约区原文「命中 `token_stats_hour_rollup` 且不 SCAN `token_stats_records`」，非弱化断言。注释已同步修正（`tests/unit/main/core/token-stats/token-stats-store.test.ts:1946-1949` 断言、`:1938-1942` 注释）。实测该用例绿。
    - **t202_code_f002（已消除）**：AC3 竞态用例将 `updated_listener?.(1)` 包进 `act(...)`、`first_pending.resolve` 包进 `await act(async () => { ...; await Promise.resolve(); })`（`tests/unit/renderer/views/token_stats_view.test.tsx:591-607`）。竞态语义保留：stale promise 仍在事件之后才 resolve，guard 丢弃路径仍被触发，「fresh 落板、stale 不覆盖」断言成立。跑全文件 19 用例无 `not wrapped in act(...)` 警告输出（grep 为空）。
    - **t202_code_f003（已消除）**：spec.md:73 对 preload 解析逻辑的引用去掉精确行号，改为 `src/preload/token-stats-events.ts` 文件级引用（f001 建议的两种处置之一）。main 侧 `src/main/index.ts:316` 引用经 grep 核验仍准确。
- 本轮新发现：0 条。
- 未进表的提示：
    - 文件过大（自 Round 1 无变化，仍仅结论列出）：`tests/unit/main/core/token-stats/token-stats-store.test.ts`（1970 行，本 task +152，≥1200 important 阈值）；`tests/unit/renderer/views/token_stats_view.test.tsx`（631 行，+27，≥600 minor 阈值）。
    - AC5 内联 `new Database(db_path, { readonly: true })`（EXPLAIN 用）仍未 `close()`，与 `read_rollup`/`oracle_rollup` 的 try/finally close 模式不一致；Round 1 已作非 blocking 观察，修复未触及，维持原判断（finalizer 回收 + rmSync 重试兜底，无可见失败）。
- 验证记录：AC3 用例、AC5 用例、`token_stats_events.test.ts`、`token-stats-store.test.ts` 全绿；`tsc --noEmit` exit 0；AC5/AC3 所在文件全量无 act 警告。自 Round 1 起的改动仅集中于上述 3 处测试/文档修复，未触及生产逻辑，Round 1 全量 206 文件 / 2152 用例绿的结论不受影响。
- 系统性 follow-up：无。

verdict: PASS

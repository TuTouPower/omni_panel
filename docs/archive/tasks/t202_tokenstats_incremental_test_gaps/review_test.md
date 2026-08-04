# Task review t202（reviewer_focus: 测试）

- task：`t202_tokenstats_incremental_test_gaps`
- spec：`docs/tasks/t202_tokenstats_incremental_test_gaps/spec.md`
- diff_anchor：`89c91d5cf679a534be326fe6ea7f7f0f1993e834`
- target：`git diff 89c91d5cf679a534be326fe6ea7f7f0f1993e834`
- round：1
- reviewed_at：2026-08-04 13:50 UTC+8

## Findings

（无 finding。本轮 0 条，全部 AC 由新增测试覆盖并通过，未命中危险模式。）

## 结论

### 验收标准逐条核对（实测为准）

- AC1（p032）✅ 新增 `token-stats-store.test.ts`「AC1 (p032): an incremental upsert of one session leaves the untouched session's rollup intact」：两 session 入库 → 断言 `read_rollup` 2 行 → 增量 upsert 仅触碰 s1 → `read_rollup == oracle_rollup`。oracle 公式 `(timestamp - ((timestamp + 28800000) % 3600000))` 与生产 `token-stats-store.ts:837/860` 增量重建一致；断言目标为存储可见状态（读库表），非 mock。缺 session_id 谓词的增量 delete 会清掉 s2 行 → oracle 不等 → 可捕获回归；no-op 增量同样被 oracle 差值捕获。✓
- AC2（p033）✅ 「AC2 (p033): a failing batch rolls back...」：正常批次后 version=1、`query_records` 1 行；注入 `message_id: undefined`（better-sqlite3 绑定为 NULL，触发 NOT NULL 约束抛错，已实测 `SqliteError - NOT NULL constraint failed`）→ `toThrow` 后 version 仍 1、records 仍 1。生产 `upsert_records` 用 `db.transaction` 包裹含 `bump_data_version_stmt`（`token-stats-store.ts:945-982`），断言证实整批回滚，非半提交。✓
- AC3（p034）✅ 新增 `token_stats_view.test.tsx`「AC3 (p034): an older in-flight response...」：deferred 挂起首查 → in-flight 时触发 `updated_listener?.(1)` → 二次请求先解出 "fresh" → 晚到 stale 解出 → 断言 `session-records` 含 fresh 不含 stale。真实 `load_request_id` guard（`TokenStatsView.tsx:318/378`）与真实 `query_cache` generation 双闸；stale 既被视图 guard 丢弃、又不回写缓存（generation 不匹配，`query-cache.ts:87-94`）。测试对 guard 有判别力：guard 若失效 stale 会落地 → 断言 `not.toHaveTextContent("stale")` 失败。✓
- AC4（p035）✅ 新增 `token_stats_events.test.ts`：对抽出的生产函数 `create_on_updated_subscriber`（`src/preload/token-stats-events.ts`）以 mock ipc 通道（系统边界）验证 7→8 顺序转发不错位、非 number 载荷归 0、unsubscribe 后事件不再投递。测试对象即生产函数（`index.ts` 的 `onUpdated` 已改为 `create_on_updated_subscriber(ipcRenderer)`），行为等价抽取。✓
- AC5（p036）✅ 「AC5 (p036)」：backfill 置 ready 后，`on_sql`（既有生产钩子，`token-stats-store.ts:1208-1214`）捕获 window 物化 SQL，断言含 `token_stats_hour_rollup` 与边缘带谓词；再对真实 SQLite 跑 `EXPLAIN QUERY PLAN`。已独立复现实际计划：`SCAN token_stats_hour_rollup` 存在、records 侧为 `SEARCH token_stats_records USING INDEX idx_records_ts`（非 SCAN），断言 `SCAN token_stats_records` 缺席成立。若生产退化为全窗口读 records → 计划出现 records SCAN → 测试红；若 rollup 中间带丢失 → 物化 SQL 无 rollup 表 → 测试红。双向可判别。✓
- AC6（p037）✅ 「AC6 (p037)」：`store1` backfill 置 ready → `close` → 重新打开同 db 文件 → ready 仍 true → 再增量 upsert → `read_rollup == oracle_rollup`。真实文件（WAL 二连接可读）验证持久化。✓
- AC7 ✅ 实测 `pnpm test` 全量：206 文件 / 2152 通过、1 skipped（`opencode_go.test.ts`，锚点已存在，与本 diff 无关）。另实测 `tsc --noEmit` 通过（生产 preload 重构未破坏类型）。

### 危险模式扫描

逐条已查，均无命中：恒真断言（`expect(materialize).toBeTruthy()` 后接 `throw` 守卫且后续有真断言，非证据）、删/反转 expect、注释断言、弱化断言（全部精确：`toEqual` / `toHaveBeenCalledWith(7)` / `toHaveTextContent` / 精确计划文本）、删测试、`.skip`/`.only`（新增为零）、静默错误（新增文件无 eslint-disable/ts-ignore；`token-stats-store.test.ts` 顶部 eslint-disable 为锚点既有）、mock 误用（仅 mock 系统边界：ipc 通道 / IPC bridge，未 mock 被测逻辑）、阈值掩盖（AC3 的 20ms 为确定性 microtask 顺序后的 settle buffer，非失败掩码，与既有测试 364 行同款）、条件跳过、程序赋值替代交互（`updated_listener?.(1)` 即事件进入视图的接口本身）、存在即通过（均有行为断言）。

### 改测方向复核

无。diff 对既有测试仅作**纯新增**（store 测试尾部追加 describe、视图测试插入新 `it`），零处修改既有断言预期；不构成迁就实现的改测。

### 前轮 finding 复核

Round 1，无前轮。

### 本轮新发现

0 条。

### 未进表的提示

- AC3 测试存在 React `act()` 警告（async 重验证状态更新在 act 外落地）；与既有测试（313 行 "keeps the previous DTO visible..."）同款模式，断言经 waitFor + settle buffer 稳定，不构成掩码，不入 finding。
- AC5 的 EXPLAIN 计划文本断言随 SQLite 版本可能变脆；spec「风险与回退」已明示并接受，不入 finding。
- AC1 的 `toHaveLength(2)` 仅作前置 sanity（不区分增量与整表重建机制），真正的 AC 判据为后续 oracle 相等，机制属实现细节非可观察契约，不补。

### 总体判断

6 条测试缺口全部补齐，全部断言用户可观察行为、触达真实生产实现，实测全量绿；无 blocking 亦无 minor。

### 系统性 follow-up

无。

verdict: PASS

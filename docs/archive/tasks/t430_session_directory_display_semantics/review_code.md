# Task review t430（reviewer_focus: 代码）

- task：`t430_session_directory_display_semantics`
- spec：`docs/tasks/t430_session_directory_display_semantics/spec.md`
- diff_anchor：`71017ee49c588b034cb03ad3a70931e244054ca5`
- target：`git diff 71017ee49c588b034cb03ad3a70931e244054ca5`
- round：1
- reviewed_at：2026-08-17 00:40 UTC+8

## Findings

### t430_code_f001 - AC-001 测试第二断言未真正覆盖 records 路径，注释与实际路径不符

- 严重度：minor
- 锚点：AC-001（测试验证完整性；实现行为本身正确）
- 位置：`tests/unit/main/core/token-stats/token-stats-store.test.ts:2334-2338`
- 问题：注释称「与 records 路径（rollup 未 ready）一致」，但 `hour_rollup_ready` 持久化在 `token_stats_meta` 表（`INSERT ... ON CONFLICT(id) DO NOTHING`，重开连接不重置，`token-stats-store.ts:171-176`）。同一 db 文件上新建的 `fresh` store 读到的 `hour_rollup_ready=1`（`get_rollup_ready_stmt`，`token-stats-store.ts:1065-1067,1488-1490`），`query_dashboard` 仍走 rollup 路径。故第二断言与第一断言验证的是同一路径，AC-001「与 records 路径一致」未真正被测试覆盖——该一致性仅由代码走查成立（records 路径 `from_records=true` 分支 `rn=1` + `ORDER BY timestamp DESC` 取最新记录目录，`token-stats-store.ts:731-742`）。测试可复现路径：`pnpm exec vitest run tests/unit/main/core/token-stats/token-stats-store.test.ts`（105 passed，断言全绿即证实两断言同路径）。
- 建议：仿同文件 t387「matches the records fallback after backfill」模式（`token-stats-store.test.ts:2207-2222`），在 `backfill_hour_rollup()` 前先用同一 store 记录 before（records 路径），再与 rollup ready 后对比；或删除第二断言并修正注释，避免误导。

### t430_code_f002 - rollup 与 records 路径「最新记录」决胜条件不一致（同 timestamp 边界）

- 严重度：minor
- 锚点：AC-001（极端输入下两路径展示可能不一致）
- 位置：`src/main/core/token-stats/token-stats-store.ts:690`（rollup 窄查 `ROW_NUMBER() OVER (ORDER BY timestamp DESC, rowid DESC)`）vs `:734`（records 路径 `ROW_NUMBER() OVER (PARTITION BY ... ORDER BY timestamp DESC)`，无 rowid 决胜）
- 问题：同 session 两条记录 timestamp 完全相同时，rollup 路径取 rowid 较大者为「最新」，records 路径对平局未定义（SQLite 扫描序，通常亦为 rowid 但非契约）。若两记录 directory 不同，两路径 directory（及 title）展示可不一致，违反 AC-001「与 records 路径一致」的字面要求。失败场景：`upsert_records` 两条同 session、同 timestamp、不同 directory 的记录，backfill 后 rollup 路径与未 backfill 的 records 路径展示不同目录。注：title 自 t351 起即存在同形决胜（非 t430 新引入），t430 将 directory 纳入同一取数逻辑，未新增分叉类别；本场景属极端输入（毫秒级同戳跨目录），无数据损坏。
- 建议：records 路径 `ORDER BY timestamp DESC` 后补 `, rowid DESC` 对齐（一行改动），或作为 follow-up 登记。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：2 条（均为 minor）
- 未进表的提示：
  - 文件过大（降级规则，不进 finding 表）：`src/main/core/token-stats/token-stats-store.ts` 1686 行（实现源码超 800 阈值；本 task 净增 +7，未继续堆大）；`tests/unit/main/core/token-stats/token-stats-store.test.ts` 2918 行（测试源码超 1200 阈值；本 task 净增 +69）。
  - 复杂度：无新增大分支函数（`pathBasename` CC≈2；`materialize_session_meta` 分支结构未变）。
  - 范围外观察：demo build 存量损坏（mockSessions 缺失）已登记 p202，非本 task 引入，本次未修复；AC-004~007 验证以 `.scratch/test_cwdpath.mjs` 行为输出与代码走查为准。
- 总体判断：两条 AC 侧实现（store 最新目录语义、CwdPath basename + title）均正确落地且测试绿；仅 2 条 minor（测试断言路径标注误导、极端同戳决胜差异），无未解决 critical / important，可 PASS。
- 系统性 follow-up：建议（非阻断）「records 路径最新记录决胜对齐 rowid」slug `records_latest_tiebreak_rowid`；demo 测试基建缺口已有 p202。

### AC 复验方式

- AC-001：`re_verified`。重跑 `pnpm exec vitest run tests/unit/main/core/token-stats/token-stats-store.test.ts`（105 passed，含新 t430 AC-001 用例）；代码走查 `materialize_session_meta` rollup 分支窄查 SELECT directory + UPDATE 写回 + `dashboard_session_page_from_meta` MAX(directory)（store:686-722,792）。注：用例第二断言实际重复验证 rollup 路径，records 路径一致性由代码走查确认（见 f001）。
- AC-002：`re_verified`。新用例断言单 directory 会话 directory 不变（test:2344-2367）+ 走查单 directory 路径不受 UPDATE 影响。
- AC-003：`re_verified`。新用例断言 `sessions.total=2`（test:2364）；走查 total 的 COUNT(GROUP BY session_id) 与分页 LIMIT/OFFSET SQL 未变（store:785-801）。
- AC-004：`re_verified`。运行 `.scratch/test_cwdpath.mjs` 7/7 PASS（含 `/home/…/repo_template` → `repo_template`）；走查 `pathBasename` 实现（CwdPath.tsx:5-12）。
- AC-005：`re_verified`。走查 `title={cwd}` 保留完整路径（CwdPath.tsx:30）。
- AC-006：`re_verified`。grep 确认 4 处使用点（SessionCard/SessionPane/RecentSessionsModal/SessionPickerModal）全部移除 `max` prop、渲染统一走 `pathBasename`，无第 5 处引用；SessionCard filePath 行在 diff 中未触及。注：实际渲染视觉效果未人工 UI 验证（demo build 存量损坏，见 p202）。
- AC-007：`re_verified`。`.scratch/test_cwdpath.mjs` 根路径 `/` 与空串用例 PASS；走查 `if (!cleaned) return path` 兜底（CwdPath.tsx:7-8）。

coverage = 7/7

reviewed_scope: 4131e1ec9c03d35f

verdict: PASS

## Round 2 (2026-08-17 09:55 UTC+8)

### 前轮 finding 复核（以当前 diff 为准）

- **f001（minor，AC-001 测试第二断言假对照）——已消除**。修复后测试改为同 store 内「backfill 前先查 records 路径」：`before = store.query_dashboard(...)` 在 `backfill_hour_rollup()` 前执行（test:2319-2322）。真实性链：`hour_rollup_ready` 每次调用实时查 `token_stats_meta` 表（store:1488-1490），`with_temp_store` 每次 `mkdtempSync` 新 db 文件（test:94-98）meta 默认 0，store 创建/`upsert_records` 均不自动 backfill（`backfill_hour_rollup` 仅显式调用，store:1652-1664）→ before 必走 records 路径（store:1501 `materialize_session_meta(..., !rollup_ready)`，`from_records=true`），after 走 rollup 路径。`expect(session_before?.directory).toBe("/aaa")` 与 `expect(session?.directory).toBe(session_before?.directory)` 构成真对照，断言不再是恒真。与 t387「matches the records fallback after backfill」同模式（test:2207-2222）。
- **f002（minor，records 路径决胜缺 rowid）——已消除**。records 路径 `ROW_NUMBER() OVER (PARTITION BY source, env, session_id ORDER BY timestamp DESC, rowid DESC)`（store:734）与 rollup 窄查 `ROW_NUMBER() OVER (ORDER BY timestamp DESC, rowid DESC)`（store:690，逐 session 窄查故全局排序即 session 内排序）决胜条件对齐：同 timestamp 平局均取 rowid 较大者。AC-001「两路径一致」在极端同戳跨目录输入下成立。

### 本轮新发现

0 条。

### 修复引入问题扫描（无 finding）

- `update_stmt` 7 占位（title/directory/started_at/ended_at/source/env/session_id）与 `run` 实参顺序一致（store:696-721）；`meta_stmt` SELECT 列序 title, directory, started_at, ended_at 与类型断言一致（store:686-709）。
- UPDATE 仅改 title/directory/started_at/ended_at，`session_meta` 聚合列（SUM calls/tokens）不受影响；rollup 路径同 session 多 directory 行统一为最新目录后 `MAX(directory)` 即最新目录（store:711-712 注释准确）。
- row=undefined 边界（窄查窗口内被过滤无记录时保留 window_rows 原 directory）：`window_rows` 构建（store:542-550）与 `meta_stmt` 过滤条件（store:670-684）同源同构（agent/platform/model_where 均展开），无实际触发路径；且与 t351 title 同路径行为一致，非 t430 新引入类别。
- 测试注释「修复前 MAX(directory) 字典序 → /zzz（错）」准确描述修复前行为，无误导。

### AC 复验方式（本轮增量，其余同 Round 1）

- AC-001：`re_verified`。定向重跑 `pnpm exec vitest run tests/unit/main/core/token-stats/token-stats-store.test.ts` → 105 passed（含改写后 AC-001 用例）；代码走查两路径决胜条件一致（store:690,734）与同 store before/after 真对照（test:2319-2326）。前轮「records 路径一致性仅靠代码走查」缺口已闭合。
- AC-002/AC-003：`re_verified`。同用例断言单 directory 不变与 `sessions.total=2`（test:2344-2367）。

coverage = 7/7

### 未进表的提示

- 文件过大（降级规则）：`src/main/core/token-stats/token-stats-store.ts` 1686 行、`tests/unit/main/core/token-stats/token-stats-store.test.ts` 2921 行；本 task 相对 anchor 净增 +7/+69，未继续堆大，同 Round 1。
- 复杂度：本轮未新增分支函数。
- demo 部分（CwdPath.tsx + 4 使用点 + SessionCard）相对 anchor 与 Round 1 复核时一致，本轮无改动，不重复审。

### 总体判断

前轮 2 条 minor 均按建议修复且修复未引入新问题；定向测试 105 passed。无未解决 critical / important，可 PASS。

- 系统性 follow-up：无新增（Round 1 建议的 rowid 决胜 follow-up 已随 f002 修复吸收）。

reviewed_scope: dde6569729266707

verdict: PASS

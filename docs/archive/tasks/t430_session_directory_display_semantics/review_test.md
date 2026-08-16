# Task review t430（reviewer_focus: 测试）

- task：`t430_session_directory_display_semantics`
- spec：`docs/tasks/t430_session_directory_display_semantics/spec.md`
- diff_anchor：`71017ee49c588b034cb03ad3a70931e244054ca5`
- target：`git diff 71017ee49c588b034cb03ad3a70931e244054ca5`
- round：1
- reviewed_at：2026-08-16 16:45 UTC+8

## Findings

### t430_test_f001 - t430 AC-001 测试「records 路径对照」实际未走 records 路径（fresh store 仍 rollup-ready），一致性半条 AC 无真实测试

- 严重度：important
- 锚点：AC-001「rollup ready 路径下跨多 directory 会话的 directory 展示与 records 路径一致（取最新记录目录）」——一致性半条无测试证据
- 位置：`tests/unit/main/core/token-stats/token-stats-store.test.ts:2336-2338`（"t430 AC-001" 用例后半段）
- 问题：用例在 `store.backfill_hour_rollup()` 之后新建 fresh store 复查 directory，注释称「与 records 路径（rollup 未 ready）一致」。但 `backfill_hour_rollup` 将 `hour_rollup_ready=1` 持久化进 DB（`src/main/core/token-stats/token-stats-store.ts:1060`，事务内 `mark_rollup_ready_stmt.run()`），`is_hour_rollup_ready` / `query_dashboard` 均从同一 DB 读该标志（`:1489-1490` / `:1647-1649`）。实测（`.scratch/verify_t430_records_path.mts`，tsx 直跑真实 store）：upsert 后 `ready=false`，backfill 后 `ready=true`，同 DB fresh store `ready=true`。故 2338 行断言与 2333 行断言走的是**同一条 rollup 路径**，第二次查询未提供任何独立证据；records 路径（`materialize_session_meta` `from_records=true` 分支）的 directory 语义在本测试文件中无任何断言（全文件 `directory` 断言仅 `:173`（query_sessions）、`:822`（query_rollup）、`:2333/:2338/:2363`（本 task 新增，均 rollup 路径））。若 records 路径 directory 语义回归（如改为字典序或首记录），本套测试仍全绿，AC-001 的「两条路径一致」承诺被静默破坏。
- 建议：仿照同文件 t387 AC-001 用例（`:2225-2261`）的既有模式——同一 store 内先 `query_dashboard`（此时未 backfill，走 records 路径）记录 `before.directory`，再 `backfill_hour_rollup()` 后 `query_dashboard` 断言与 `before` 一致；或删除 fresh store 半段并如实修改注释。最小修复：把 fresh store 替换为 backfill 前的同 store 查询。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：N/A（本轮为 Round 1）
- 改测方向复核：无。diff 仅新增测试（`token-stats-store.test.ts` +69 行），未修改任何既有测试；无「断言迁就实现」迹象。新增断言均为精确值 `toBe`。
- 本轮新发现：1 条（f001，important）
- 未进表的提示：
  - `pathBasename` 中 `last ?? path`（`public/frontend_demo/app/src/components/CwdPath.tsx:11`）为死代码——非空字符串 split 后数组恒非空，`??` 分支不可达；风格 minor，不入表。
  - t430 AC-002/AC-003 用例只断言 `dto.sessions.total===2` 与单 directory，未直接断言翻页 offset/limit；分页 SQL 未被本 diff 改动，既有 t192 形状用例（`tests/unit/...:2141-2142` 含 `session_offset/session_limit`，low/high 双密度对比）覆盖分页行为，不构成缺口。
  - demo 侧 AC-004~007 无自动测试（可测试性声明 + 有意不测已声明），以 `.scratch/test_cwdpath.mjs` 行为验证 + 代码走查代替；`pnpm build`（demo 包）因存量损坏（p202：mockSessions 缺失，非本 task 引入）无法执行，未尝试修复。
- 总体判断：实现与测试主体可信（定向测试 105/105 通过），唯一 blocker 为 f001 的 records 路径对照形同虚设——AC-001 一致性半条未被真正验证；修复方式简单明确。其余 AC 均有有效测试或行为验证。
- 系统性 follow-up：无新建议。demo build 存量损坏已有条目 p202（`docs/pending/todo/p202_demo_build_broken_missing_mock_sessions.md`），不重复报告。

### AC 复验方式

- AC-001：`re_verified`。重跑定向 vitest（105/105 通过）；代码走查 `materialize_session_meta` from_records=false 分支（`token-stats-store.ts:706-724`，meta_stmt rn=1 取最新记录 directory 并 UPDATE 同 session 全部行）+ 直接断言 rollup 路径 `/aaa`（非字典序最大 `/zzz`）成立。但「与 records 路径一致」半条经实证为假对照（见 f001），复验发现缺陷而非通过。
- AC-002：`re_verified`。新增用例断言单 directory 会话展示 `/proj/one`（rollup 路径）。
- AC-003：`re_verified`。新增用例断言 `total===2` 不膨胀；`dashboard_session_page_from_meta` 分页 SQL 未改动，既有 t192 形状用例覆盖 offset/limit。
- AC-004：`re_verified`。代码走查 `pathBasename` + 复跑 `.scratch/test_cwdpath.mjs` 7 用例全 PASS（含 `/home/…/repo_template → repo_template`、尾斜杠、Windows 反斜杠）；demo build 因 p202 未跑。
- AC-005：`re_verified`。代码走查 `title={cwd}`（`CwdPath.tsx:30`）保留完整路径，悬浮展示未受影响。
- AC-006：`re_verified`。Grep 确认 4 处使用点（SessionCard:114 / SessionPane:168 / RecentSessionsModal:164 / SessionPickerModal:177）全部去掉 `max` prop、统一走 `pathBasename`；SessionCard filePath 行（`:115`）className 与渲染未变。
- AC-007：`re_verified`。`.scratch/test_cwdpath.mjs` 根路径 `"/" → "/"`、空串 `"" → ""` PASS；代码走查 `!path` 早退 + 去尾斜杠后空串回退原值，无崩溃路径。

coverage = 7 / 7

reviewed_scope: 4131e1ec9c03d35f

verdict: FAIL

## Round 2 (2026-08-17 09:55 UTC+8)

### 前轮 finding 复核（以当前 diff 为准）

- **t430_test_f001（important，已消除）**。修复后 AC-001 用例改为同 store 内 backfill 前先查（`tests/unit/main/core/token-stats/token-stats-store.test.ts:2326-2334`）：
  - before 查询确走 records 路径：建库默认 `hour_rollup_ready=0`（`token-stats-store.ts:173-175`，`INSERT ... VALUES (1, 0)`），`query_dashboard` 读同表标志（`:1488-1490`）得 `rollup_ready=false` → `dashboard_records_source` + `materialize_session_meta(from_records=true)`（`:1497-1501`）。fresh store 无持久化标志干扰，真对照成立。
  - after 查询走 rollup 路径：`backfill_hour_rollup()` 置 1 后，meta_stmt 窄查 `ORDER BY timestamp DESC, rowid DESC` rn=1 取最新记录 directory 并 UPDATE 同 session 全部行（`:685-700`）；`dashboard_session_page_from_meta` 按 session 去重 + `MAX(directory)`（`:785-801`，t387 既有）返回统一后的最新值。
  - 断言质量：`/aaa` 非字典序最大（锚定「最新记录」而非 MAX(directory)），`session.directory === session_before.directory` 是两独立路径的一致性断言，前两行已分别锚定 `/aaa`，非恒真。
- **t430_code_f002（code 侧，顺带确认）**：records 路径决胜键已加 `rowid DESC`（`:734`），与 rollup 窄查 meta_stmt（`:690`）决胜规则一致，两路径「最新记录」语义确定。测试当前用例用不同 timestamp 构造「最新 ≠ 字典序最大」，未直接覆盖同 timestamp 决胜，不构成缺口。

### 改测方向复核

无「迁就实现」的改测。AC-001 用例断言值未变（仍 `/aaa`），仅将假对照（fresh store 复查）重构为真对照（backfill 前同 store 查询），符合 TDD「新增覆盖新语义」方向；AC-002/003 为纯新增。无旧测试预期被改写。

### 本轮新发现

0 条。

### 未进表的提示

- 同 timestamp 记录的「最新」由 rowid 决定（后 upsert 者胜），两路径已语义一致但无专门测试；当前 fixture 刻意错开 timestamp，属可选覆盖扩展（minor），不阻断。

### AC 复验方式（本轮变更项）

- AC-001：`re_verified`。重跑定向 `pnpm exec vitest run tests/unit/main/core/token-stats/token-stats-store.test.ts`，105/105 通过；代码实证（见 f001 复核）确认 before 走 records 路径、after 走 rollup 路径、断言 `/aaa` 与两路径一致。修复前该条目为「复验发现缺陷」，现为「复验通过」。
- 其余 AC（002~007）无新 diff 相关变更，沿用 Round 1 复验结论。

coverage = 7 / 7（AC-001 本轮更新为通过态）

reviewed_scope: dde6569729266707

verdict: PASS

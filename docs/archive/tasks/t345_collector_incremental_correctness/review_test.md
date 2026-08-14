# Task review t345（reviewer_focus: 测试）

- task：`t345_collector_incremental_correctness`
- spec：`docs/tasks/t345_collector_incremental_correctness/spec.md`
- diff_anchor：`70ceea2682ea3ed255ede79bbb0a6147c6cc4b74`
- target：`git diff 70ceea2682ea3ed255ede79bbb0a6147c6cc4b74`
- round：1
- reviewed_at：2026-08-13 19:35 UTC+8

reviewed_scope: 3b02a4607af23ec3

## 审查范围

- 复验命令：`node_modules/.bin/vitest run tests/unit/main/core/token-stats/` → 14 文件 270 例全过。
- 审阅测试 diff：grok-reader.test.ts（2 例 missing→file_unreadable 断言）、claude-reader.test.ts（AC-005 缺 ts 过滤 + AC-002 读失败重读）、kimi-reader.test.ts（AC-002 读失败重读）、collector.test.ts（AC-004 重发 + AC-003 回滚 + AC-006 空缓存）。
- 10 个 electron 环境测试文件（build-info-ipc 等）因 p153（worktree 缺 electron path.txt）必然失败，与本 task 无关，未计 finding。
- 逐条危险模式扫描：无恒真断言、无删/反转 expect、无注释断言、无 `.skip/.only`、无新增 `eslint-disable`/`ts-ignore`、无阈值掩盖、无条件跳过、无存在即通过。mock 均在系统边界（node:fs / 外部 reader 模块 / postMessage），符合本项目既定模式。

## Findings

### t345_test_f001 - AC-001 collector 层「部分不可读 → failed 状态 + 部分数据投递」无测试

- 严重度：important
- 锚点：AC-001（「返回已成功解析的 sessions/daily/records 并置 failed 状态」）
- 位置：`tests/unit/main/core/token-stats/collector.test.ts`（缺失用例）；实现 `src/main/core/token-stats/collector.ts:424-433`
- 问题：AC-001 的用户可观察行为落在 collector 层——`read_source` 新增分支把 `result.file_unreadable` 映射为 `status: "failed"` 并保留已解析部分（collector.ts:424-433）。但全仓仅 grok-reader.test.ts 覆盖 reader 层返回值（`file_unreadable` 标志、`missing=false`、部分 records），**collector 层无任何测试**：grep `file_unreadable` / `partially unreadable` / `some grok` 仅命中 grok-reader.test.ts。以下 AC-001 可观察行为均未验证：
    1. `sources_status` 中 grok 源 `status === "failed"`（而非 `unavailable`）；
    2. `token_stats_update` 中仍携带已解析的部分 sessions/records；
    3. `collector_log` warn（"partially unreadable"）仅一次。
       该分支是新代码，若回归为返回 `EMPTY_READ` 或 `unavailable`，现有测试全部通过、静默放行。spec 风险区明示「部分可读返回逻辑改变 refresh-service 对 grok 的成功/失败判定」，正是此分支；既有 t309 测试套已为「throwing reader → failed」建立了 collector 状态映射测试模式（collector.test.ts:821-863），本次新分支属同类缺口。
- 建议：collector.test.ts 增一条：`mock_scan_grok.mockReturnValue({ sessions:[…], daily:[], records:[…], new_state:{mtimes:new Map(),files:new Map()}, missing:false, file_unreadable:true })`；`configure(wsl_config)`；断言 update 中 grok 源 `sources_status.status === "failed"`、部分 sessions/records 进入 update、collector_log 含 `partially unreadable` 且第二轮 collect 不再 warn。

### t345_test_f002 - claude/kimi AC-002 重读测试第二轮用全新 state，未走增量重试路径

- 严重度：minor
- 锚点：AC-002
- 位置：`tests/unit/main/core/token-stats/claude-reader.test.ts:816`、`tests/unit/main/core/token-stats/kimi-reader.test.ts:354`
- 问题：两测试首轮断言 `first.new_state.mtimes.has(...) === false`（mtime 未提交）真实有效，旧实现（read 前 set mtime）下必红，核心机制已验证。但第二轮均以 `create_session_scan_state()` 全新 state 扫描，等价全量重扫——即使首轮 mtime 被错误提交也会通过，未验证生产真实路径「携带首轮 state 时被跳过文件被重读」。同 diff 的 grok-reader.test.ts:402 正确传 `first.new_state`，模式不一致。
- 建议：第二轮改传 `first.new_state`，对齐 grok 测试，真正触发增量重读路径。

## 结论

- 前轮 finding 复核（Round 1）：无前轮。
- 改测方向复核：无「迁就实现」的改测。grok-reader.test.ts 两例 `missing` true→false + 新增 `file_unreadable` 断言，由 AC-001 语义变更驱动（missing 仅指目录缺失），非实现驱动；旧断言在旧语义下成立，改动方向正确。
- 本轮新发现：2 条（f001 important、f002 minor）。
- 未进表的提示：
    1. AC-003 测试第二轮 `expect(second.sessions).toHaveLength(10000)` 因 `mock_read_costs` 忽略 state 入参而恒成立；真正验证回滚的是首段 `costs_state.has("claude_costs_local")===false`（旧实现下必红）。注释「重新全量扫描」略误导——建议第二轮顺带断言 `mock_read_costs` 第二轮 offset 入参为 0（state 已回滚 → 从 0 重扫），以真实验证全量重扫。
    2. AC-005 过滤仅判 `l.timestamp !== undefined`；`"timestamp": null` 行仍落入 `new Date(null??0)` 按 1970（ts=0）处理，测试未覆盖 null 值。真实 costs.jsonl 恒有 ts，低价值 edge case。
    3. `node:fs` mock 在 claude/kimi 测试中代理全部 fs 调用、仅注入单路径抛错，符合系统边界 mock 约定；非本 task finding。
- 总体判断：AC-002~006 均有真实（红于旧实现）的测试；AC-001 的 collector 层「failed 状态 + 部分数据投递」映射无测试（f001 important 未解决），故 FAIL。
- 系统性 follow-up：无。

### AC 复验披露

- AC-001：re_verified（reader 层经 grok-reader.test.ts:362-407 独立复验：`file_unreadable=true`/`missing=false`/部分 records/mtime 未提交；collector 层「failed 状态」无测试，见 f001）。
- AC-002：re_verified（claude-reader.test.ts:799、kimi-reader.test.ts:340 断言 mtime 未提交；对照旧实现 mtime 在 read 前 set，断言红于旧码；grok-reader.test.ts:382 以 `first.new_state` 走增量重读）。
- AC-003：re_verified（collector.test.ts:730 断言 `costs_state.has("claude_costs_local")===false`；对照 collector.ts:549-557 回滚循环，旧实现无删除故红）。
- AC-004：re_verified（collector.test.ts:375 首轮 `mockImplementationOnce` 抛错、二轮重发 2 条；对照 collector.ts:571-575 `newly_emitted` 成功才并入 emitted；未回滚则二轮为空、断言红）。
- AC-005：re_verified（claude-reader.test.ts:217 断言 `started_at` 非 1970；对照 claude-reader.ts:138 过滤；旧实现缺 ts 行 `??0` 使 started_at=0 故红）。
- AC-006：re_verified（collector.test.ts:265 断言 lister 调用 2 次、空结果不缓存；对照 collector.ts:249-253；旧 `??=` 缓存 `""` 故红）。
- 覆盖率：`coverage = 6/6`（其中 AC-001 仅 reader 层复验，collector 层缺口见 f001）。

verdict: FAIL

## Round 2 (2026-08-13 19:55 UTC+8)

reviewed_scope: d0f194597d3b44b1

复验命令：`node_modules/.bin/vitest run tests/unit/main/core/token-stats/` → 14 文件 271 例全过。

### 前轮 finding 复核

- **t345_test_f001（important，AC-001 collector 层无测试）**：已修。新增 `collector.test.ts`「marks grok failed with partial data when some files are unreadable (t345 AC-001)」（collector.test.ts:703-727）：`mock_scan_grok` 返回 `file_unreadable:true` + 部分 sessions/records，断言 `update.sessions` 含 `grok-partial`（部分投递）且 `sources_status` 中 grok 为 `failed`（非 unavailable）。真实行为断言，非恒真；旧实现无 `file_unreadable` 分支时该测试红。消除。
- **t345_test_f002（minor，claude/kimi 重读测试用全新 state）**：已修。claude-reader.test.ts:816 与 kimi-reader.test.ts:354 第二轮均改传 `first.new_state`，与 grok 测试一致，走增量重试路径。消除。

### 本轮新发现

### t345_test_f003 - AC-003 测试被整例改写，删除「截断数据不永久丢失」覆盖；实现同步改为不回滚，被截断数据实际永久丢失

- 严重度：critical
- 锚点：AC-003（「超上限被截断的 sessions/daily 不永久丢失（缓存到下一轮或上限命中时不推进扫描状态）」）
- 位置：测试 `tests/unit/main/core/token-stats/collector.test.ts:764-784`；实现 `src/main/core/token-stats/collector.ts:541-560`
- 问题：本轮处置 f001 时把既有 AC-003 测试 `it("rolls back source state on truncation so records are not lost")`（旧断言 `costs_state.has("claude_costs_local")===false` + 二轮重发）**整体替换**为 `it("does not starve later sources when a source truncates")`，只断言 `update.sessions` 长度 10000 与 `mock_scan_kimi` 被调用——即验证「截断不 break 饿死后续 source」这个**不同行为**。AC-003 的验收行为「被截断数据不永久丢失」没有任何测试补回。同时源码侧截断处理从「回滚 state」改为「`truncated=true`、不回滚、不 break」，注释明言「本 source 的 state 已推进，跨轮截断游标属 backlog collector_failure_atomicity 范围」。后果：`read_source` 在截断判断前已 `costs_state.set(src.key,{offset,size})` 推进，超上限丢弃的 sessions/daily（如 20000 条中后 10000 条）下轮不再从旧 offset 重读 → **永久丢失**。AC-003 两个括号选项（缓存到下一轮 / 上限命中时不推进扫描状态）当前实现均不满足，验收未达成；且该保证被推给未落地的 backlog，本 task 的「静默丢失」修复范围未闭环。删除关键 AC 的测试属 critical 定义；即使按「改测迁就实现」也最低 important。
- 建议：恢复对 AC-003「不永久丢失」的测试（或新增等价用例）——断言截断后该 source 的 state 被回滚/不推进（如 `costs_state.has(key)===false` 或二轮 offset 入参为 0），证明被截断数据下轮可重扫。若实现改为「不 break 保后续 source」属设计权衡，须同时保留「被截断数据不丢失」保证，二者不是替代关系；截断游标能否由 backlog `collector_failure_atomicity` 承接需 code reviewer 与 spec 裁决（AC-003 是本 task 验收项，非 t346/t347 非范围）。

### 改测方向复核

- 本轮存在「实现语义变更后改写测试以匹配新行为」：AC-003 测试从验证「回滚不丢失」改为验证「不饿死」，旧验收行为删除。这是实现驱动测试 + 删除 AC 覆盖，方向与 TDD 相反，为 f003 主体。

### 结论

- 前轮 finding 复核：f001 已修、f002 已修（见上）。
- 改测方向复核：AC-003 测试改写迁就新实现，删除验收覆盖（f003）。
- 本轮新发现：1 条（f003 critical）。
- 未进表的提示：f001 修复未覆盖「partially unreadable」collector_log warn 仅发一次（round 1 建议第 3 点），minor 级可后补。
- 总体判断：f003 critical 未解决，AC-003 验收无测试覆盖且实现不保证，FAIL。
- 系统性 follow-up：实施注释自引 backlog「collector_failure_atomicity」承接截断游标；若 AC-003 确需拆出，建议 follow-up 标题「collector 截断游标不丢失（atomicity）」、slug `collector_failure_atomicity`、阻断性 blocking，并同步改 spec AC-003 措辞；非本 report 可定，交由调度裁决。

### AC 复验更新（Round 2）

- AC-003：本轮复验降级——测试已不验证「不丢失」，实现不回滚；`re_verified` 结论为「违反/未达成」，需实现侧与 spec 处置（见 f003）。
- 其余 AC-001/002/004/005/006：复核仍 `re_verified`（f001/f002 修复后测试更贴近真实行为）。

coverage = 5/6（AC-003 因 f003 不成立）。

verdict: FAIL

## Round 3 (2026-08-13 20:05 UTC+8)

reviewed_scope: c982d40ecde4affe

复验命令：`node_modules/.bin/vitest run tests/unit/main/core/token-stats/` → 14 文件 272 例全过；`vitest run tests/unit/main/core/token-stats/collector.test.ts` → 33 例全过。

### 前轮 finding 复核

- **t345_test_f003（critical，AC-003 截断数据不永久丢失无测试 + 实现不回滚）**：已修。实现新增跨轮截断游标 `source_cursors`（collector.ts:487 定义、:529-537 按游标跳过已发出 session/daily、:552-556 截断时 `source_cursors.set` + 回滚 source state、:558-560 未截断清游标；beforeEach/reset_config 均 clear）。测试新增「advances the truncation cursor across rounds so no session is lost (t345 AC-003)」（collector.test.ts:788-831）：三轮状态机验证——首轮发 s0..s9999 + `source_cursors.get("claude_costs_local")?.sessions===10000`；二轮清 postMessage 后 `update.sessions[0]` 断言 `{id:"s10000"}`（身份锚定，证明跳过已发部分、发的是下一批而非重复 s0），`toHaveLength(10000)` + 游标推进至 20000；三轮 `toHaveLength(0)` + `source_cursors.has(...)===false`（发完清游标）。断言之强足以在无游标的旧实现（f003 时状态）下红：旧实现二轮 `sessions[0]` 为 s0 而非 s10000。配合保留的「does not starve later sources」测试（collector.test.ts:764，验证不 break 饿死 kimi），AC-003「截断数据不永久丢失」验收覆盖补回。消除。
- **t345_test_f001 / f002**：复核仍已修（套件 272 例过，collector AC-001 failed 传播用例与 claude/kimi `first.new_state` 重读用例均在）。

### 本轮新发现

### t345_test_f004 - AC-003 daily 截断游标路径无测试

- 严重度：minor
- 锚点：AC-003（「被截断的 sessions/daily 不永久丢失」）
- 位置：`tests/unit/main/core/token-stats/collector.test.ts`（缺失用例）；实现 `src/main/core/token-stats/collector.ts:538-547`（daily 游标跳过/推进）
- 问题：新游标测试只覆盖 sessions 路径。daily 走平行代码（`skipped_daily`/`pushed_daily`、上限 `MAX_RECORDS*5`、游标 `daily` 字段），零测试覆盖——若 daily 游标跳过计数或推进逻辑回归，套件不红。属覆盖可更广，不阻断。
- 建议：仿 sessions 游标测试增 daily 变体（如 20000 daily 恒超 `MAX_RECORDS*5=50000` 上限的用例改为超 daily 上限），断言二轮 `daily[0]` 身份锚定 + 游标推进 + 三轮清空。

### 改测方向复核

- 本轮无既有测试改写迁就实现；全部为新增测试（AC-003 游标用例 + 保留原「不饿死」用例），方向与 AC 验收一致。

### 结论

- 前轮 finding 复核：f003 已修（跨轮游标 + 强断言测试）；f001/f002 保持已修。
- 改测方向复核：无。
- 本轮新发现：1 条（f004 minor）。
- 未进表的提示：records 截断路径（`all_records` 达 `MAX_RECORDS*20` 中途 break）无直接测试，但该路径靠「break 前不标 emitted → 下轮重试」机制，已被既有「capacity check before marking emitted」注释与 emitted 去重测试间接覆盖，且 AC-003 主指 sessions/daily；可后补。
- 总体判断：AC-003 验收已恢复且有强断言测试，全部 AC-001~006 均有真实（红于旧实现）测试覆盖；仅剩 minor 级 f004 覆盖扩展，无未解决 critical/important，PASS。
- 系统性 follow-up：无。

### AC 复验更新（Round 3）

- AC-003：re_verified（collector.test.ts:788-831 跨轮游标测试：二轮 `sessions[0]==s10000` 身份锚定证明不重发不丢失，三轮清游标；对照 collector.ts:529-560 游标实现；无游标旧实现下断言红）。
- AC-001/002/004/005/006：保持 re_verified（前轮证据仍成立，272 例全过）。

coverage = 6/6。

verdict: PASS

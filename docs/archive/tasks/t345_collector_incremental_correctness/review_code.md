# Task review t345（reviewer_focus: 代码）

- task：`t345_collector_incremental_correctness`
- spec：`docs/tasks/t345_collector_incremental_correctness/spec.md`
- diff_anchor：`70ceea2682ea3ed255ede79bbb0a6147c6cc4b74`
- target：`git diff 70ceea2682ea3ed255ede79bbb0a6147c6cc4b74`
- round：1
- reviewed_at：2026-08-13 19:40 UTC+8
  reviewed_scope: 3b02a4607af23ec3

## Findings

### t345_code_f001 - AC-004 postMessage 失败后记录并未真正「下一轮重发」

- 严重度：important
- 锚点：AC-004（postMessage 失败时对应记录下一轮重发）
- 位置：`src/main/core/token-stats/collector.ts:490`、`:571-579`；`collector.ts:367/382/398/413/450-452`（各 source 状态在 postMessage 前已提交）；测试 `tests/unit/main/core/token-stats/collector.test.ts:375-401`
- 问题：`newly_emitted` 仅保证 postMessage 失败时不把 key 并入 `emitted_record_keys`，但所有 source 的增量扫描状态（`costs_state`/`jsonl_states`/`kimi_states`/`grok_states`/`opencode_max_updated`）在 `read_source` 里已先提交（offset/mtime/max_updated 前进）。postMessage 失败后这些状态不回滚，下一轮增量 reader 不会重产出失败轮的 records：
    - costs：`read_costs_jsonl` 从已提交 offset 继续，失败轮记录在 offset 之前 → 不重读；
    - claude/kimi/grok session：mtime 已提交，未变化文件不 dirty → 失败轮 session 不重算 → records 不重产出；
    - opencode：`max_updated` 已提交，`ended_at <= max` 的 session 不重读。
      结果：失败轮 records 既不进 `emitted_record_keys` 也不被重发，DB 仍未写入——AC-004 要修的「数据静默丢失」在真实增量流程里依旧存在，只是多了一条「emitted 集合未污染」。仅当同一 session 后续再次变更（mtime 前进）触发全量重算时才可能捎带补发，非「下一轮重发」。
- 测试问题：该测试 `mock_scan_jsonls.mockReturnValue(...)` 让 reader 每轮返回同一 2 条 record，等价于「reader 永远重产出失败轮数据」，正好掩盖了真实增量状态已前进（第二轮 reader 会返回 []）这一决定性行为。断言只验证「emitted 标记被回滚」，未验证「下一轮真实重发」。属 mock 掉被测增量语义的假行为测试。
- 建议：postMessage 失败时对当轮实际产出了 records/sessions 的 source 回滚其扫描状态（删除对应 map key，下一轮全量重扫），并让测试用「第二轮 reader 返回增量空集 + 真实状态传递」的 mock 复现，断言第二轮仍重发失败轮记录。

### t345_code_f002 - AC-003 超上限回滚在单源持续超限时形成活锁，截断数据仍永久丢失

- 严重度：important
- 锚点：AC-003（超上限被截断的 sessions/daily 不永久丢失）
- 位置：`src/main/core/token-stats/collector.ts:549-557`（回滚）、`:523`/`:542-545`（上限判断）；测试 `tests/unit/main/core/token-stats/collector.test.ts:730-751`
- 问题：回滚删除该 source 状态后下一轮全量重扫，但 session 上限（`MAX_RECORDS`=10000）是每轮累计上限且截断点按 `[...dirty].sort()` 的 session_id 稳定排序。单源 session 总数 >10000 时每轮都截断到同一前 10000 条：
    - 第 N 轮：源返回 20000 sessions，入列 10000，回滚 state；
    - 第 N+1 轮：重扫仍返回 20000 sessions，仍只入列同一前 10000，再回滚……
      10001+ 的 session upsert 永不发出（livelock）；且 `break` 使后续所有 source（jsonl/opencode/kimi/grok）每轮被跳过——比改动前更糟：改动前第 2 轮 costs 状态已前进（offset 提交）会返回 0 条、让出本轮给后续 source；改动后这些 source 被永久饿死。
- 测试问题：`expect(second.sessions).toHaveLength(10000)` 不区分回滚与否——mock 每轮恒返回 20000 sessions，即使不回滚第二轮 mock 仍返回 20000、截断到 10000，断言同样通过。测试只验证「state 被 delete」这一机制，未验证 AC 的观测结果「被截断数据未永久丢失」。
- 建议：单源超限需跨轮推进截断点（如对未入列的 sessions 记账、每轮只推进一部分），或在回滚前把「已截断但未发出的 key 集合」缓存到下一轮继续，才能满足「不永久丢失」。至少需在测试里断言 10001+ 的 session 最终出现在某轮 update 中。

### t345_code_f003 - AC-002 改动附带改变 parse-null 文件的 mtime 提交语义，违背既有契约且与 grok 分叉

- 严重度：important
- 锚点：行为缺陷（未变文件反复重读）+ 接口契约违背
- 位置：`src/main/core/token-stats/claude-reader.ts:594-605`、`:609`；`kimi-reader.ts:402-417`、`:418`；契约注释 `claude-reader.ts:38` / `kimi-reader.ts:37`（"parse failures included: skip re-reads"）；对照 `grok-reader.ts:476`
- 问题：AC-002 本意是「readFileSync 抛错时不提交 mtime」。实现把 `new_state.mtimes.set` 从「read 前」移到「parse 成功后」，副作用是 `parse_*` 返回 null（`!facts`）的文件也不再提交 mtime：
    - 原行为：parse-null 文件提交 mtime → 下轮跳过，直到 mtime 变化（注释明确 "parse failures included: skip re-reads"）；
    - 现行为：claude/kimi 的 parse-null 文件每轮走 changed 路径 → readFileSync → parse → null，永不复用已解析 mtime，未变化且永不产 usage 的文件被每轮重复读+重复解析（IO/CPU 回归）；grok-reader 仍保留 parse-null 提交 mtime（`grok-reader.ts:476`），三 reader 同形逻辑出现行为分叉。
    - 最小修复应在 readFileSync 成功后即提交 mtime（把 set 放在 `!facts` continue 之前），仅保留「read 失败不提交」这一 AC-002 语义。
- 建议：claude/kimi 将 `new_state.mtimes.set(file, stat.mtimeMs)` 移到 read 成功之后、`!facts` 判断之前，与 grok-reader 对齐。

### t345_code_f004 - AC-005 过滤未覆盖 timestamp: null，仍按 1970 处理

- 严重度：minor
- 锚点：AC-005（缺 timestamp 的行不进入 timestamps，不按 1970 处理）
- 位置：`src/main/core/token-stats/claude-reader.ts:138`
- 问题：`l.timestamp !== undefined` 只挡 undefined。`timestamp: null` 的行通过过滤，`new Date(r.timestamp ?? 0)` 中 `null ?? 0 → 0` → 1970：进 timestamps（`!Number.isNaN(0)` 恒真）、且 `ts(0) >= latest_ts(0)` 恒真可成为 latest，污染 started_at/ended_at。触发面窄（需 JSON 显式写 null 而非缺字段），但修复仅需改 `!= null`。
- 建议：`filter((l) => l.timestamp != null)`（同时覆盖 null 与 undefined），或沿用现有 NaN 过滤前先归一。

### t345_code_f005 - AC-001 collector 层「file_unreadable → failed + 部分数据转发」无测试覆盖

- 严重度：minor
- 锚点：AC-001（部分文件不可读返回已解析部分并置 failed）
- 位置：`src/main/core/token-stats/collector.ts:424-434`；`tests/unit/main/core/token-stats/collector.test.ts`（grok 分支仅覆盖 missing@:652 与 throwing-reader@:821）
- 问题：collector 层 grok 分支的 `result.file_unreadable → {sessions/daily/records 部分转发, status:"failed", logMessage}` 路径无测试；reader 层测试（grok-reader.test.ts:368-405）只验证 `file_unreadable=true` 与部分收集，未验证 collector 对状态与 partial 数据的处理。实现经代码核对正确，属覆盖缺口。
- 建议：补一条 collector 测试：`mock_scan_grok` 返回 `file_unreadable: true` 且带部分 records，断言 sources_status 含 `{source:"grok", env:"wsl", status:"failed"}` 且 update 仍含该部分 records。

### t345_code_f006 - AC-002 claude/kimi 测试第二轮用全新 state，未走「携带失败轮 state 续扫」路径

- 严重度：minor
- 锚点：AC-002（读取失败的文件下一轮重读）
- 位置：`tests/unit/main/core/token-stats/claude-reader.test.ts:806-816`；`kimi-reader.test.ts:347-355`
- 问题：两测试断言了关键属性 `first.new_state.mtimes.has(target) === false`，但第二轮用 `create_session_scan_state()`（全新 state）而非 `first.new_state`，因此第二轮「能读到文件」对「是否提交 mtime」不具区分力——即使 bug 存在（失败轮已提交 mtime），全新 state 下第二轮照样读到。grok 测试（grok-reader.test.ts:402）正确传了 `first.new_state`，claude/kimi 应一致。
- 建议：第二轮改传 `first.new_state` 以真正复现「携带失败轮 state 的下一轮重读」。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：6 条（f001/f002/f003 为 important；f004/f005/f006 为 minor）
- 未进表的提示：
    - 文件过大（降级规则不进表）：`collector.ts` 653 行、`claude-reader.ts` 645 行、`grok-reader.ts` 522 行、`kimi-reader.ts` 455 行，均 ≥400 minor 阈值，但本 task 净增（+44/+11/+17/+5）很小，且均 <800 important 阈值，仅作拆分建议。
    - 圈复杂度：`scan_grok_updates` 手算约 CC 12（含逐文件 stat/read/parse 分支），≥10 阈值进结论提示；本 task 新增分支有限，未达 ≥15 minor。
    - 范围外观察：无。
- 总体判断：AC-001/AC-002/AC-005/AC-006 的机制实现正确，但 AC-003/AC-004 的观测结果未达成（截断数据与 postMessage 失败数据在真实增量流程中仍会丢失），且 AC-002 改动附带 parse-null mtime 契约违背与跨 reader 分叉。存在 3 条未解决 important，verdict FAIL。
- 系统性 follow-up：f001/f002 根因同源（扫描状态在 emission 前推进且失败不回滚），建议单列 backlog：`collector 失败回滚一致性：postMessage 失败/超上限时扫描状态与 emitted 集合原子推进`，slug `collector_failure_atomicity`（阻断性 high）。t346（emitted_record_keys 内存/IO 无界）、t347（buckets 重建/批处理）为 spec 非范围既有 task，与本轮 finding 不重叠。

### AC 复验方式

- AC-001：`re_verified` — grok-reader 测试断言 `missing=false, file_unreadable=true, records 部分保留`（grok-reader.test.ts:368-405），代码路径核对 collector 分支转发 partial + failed。
- AC-002：`re_verified` — claude/kimi/grok 测试均断言失败文件 mtime 未提交；已运行 4 个测试文件 95 例全过。
- AC-003：`re_verified` — 复跑 collector.test.ts 通过，但代码与测试分析表明观测结果未达成（见 f002），结论为 AC 不满足。
- AC-004：`re_verified` — 复跑通过，但代码分析表明真实增量流程不会重发（见 f001），结论为 AC 不满足。
- AC-005：`re_verified` — 测试断言缺 ts 行被过滤、latest 取有 ts 行（claude-reader.test.ts:217-242）；null 分支见 f004。
- AC-006：`re_verified` — 测试断言空结果不缓存、二次探测生效（collector.test.ts:265-273）。

coverage = 6 / 6

verdict: FAIL

## Round 2 (2026-08-13 20:05 UTC+8)

reviewed_scope: 3b02a4607af23ec3

### 前轮 finding 复核

- **t345_code_f001（important，AC-004）：已消除。** `participated` 列表 + postMessage 失败时回滚全部 5 个 map（`collector.ts:491/514/576-586`），下轮全量重扫重发；`newly_emitted` 仅在成功路径并入 `emitted_record_keys`（`collector.ts:568-570`）。机制经代码核对真实生效：失败轮所有参与 source 的 offset/mtime/max_updated 全部删除，下一轮 reader 必然重产出。测试改为 `mockReturnValueOnce` x2 + 断言 `jsonl_states.has("claude_jsonl_local") === false`（`collector.test.ts:375-412`），比 Round 1 的恒返回 mock 显著更真实。守卫充分性见 f007。
- **t345_code_f002（important，AC-003）：修不彻底，仍存在。** 活锁（撤销回滚）与饿死（撤销 `break`）两子项已修并有测试（`collector.test.ts:761-786` 断言后续 kimi 仍被读取）；但 AC-003 核心「截断数据不永久丢失」未交付，收口为 f008。spec AC-003 未改（`spec.md` 无 diff），deferral 仅为未开 todo `p163`。
- **t345_code_f003（important，AC-002 回归）：已消除。** claude/kimi 的 `new_state.mtimes.set` 移到 readFileSync 成功后、parse 前（`claude-reader.ts:607`、`kimi-reader.ts:411`），parse-null 文件也提交 mtime，满足 `SessionScanState` 契约 "parse failures included: skip re-reads"（`claude-reader.ts:38`），并与 grok-reader 对齐；仅 read 失败路径不提交。
- **t345_code_f004（minor，AC-005）：已消除。** 过滤改为 `l.timestamp !== undefined && l.timestamp !== null`（`claude-reader.ts:140`），`RawCostLine.timestamp` 类型改 `string | null | undefined`（`:50`），覆盖 null。
- **t345_code_f005（minor，AC-001 collector 层）：已消除。** 新增 collector 测试断言 partial session 投递 + grok `sources_status.status === "failed"`（`collector.test.ts:703-724`）。
- **t345_code_f006（minor，AC-002 测试 state）：已消除。** claude/kimi 测试第二轮改传 `first.new_state`（`claude-reader.test.ts:816`、`kimi-reader.test.ts:355`），走增量重试路径，与 grok 测试一致。

### 本轮新发现

### t345_code_f007 - AC-004 测试未守卫回滚必要性，注释与 mock 矛盾

- 严重度：minor
- 锚点：行为缺陷（测试 robustness，非实现缺陷）
- 位置：`tests/unit/main/core/token-stats/collector.test.ts:375-412`（尤其 `:394-404`）
- 问题：re-emit 断言 `expect(second.records).toHaveLength(2)` 依赖 `mock_scan_jsonls` 第二轮仍返回 2 条 record；该 mock 忽略 scan-state 参数（state-independent），即使移除回滚逻辑、第二轮仍返回 2 条 → 断言照过。真正钉住回滚机制的只有副作用断言 `jsonl_states.has("claude_jsonl_local") === false`（`:392`）。此外 `:394` 注释「真实增量下 reader 返回 []」与 `:396-404` mock 返回 2 条矛盾——mock 实际模拟「回滚后全量重扫重产出」，注释描述「无回滚的增量空返回」，两个场景不是一回事。
- 建议：mock 改 state-dependent：收到含已提交 mtime 的 state 返回 []（增量跳过），收到 fresh state 返回 2 条（回滚后全量重扫）。这样移除回滚时测试会红，真正守卫 AC-004；并修正注释。

### t345_code_f008 - AC-003 超上限截断数据仍永久丢失（原 f002 收口，spec 未改）

- 严重度：important
- 锚点：AC-003（超上限被截断的 sessions/daily 不永久丢失，缓存到下一轮或上限命中时不推进扫描状态）
- 位置：`collector.ts:546-555`（截断仅置 `truncated=true` 标志）、`collector.ts:367/382/398/413/450-452`（各 source state 在 `read_source` 内已推进）；`spec.md` AC-003 行未改；deferral 见 `docs/pending/todo/p163_collector_truncation_cursor.md`（未开）
- 问题：f002 的活锁与饿死已修，但 AC-003 核心未交付。当前超上限时：截断集合既不缓存到下一轮、也不阻止扫描状态推进——`read_source` 已提交 mtimes/offset/max_updated，下一轮增量 reader 不重产出 → 被截断的 sessions/daily 永久丢失。spec 允许的两种机制（「缓存到下一轮」「上限命中时不推进扫描状态」）均未实现。真实触发场景：首装/历史重载时单轮 >10000 sessions（`scan_session_jsonls` 对空 prev 全量 dirty），collector 入列前 10000、余下 mtimes 全部提交，下一轮无 dirty → 超出部分永不再发——正是 t345 要修的「静默丢失」之一。Round-1 的回滚方案在瞬态超限时能恢复（下轮全量重扫），本轮撤销恢复逻辑，瞬态与持续场景都不再恢复；实施方 disposition 标「已修」不成立。
- 建议：二选一：(a) 实现跨轮截断游标（对未入列 sessions 记账、每轮只推进一部分，即 p163 所述方案）；或 (b) 修改 spec AC-003，将「超上限跨轮游标」显式 scope 到 p163（处置为改 spec，不计 FAIL）。当前两者皆无 → 阻断。

## 结论

- 前轮 finding 复核：f001/f003/f004/f005/f006 已消除；f002 修不彻底（AC-003 未交付，收口 f008）。
- 本轮新发现：2 条（f007 minor、f008 important）。
- 未进表的提示：
    - postMessage 持续失败时每轮全量重扫所有参与 source（`participated` 全量回滚）——parent 永久失联的退化态下 IO 放大。数据完整性优先于效率的取舍，非正确性缺陷，仅提示。
    - 文件过大/圈复杂度：与 Round 1 同（`collector.ts` 现约 650 行、`claude-reader.ts` 约 660 行），本 task 净增小，不进表。
- 总体判断：5 个 AC（001/002/004/005/006）已正确落地，AC-004 由「emitted 不污染」升级为「扫描状态真实回滚、下轮重发」；但 AC-003「超上限截断不永久丢失」仍未交付（spec 未改、p163 未开），存在 1 条未解决 important → FAIL。
- 系统性 follow-up：p163 已登记（`collector_truncation_cursor`，未开），与本轮 f008 同源；建议处置 f008 时同步决定「实现游标」或「改 spec scope 到 p163」。

### AC 复验方式（Round 2）

- AC-001：`re_verified` — collector 测试断言 partial session 投递 + grok status "failed"（`collector.test.ts:703-724`）。
- AC-002：`re_verified` — claude/kimi/grok 测试断言 read 失败不提交 mtime + 第二轮 `first.new_state` 重读；独立重跑 token-stats 目录 271 tests 全过。
- AC-003：`re_verified` — 复跑通过，但代码核对表明截断数据仍永久丢失（f008），AC 未满足。
- AC-004：`re_verified` — 复跑通过；回滚机制经代码核对真实生效，守卫充分性见 f007。
- AC-005：`re_verified` — 过滤覆盖 null 与 undefined（`claude-reader.ts:140`）。
- AC-006：`re_verified` — 空结果不缓存、二次探测生效（`collector.test.ts:265-273`）。

coverage = 6 / 6

verdict: FAIL

## Round 3 (2026-08-13 20:30 UTC+8)

reviewed_scope: 3b02a4607af23ec3

### 前轮 finding 复核

- **t345_code_f008（important，AC-003）：已消除。** 跨轮截断游标 `source_cursors` 已实现：超上限时记录 `skipped+pushed` 累计发出数、回滚该 source 扫描状态、不 break（`collector.ts:566-590`）；下轮按游标跳过已发出部分继续推进，发完清除（`:587-590`）。逐轮推演 20000 sessions 场景：R1 发 10000+游标 10000 → R2 跳 10000 发 s10000..s19999 → R3 全跳过清游标——纯 session 路径 exact-once，无丢失无重复。新增测试覆盖三轮推进（`collector.test.ts:785-827`），断言 s10000 起点与游标清除。AC-003 的 session 维度满足；f008 关闭。
- **t345_code_f007（minor，AC-004 测试守卫）：未处置，仍存在。** AC-004 测试（`collector.test.ts:375-412`）与 Round 2 相同：`mock_scan_jsonls` 仍忽略 scan-state 参数（每轮恒返回 2 条），re-emit 断言对「回滚是否必需」不敏感；唯一钉住机制的是副作用断言 `jsonl_states.has(...) === false`（`:392`）。且该测试未覆盖 f009 的截断+postMessage 失败组合。minor，不阻断。
- **t345_code_f001/f002/f003/f004/f005/f006**：前轮已消除项无回归（相关代码在 Round 3 diff 中未见改动破坏）。

### 本轮新发现

### t345_code_f009 - 截断游标在 postMessage 前提交，发送失败的截断轮 session upsert 永久丢失

- 严重度：important
- 锚点：AC-004（postMessage 失败时对应记录下一轮重发）+ AC-003（数据不永久丢失）
- 位置：`collector.ts:576`（`source_cursors.set` 在 collection 循环内、postMessage `:602` 之前）；`:606-622`（postMessage catch 只删 5 个扫描 map，未回滚/删除 `source_cursors`）
- 问题：游标提交时机与 `emitted_record_keys` 不一致——后者在 postMessage 成功后并入（`:603-605`），游标却在失败前就写入。截断轮若 postMessage 失败：
    - 该轮 pushed 的 sessions/daily 已计入游标（`total_sessions = skipped+pushed`，`:574-576`），但 update 未送达；
    - catch 只回滚扫描状态（下轮全量重扫），游标保持前进；
    - 下轮重扫后按游标跳过这批 sessions → 被跳过的 session upsert 不再重发，永久丢失。
      可复现路径：source 返回 20000 sessions（截断触发）且首轮 postMessage 抛错。R1：发 s0..s9999、游标置 10000、postMessage 失败（s0..s9999 未送达）；R2：重扫 20000、跳 10000、发 s10000..s19999 成功；R3：跳 20000、游标清。s0..s9999 的 session upsert 永远缺失（records 经 emitted 集合回滚可在 R2 重发，sessions/daily 则被游标跳过）。正是 AC-004 要防的「发送失败的数据静默丢失」。
- 建议：游标提交移到 postMessage 成功之后（与 `emitted_record_keys` 同批），或 postMessage catch 内对 participated source 执行 `source_cursors.delete(src.key)`。删除游标后下轮全量重发（store 按 PK REPLACE，幂等，无重复副作用）。

## 结论

- 前轮 finding 复核：f008 已消除（AC-003 session 维度满足）；f007 未处置仍存在（minor）；其余前轮已消除项无回归。
- 本轮新发现：1 条（f009 important）。
- 未进表的提示：
    - 跨轮 daily/session upsert 排序错位：截断时 daily 可能整批提前于其 session upsert 一轮发出（daily 全量 < 上限时 R1 全部发出、session 分两轮）。store 三表独立、无 FK（`token-stats-store.ts:188-241`，daily/session 各自 PK），晚一轮补 session 行无失败与不一致，良性，仅提示。
    - 游标依赖 reader 每轮重扫的稳定排序（costs 按文件首现序、jsonl/kimi/grok 按 `[...dirty].sort()`），均已核对稳定；新增数据排序靠后追加，不会越过跳过区。
    - 文件过大/圈复杂度：同前轮，本 task 净增小，不进表。
- 总体判断：AC-003 跨轮截断游标方案对纯 session 场景正确（exact-once、无饿死、无活锁）；但新增游标与 postMessage 失败处理存在提交时机缺陷（f009），截断轮发送失败时 session upsert 仍永久丢失——AC-004 在截断场景下不满足。1 条未解决 important → FAIL。
- 系统性 follow-up：f009 与 p163/`collector_failure_atomicity` 同源（扫描状态、游标、emitted 集合三者需与 postMessage 原子推进），建议并入该 backlog；本 task 内最小修复为「游标提交延后到 postMessage 成功后」。

### AC 复验方式（Round 3）

- AC-001：`re_verified` — 同 Round 2（collector 层 failed 传播测试 `collector.test.ts:703-724`）。
- AC-002：`re_verified` — 同 Round 2（read 失败不提交 mtime + 第二轮 `first.new_state` 重读）；token-stats 目录 272 tests 全过。
- AC-003：`re_verified` — 新游标三轮推进测试通过（`collector.test.ts:785-827`）；代码推演 session 路径 exact-once；daily 路径良性错位。
- AC-004：`re_verified` — 非截断场景已满足（participated 回滚 + emitted 集合延后）；截断场景仍不满足（f009：游标提前提交、失败不回滚）。
- AC-005：`re_verified` — 同 Round 2（`claude-reader.ts:140` 过滤 null/undefined）。
- AC-006：`re_verified` — 同 Round 2（空结果不缓存、二次探测生效）。

coverage = 6 / 6

verdict: FAIL

## Round 4 (2026-08-13 20:45 UTC+8)

reviewed_scope: c982d40ecde4affe

### 前轮 finding 复核

- **t345_code_f009（important，AC-003/AC-004 截断+发送失败组合）：已消除。** postMessage catch 内对 participated source 追加 `source_cursors.delete(src.key)`（`collector.ts:622`），截断轮发送失败时游标回滚，下轮全量重扫从 s0 重发。逐轮推演（20000 sessions，R1 postMessage 抛错）：R1 发 s0..s9999、游标置 10000、失败 → catch 删 5 map + 删游标；R2 无游标重扫发 s0..s9999 成功、游标重置 10000；R3 跳 10000 发 s10000..s19999；R4 全跳过清游标——s0..s9999 的 session upsert 在 R2 补发，无永久丢失。store 按 PK REPLACE（`token-stats-store.ts:819-860`）幂等，补发无重复副作用。新测试「rolls back the truncation cursor on postMessage failure」（`collector.test.ts:829-856`）断言 `source_cursors.has === false`（`:846`）+ 二轮 `sessions[0].id === "s0"`（`:854`）——两断言在缺 fix 时均红（游标残留 10000 时 R2 首条为 s10000），是 state-dependent 的真实守卫，不属 f007 那类恒返回 mock。
- **t345_code_f007（minor，AC-004 非截断测试守卫）：未处置，仍存在。** AC-004 测试（`collector.test.ts:375-412`）mock 仍忽略 scan-state 参数，re-emit 断言对「回滚是否必需」不敏感，唯一钉住机制的是 `jsonl_states.has(...) === false` 副作用断言。minor，不阻断。
- **t345_code_f001/f002/f003/f004/f005/f006/f008**：前轮已消除项无回归（Round 4 diff 仅涉 catch 游标回滚与新增测试）。

### 本轮新发现

- 无。

## 结论

- 前轮 finding 复核：f009 已消除；f007 未处置仍存在（minor）；其余前轮已消除项无回归。
- 本轮新发现：0 条。
- 未进表的提示：
    - postMessage 持续失败退化态：每轮截断→游标置→失败→回滚→下轮全量重扫，数据保活但 IO 放大（同 Round 2 提示，数据完整性优先，非缺陷）。
    - 跨轮 daily/session upsert 排序错位（daily 可能早一轮发出）：store 三表独立无 FK，良性（同 Round 3 提示）。
    - 游标依赖 reader 每轮稳定排序：costs 按文件首现序、jsonl/kimi/grok 按 `[...dirty].sort()`，均已核对稳定。
    - 文件过大/圈复杂度：同前轮，本 task 净增小，不进表。
- 总体判断：f009 修复正确且测试真实守卫；AC-003（截断数据不永久丢失，含截断+发送失败组合）与 AC-004（postMessage 失败下一轮重发，含截断场景）均已满足。当前无未解决 critical / important，仅有 minor（f007）→ PASS。
- 系统性 follow-up：f009 收口后与 p163/`collector_failure_atomicity` 同源的「扫描状态、游标、emitted 集合与 postMessage 原子推进」已在实现层闭环；p163（跨轮截断游标）主体已被本 task 落地，建议按 p163 登记状态评估是否可关（本 task 只建议，不代处置）。

### AC 复验方式（Round 4）

- AC-001：`re_verified` — 同前轮（collector 层 failed 传播测试 `collector.test.ts:703-724`）。
- AC-002：`re_verified` — 同前轮（read 失败不提交 mtime + 第二轮 `first.new_state` 重读）；token-stats 目录 273 tests 全过，typecheck 干净（tsc exit 0）。
- AC-003：`re_verified` — 游标三轮推进（`collector.test.ts:785-827`）+ 游标失败回滚（`:829-856`）测试通过；代码推演纯 session 与截断+发送失败两场景均 exact 无丢失。
- AC-004：`re_verified` — 非截断（participated 回滚 + emitted 集合延后）与截断（游标回滚）两场景均满足；f007 仅测试守卫强度问题，不构成 AC 缺口。
- AC-005：`re_verified` — 同前轮（`claude-reader.ts:140` 过滤 null/undefined）。
- AC-006：`re_verified` — 同前轮（空结果不缓存、二次探测生效）。

coverage = 6 / 6

verdict: PASS

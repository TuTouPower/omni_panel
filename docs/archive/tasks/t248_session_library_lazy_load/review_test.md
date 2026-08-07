# Task review t248（reviewer_focus: 测试）

- task：`t248_session_library_lazy_load`
- spec：`docs/tasks/t248_session_library_lazy_load/spec.md`
- diff_anchor：`c4697f3d805a9cace58538248175bb6be0cd9835`
- target：`git diff c4697f3d805a9cace58538248175bb6be0cd9835`
- round：1
- reviewed_at：2026-08-07 12:40 UTC+8

## Findings

### t248_test_f001 - AC3 未验证重复加载直至无更多及按钮消失

- 严重度：important
- 锚点：AC3
- 位置：`tests/unit/renderer/components/session_library/SessionLibrary.test.tsx:134-176`、`tests/unit/renderer/components/session_library/SessionLibrary.test.tsx:581-594`
- 问题：新增测试只点击一次「加载更多」，断言第二页被追加并传入 `offset: 50`；既没有继续点击到后端返回短页/空页，也没有断言「加载更多」按钮消失。既有分页测试同样只点击一次且只断言卡片数。因而 `set_has_more` 在短页后仍保持 `true`、按钮仍可继续发起错误请求等 AC3 回归可以通过当前测试。
- 建议：使用至少三次交互（首屏、完整/下一页、短页或空页），逐次断言追加结果、offset，并在最后断言 `queryByRole("button", { name: "加载更多" })` 为 `null`，同时确认按钮消失后不会再发请求。

### t248_test_f002 - AC4 没有验证组合过滤的 SQL 结果与分页 offset

- 严重度：important
- 锚点：AC4
- 位置：`tests/unit/main/core/token-stats/token-stats-store.test.ts:361-377`、`tests/unit/renderer/components/session_library/SessionLibrary.test.tsx:134-208`
- 问题：store 测试分别覆盖 `sources`、日期交集、排序和单独的 `limit`，没有覆盖 spec 测试策略要求的 `search + sources + 日期交集 + limit/offset` 组合，也没有断言 `offset` 在真实 SQLite 查询中切出正确的会话。渲染测试中标题搜索分支由 mock 按 `search` 手工返回 `filtered_page`，Agent/日期分支则始终返回同一个 `first_page`，只断言调用参数，不断言列表结果。因此 SQL 忽略 offset、组合 WHERE 条件错误或返回了不匹配的行时，测试仍可通过。
- 建议：在内存 SQLite fixture 中放入可区分标题/路径/ID、source、时间和排序的多行，使用组合过滤及 `limit/offset` 断言精确 ID 集合；渲染测试再断言 Agent/日期筛选后的可见结果与后端返回一致，而不只是检查 mock 参数。

### t248_test_f003 - AC5 的内容搜索测试未验证命中结果，mock 可使错误映射假绿

- 严重度：important
- 锚点：AC5
- 位置：`tests/unit/renderer/components/session_library/SessionLibrary.test.tsx:210-236`、`tests/unit/ipc/session-history-ipc.test.ts:428-476`
- 问题：renderer 测试只检查请求包含关键词，并用 `not.toHaveProperty("locs", expect.arrayContaining(...))` 排除一个隐藏 ID；请求没有 `locs` 时该断言也会通过，且没有断言筛选条件、隐藏会话最终出现在命中集合/列表中。IPC 测试虽然让 `sessions_provider` 返回隐藏候选，但 `service.searchContent` 沿用默认的 `Set(["claude_code|win|s1"])`，与候选 `hidden` 不对应；测试只断言 `result.ok` 和 service 入参，没有断言返回的 `hits` 或 `sessions`。因此候选选择或命中结果映射错误仍会绿灯。
- 建议：让 mock service 对候选 `claude_code|win|hidden` 返回同一 key，并断言 IPC 返回的 `hits`/`sessions` 精确包含该候选；renderer 侧断言选定 Agent/日期筛选被传入且后端返回的隐藏候选实际渲染，同时保留不依赖 renderer 全量列表的证据。

### t248_test_f004 - AC6 完全未覆盖筛选/排序切换后的新摘要批量请求

- 严重度：important
- 锚点：AC6
- 位置：`tests/unit/renderer/components/session_library/SessionLibrary.test.tsx:238-262`
- 问题：新增测试只验证首次摘要请求没有包含未加载的 `hidden`，没有执行「加载更多」或切换筛选/排序，也没有断言新可见会话触发第二次批量摘要请求。测试中配置的 `second_page` 从未被消费；若摘要 effect 在筛选/排序变化后没有重新请求新可见会话，当前测试仍会通过。另有 `tests/unit/renderer/components/session_library/SessionLibrary.test.tsx:554-579` 只覆盖初始可见集合，不覆盖 AC6 的变化场景。
- 建议：先加载首屏并断言精确摘要 locs，再点击加载更多或切换 Agent/排序使未摘要会话成为可见，断言新增一次 `summaries` 批量调用且只含新的可见会话，同时确认旧摘要不会重复请求。

## 结论

- 前轮 finding 复核：无，本轮为 Round 1。
- 改测方向复核：既有内容搜索测试从旧的双参数调用迁移为新的 request object，是对应接口变更的必要改测；未发现通过删除关键断言、`.skip`/`.only`、注释断言或扩大阈值来迁就实现的改测。新增测试中的弱断言和未覆盖场景见上述 findings。
- 本轮新发现：4 条（均为 important）。
- 未进表的提示：全量 `pnpm test` 通过（237 个 test files，2540 passed，1 skipped）；目标相关的 5 个测试文件通过（145 tests）。Renderer 测试输出既有未包裹 `act(...)` 警告，但未将其作为本轮 blocking finding；真实大数据量渲染帧率按 spec 上下文区明确有意不测。
- 总体判断：AC1/AC2 有可运行的生产逻辑测试，但 AC3 的结束条件、AC4 的组合 SQL 结果、AC5 的真实命中结果和 AC6 的变化后摘要请求仍未被可信测试证明。
- 系统性 follow-up：无；以上缺口均直接位于本 task 的 AC 测试覆盖范围内。

verdict: FAIL

## Round 2 (2026-08-07 13:09 UTC+8)

### Findings

本轮无新 finding。

## 结论

- 前轮 finding 复核：
    - `t248_test_f001` 已消除。`tests/unit/renderer/components/session_library/SessionLibrary.test.tsx:509-537` 首屏返回完整 50 条，点击加载更多后追加短页 `p50/p51`，断言按钮消失、卡片总数为 52，并断言 `offset: 50` 只请求一次；双击期间的并发请求也被 `getSessions` 总调用次数断言拦截。
    - `t248_test_f002` 已消除。`tests/unit/main/core/token-stats/token-stats-store.test.ts:396-408` 使用真实内存 SQLite store，将 `search`、`sources`、活动时间交集、升序排序及 `limit: 1/offset: 1` 组合到同一查询，并对精确会话 ID `b` 断言；`tests/unit/renderer/components/session_library/SessionLibrary.test.tsx:140-214` 另外验证分页重置和 Agent/日期过滤参数确实从界面传入生产组件调用。
    - `t248_test_f003` 已消除。`tests/unit/ipc/session-history-ipc.test.ts:428-503` 让后端候选 `hidden` 与 service 命中 key 一致，断言 IPC 返回的 `hits` 与 `sessions` 精确结果、候选分页过滤参数和 resolved loc；`tests/unit/renderer/components/session_library/SessionLibrary.test.tsx:216-249` 断言内容搜索请求包含后端 filters、没有 renderer 全量 `locs`，且隐藏候选实际渲染。
    - `t248_test_f004` 已消除。`tests/unit/renderer/components/session_library/SessionLibrary.test.tsx:251-288` 首先断言首屏摘要请求不含未加载 `hidden`，再点击加载更多，断言第二次批量摘要请求只包含新可见的 `hidden`，并反向断言首批没有重复请求该会话。
- 改测方向复核：无。旧内容搜索双参数调用迁移为 request object 与 IPC 返回结构变化相匹配；未发现删除/反转/注释断言、`.skip`/`.only`、扩大阈值或 mock 被测生产模块。新增测试均通过真实 `SessionLibrary`、真实 `token-stats-store` SQLite 查询或 IPC handler，mock 仅位于约定的 Electron/外部 service 边界。
- 本轮新发现：0 条。
- 未进表的提示：目标相关 5 个测试文件通过（146 tests）；全量 `pnpm test` 通过（237 个 test files，2541 passed，1 skipped）。Renderer 仍有既有 `act(...)` stderr 警告，但没有改变本轮测试结果，也未构成 AC 覆盖或假绿证据；真实大数据量渲染帧率按上下文区明确有意不测。
- 总体判断：前轮四条 blocking test finding 均已由可执行、触达生产逻辑的断言覆盖，当前没有未解决的 critical / important finding。
- 系统性 follow-up：无。

verdict: PASS

## Round 3 (2026-08-07 13:23 UTC+8)

### Findings

### t248_test_f005 - AC1 测试只在首屏请求仍 pending 时断言一次调用

- 严重度：important
- 锚点：AC1
- 位置：`tests/unit/renderer/components/session_library/SessionLibrary.test.tsx:125-137`（测试名：`t248 AC1/AC2：首屏只取 limit=50 一页，统计独立于列表请求`）
- 问题：`getSessions` 被故意保持 pending 时即断言 `toHaveBeenCalledTimes(1)`，随后 resolve 首屏后只等待 `p0` 渲染，没有再次断言请求总数。该断言只能证明首个请求尚未 resolve 时没有提前发第二个请求；若实现先渲染第一页、随后继续循环请求后续页，当前测试仍可能通过，因此不能证明 AC1 的「全程不存在循环拉取直至全部会话加载完成」。
- 建议：resolve 首屏后等待渲染稳定，再断言 `getSessions` 总调用数仍为 1；同时让 mock 在第二次调用时显式失败或记录调用，以覆盖 resolve 后的循环请求。

### t248_test_f006 - 普通分页排序的后端传参与 SQL 结果覆盖被删除/替换为假排序

- 严重度：important
- 锚点：AC3（下一页须按当前排序追加）及非范围约束（不改变排序选项）
- 位置：`tests/unit/main/core/token-stats/token-stats-store.test.ts:396-408`；`tests/unit/renderer/components/session_library/SessionLibrary.test.tsx:334-365,569-598`
- 问题：原有 `orders by tokens and calls` SQLite 测试在当前 diff 中被整体替换，现有 store 组合测试只验证 `ended_at ASC`。renderer 的既有排序测试在选择 Grok 后 mock 已预先返回 `[c, a]`，再切换 `calls` 只断言 `c` 在首位，没有断言 `getSessions` 收到 `order_by: "calls"`/方向；新增排序测试只对 `searchContent` 返回的 `content_sessions` 做 renderer 本地排序，未覆盖普通分页 `getSessions` 的 tokens/calls 排序。因而普通列表遗漏排序参数、后端忽略 tokens/calls 或下一页按错误排序返回时，测试仍可通过。
- 建议：保留/恢复真实 SQLite 的 tokens 与 calls 升降序断言；普通列表 renderer 测试使用未排序的 mock 页，切换排序后断言请求中的 `order_by`、`direction` 和实际卡片顺序，最好覆盖加载更多的下一页。

### t248_test_f007 - 中途分页失败的既有回归测试被删除且无等价覆盖

- 严重度：important
- 锚点：AC3 的分页失败路径；可观测行为为首屏已有数据时下一页请求失败，仍保留已加载卡片并显示「会话列表加载中断，已显示部分数据」
- 位置：当前 `tests/unit/renderer/components/session_library/SessionLibrary.test.tsx:499-507,509-537`；diff 删除的测试名：`中途分页失败时展示已加载数据并显示加载中断提示`
- 问题：当前 diff 用短页/双击测试替换了原有中途分页失败测试。现有测试只覆盖首屏加载失败；没有任何测试在首屏成功后点击「加载更多」并让第二页 reject，再验证已加载数据与中断提示。生产代码仍保留该错误处理路径，删除该测试降低了失败路径覆盖，错误吞没、已加载数据丢失或提示消失都可能通过当前测试。
- 建议：保留短页/并发测试，并将原场景改为首屏 50 条、点击加载更多后第二页 reject，断言 50 张卡片仍在且中断提示可见。

## 结论

- 前轮 finding 复核：
    - `t248_test_f001` 已消除。`SessionLibrary.test.tsx:509-537` 覆盖首屏 50 条后追加短页、按钮消失和快速重复点击不产生第二次 `offset: 50` 请求。
    - `t248_test_f002` 已消除。`token-stats-store.test.ts:396-408` 使用内存 SQLite 对 search、sources、活动时间交集、排序和 limit/offset 组合断言精确 ID；renderer 另覆盖 Agent/日期筛选参数与分页重置。
    - `t248_test_f003` 已消除。`session-history-ipc.test.ts:425-507` 断言后端候选、正文 hits、sessions 映射和 resolved loc；renderer 断言隐藏候选实际渲染且请求不含 renderer 全量 `locs`。
    - `t248_test_f004` 已消除。`SessionLibrary.test.tsx:251-288` 断言加载更多后仅为新可见会话发起第二次摘要批量请求，首批不含隐藏会话。
- 改测方向复核：新增内容搜索排序测试与统计失败测试本身均为可执行的用户可观察断言：前者用不同 token/起始时间的真实 fixture 验证 tokens/earliest 顺序，后者验证聚合失败时不显示首屏部分统计且不生成来源 chips；未发现通过删除/反转 expect、跳过测试、扩大阈值或 mock 被测模块来让这两条测试迁就实现。但普通列表排序覆盖和中途分页失败覆盖的删除/替换见 `t248_test_f006`、`t248_test_f007`。
- 本轮新发现：3 条（均为 important）。
- 未进表的提示：目标相关 5 个测试文件通过（148 tests）；`git diff --check c4697f3d805a9cace58538248175bb6be0cd9835` 通过；renderer 测试仍有既有 `act(...)` stderr 警告，未作为本轮 finding；真实大数据量渲染帧率按上下文区明确有意不测。
- 总体判断：Round 1 的四条测试 finding 已真实补测，但 AC1 的 no-loop 证据仍不完整，普通分页排序与中途分页失败的既有覆盖被削弱，当前仍有未解决 important test finding。
- 系统性 follow-up：无。

verdict: FAIL

## Round 4 (2026-08-07 13:39 UTC+8)

### Findings

本轮无新 finding。

## 结论

- 前轮 finding 复核：
    - `t248_test_f001` 已消除。`tests/unit/renderer/components/session_library/SessionLibrary.test.tsx:110-143` 在首屏列表 resolve 前后都断言 `getSessions` 总调用数为 1，并让第二次调用显式抛错，能够阻止首屏完成后继续循环拉取。
    - `t248_test_f002` 已消除。`tests/unit/main/core/token-stats/token-stats-store.test.ts:314-357,432-460` 使用真实内存 SQLite 覆盖 title/directory/id、Unicode 大小写、LIKE 通配符、source/date 组合以及精确 `limit/offset` 结果；`SessionLibrary.test.tsx:145-219` 覆盖 renderer 将搜索、Agent、日期筛选传给后端并重置 offset。
    - `t248_test_f003` 已消除。`tests/unit/ipc/session-history-ipc.test.ts:428-503` 断言后端候选筛选、正文命中 `hits` 与 `sessions` 精确映射；`SessionLibrary.test.tsx:221-254` 断言隐藏候选实际渲染且请求不携带 renderer 全量 `locs`。
    - `t248_test_f004` 已消除。`tests/unit/renderer/components/session_library/SessionLibrary.test.tsx:256-294` 首屏只请求可见会话摘要，加载更多后第二次摘要请求只包含新可见会话且不重复首批。
    - `t248_test_f005` 已消除。`tests/unit/renderer/components/session_library/SessionLibrary.test.tsx:110-143` 在首屏 resolve 后再次断言请求总数仍为 1，补足 AC1 的 no-loop 证据。
    - `t248_test_f006` 已消除。`tests/unit/main/core/token-stats/token-stats-store.test.ts:432-447` 恢复真实 SQLite 的 tokens/calls 双向排序断言；`SessionLibrary.test.tsx:380-425` 断言普通分页排序参数和实际卡片顺序。
    - `t248_test_f007` 已消除。`tests/unit/renderer/components/session_library/SessionLibrary.test.tsx:591-606` 恢复首屏成功、第二页 reject 后保留 50 张首屏卡片并显示中断提示的回归测试。
- 改测方向复核：无。既有测试的接口迁移与分页/内容搜索语义变化均有对应生产契约；未发现删除或反转 expect、注释断言、`.skip`/`.only`、静默类型错误、扩大阈值或 mock 被测逻辑。mock 均位于约定的 Electron、preload IPC、session-history service 或 tokenStats 边界，SQLite 查询使用真实内存数据库。
- 本轮新发现：0 条。
- 未进表的提示：renderer 仍输出既有 `act(...)` 警告，但目标测试与全量测试均通过，未形成当前 task 的假绿证据；真实大数据量渲染帧率按 spec 上下文区明确有意不测。全量 `pnpm test` 通过（237 个 test files，2548 passed，1 skipped）；目标相关 5 个测试文件通过（153 tests）；`pnpm exec tsc --noEmit` 与 `git diff --check c4697f3d805a9cace58538248175bb6be0cd9835` 均通过。
- 总体判断：Round 1/3 的测试 blocking finding 均已由可执行且触达生产逻辑的断言补回，当前没有未解决的 critical / important test finding。
- 系统性 follow-up：无。

verdict: PASS

## Round 5 (2026-08-07 13:55 UTC+8)

### Findings

本轮无新 finding。

## 结论

- 前轮 finding 复核：
    - `t248_test_f001` 已消除。`tests/unit/renderer/components/session_library/SessionLibrary.test.tsx:561-589` 覆盖首屏 50 条后追加短页、按钮消失及快速重复点击不产生第二次相同 offset 请求。
    - `t248_test_f002` 已消除。`tests/unit/main/core/token-stats/token-stats-store.test.ts:314-357,454-466` 使用真实 SQLite 覆盖标题/目录/ID、Unicode 大小写、LIKE 字面转义及组合筛选与精确 limit/offset；renderer 在 `SessionLibrary.test.tsx:145-219` 覆盖筛选传参与分页重置。
    - `t248_test_f003` 已消除。`tests/unit/ipc/session-history-ipc.test.ts:428-503` 断言后端候选、正文 hits 和 sessions 映射；`SessionLibrary.test.tsx:221-254` 断言隐藏候选实际渲染且请求不携带 renderer 全量 locs。
    - `t248_test_f004` 已消除。`tests/unit/renderer/components/session_library/SessionLibrary.test.tsx:256-294` 断言加载更多后只为新可见会话发起第二次摘要批量请求，首批不重复。
    - `t248_test_f005` 已消除。`SessionLibrary.test.tsx:110-143` 在首屏列表 resolve 前后均断言 `getSessions` 只有一次调用，并让意外第二页请求显式失败。
    - `t248_test_f006` 已消除。`tests/unit/main/core/token-stats/token-stats-store.test.ts:437-451` 覆盖 tokens/calls 双向排序；`SessionLibrary.test.tsx:380-425` 断言普通分页排序参数与实际卡片顺序。
    - `t248_test_f007` 已消除。`SessionLibrary.test.tsx:591-606` 覆盖首屏成功、第二页 reject 后保留首屏数据并显示加载中断提示。
- 改测方向复核：无。Round 4 后新增的内容搜索失败、跨字段空格搜索和筛选切换分页并发回归测试均通过真实 `SessionLibrary`、真实内存 SQLite 或 IPC handler，mock 仅位于约定边界；未发现删除/反转/注释断言、弱化断言、跳过测试或 mock 被测逻辑。
- 本轮新发现：0 条。
- 未进表的提示：目标相关 5 个测试文件通过（156 tests）；全量 `pnpm test` 通过（237 个 test files，2551 passed，1 skipped）；`pnpm exec tsc --noEmit` 与 `git diff --check c4697f3d805a9cace58538248175bb6be0cd9835` 均通过。目标 renderer 测试仍有既有 `act(...)` stderr 警告，但未形成当前 task 的假绿证据；真实大数据量渲染帧率按 spec 上下文区明确有意不测。
- 总体判断：前轮所有 test blocking finding 均由可执行、触达生产逻辑的回归断言补回，当前没有未解决的 critical / important test finding。
- 系统性 follow-up：无。

verdict: PASS

## Round 6 (2026-08-07 14:08 UTC+8)

### Findings

本轮无新 finding。

## 结论

- 前轮 finding 复核：
    - `t248_test_f001` 已消除。`tests/unit/renderer/components/session_library/SessionLibrary.test.tsx:580-608` 继续覆盖首屏 50 条、短页追加、加载更多按钮消失，以及快速双击不重复请求同一 `offset`。
    - `t248_test_f002` 已消除。`tests/unit/main/core/token-stats/token-stats-store.test.ts:432-466` 仍以真实内存 SQLite 断言搜索、source、日期交集、排序与精确 `limit/offset` 结果；renderer 的筛选传参与分页重置覆盖仍在 `SessionLibrary.test.tsx:145-219`。
    - `t248_test_f003` 已消除。`tests/unit/ipc/session-history-ipc.test.ts:428-503` 仍断言后端候选、正文 hits 和 sessions 精确映射；`SessionLibrary.test.tsx:221-254` 仍断言不传 renderer 全量 `locs` 且隐藏候选实际渲染。
    - `t248_test_f004` 已消除。`tests/unit/renderer/components/session_library/SessionLibrary.test.tsx:256-294` 仍覆盖加载更多后仅为新可见会话发起第二次摘要请求，首批不重复。
    - `t248_test_f005` 已消除。`SessionLibrary.test.tsx:110-143` 仍在首屏列表 resolve 前后断言 `getSessions` 只有一次，并让意外第二页请求显式失败。
    - `t248_test_f006` 已消除。`tests/unit/main/core/token-stats/token-stats-store.test.ts:437-451` 仍覆盖 tokens/calls 双向排序；`SessionLibrary.test.tsx:382-427` 仍断言普通分页排序参数与实际卡片顺序。
    - `t248_test_f007` 已消除。`SessionLibrary.test.tsx:610-625` 仍覆盖首屏成功、第二页 reject 后保留首屏数据并显示加载中断提示。
    - Round 5 的 `t248_code_f011` 回归测试已存在且可信：`SessionLibrary.test.tsx:565-578` 先成功显示筛选前会话，再让筛选后的首屏请求 reject，断言加载失败并且旧会话不再渲染。
- 改测方向复核：无。当前 diff 未删除关键测试或断言，未使用 `.skip`/`.only`、注释断言、静默类型错误、扩大阈值或 mock 被测逻辑；真实 SQLite、`SessionLibrary` 与 IPC handler 均被直接触达，mock 保持在约定的 Electron/preload/service 边界。旧的 model 搜索预期改为不命中与 AC4 的新字段契约一致，不属于迁就实现。
- 本轮新发现：0 条。
- 未进表的提示：目标相关 5 个测试文件通过（157 tests）；全量 `pnpm test` 通过（237 个 test files，2552 passed，1 skipped）；`pnpm exec tsc --noEmit`、目标测试文件 `eslint --max-warnings=0` 与 `git diff --check c4697f3d805a9cace58538248175bb6be0cd9835` 均通过。目标 renderer 测试仍有既有 `act(...)` stderr 警告，但未形成当前 task 的假绿证据；真实大数据量渲染帧率按 spec 上下文区明确不测。
- 总体判断：Round 5 回归测试及前轮全部 test blocking finding 均已由可执行、触达生产逻辑的断言覆盖，当前没有未解决的 critical / important test finding。
- 系统性 follow-up：无。

verdict: PASS

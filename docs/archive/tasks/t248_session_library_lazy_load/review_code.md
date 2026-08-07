# Task review t248（reviewer_focus: 代码）

- task：`t248_session_library_lazy_load`
- spec：`docs/tasks/t248_session_library_lazy_load/spec.md`
- diff_anchor：`c4697f3d805a9cace58538248175bb6be0cd9835`
- target：`git diff c4697f3d805a9cace58538248175bb6be0cd9835`
- round：Round 1
- reviewed_at：2026-08-07 12:39 UTC+8

## Findings

### t248_code_f001 - Agent 筛选选项只由当前已加载页生成

- 严重度：important
- 锚点：AC4；选择 Agent 后结果应与全量内存过滤一致，并且用户可实际选择任一 Agent。
- 位置：`src/renderer/components/session-library/SessionLibrary.tsx:113-117,138-147`；`src/renderer/components/session-library/AgentFilterChips.tsx:20-37`
- 问题：`agent_counts` 遍历的是 `all`，而 `all` 现在只包含已加载的分页结果。首屏排序恰好返回 50 条 `claude_code` 会话、而 `opencode` 只有在第 51 条之后时，Agent chips 中不会出现 `opencode`，用户无法选择它；即使多个 Agent 出现在首屏，显示的数量也只是已加载页数量，不是全量数量。旧实现中 `all` 是循环加载的全量列表，因此该行为发生了回归。
- 建议：增加不依赖会话全量列表的 Agent/source 聚合或稳定的 Agent 列表通道，并用其渲染筛选选项与计数；筛选结果仍通过后端分页查询。

### t248_code_f002 - 后端搜索口径与既有内存过滤不一致并破坏分页

- 严重度：important
- 锚点：AC4；标题/路径/会话 ID 搜索结果必须与原内存过滤结果一致。
- 位置：`src/main/core/token-stats/token-stats-store.ts:1047-1051`；`src/renderer/lib/session-library/filter.ts:18-35`；分页消费位于 `src/renderer/components/session-library/SessionLibrary.tsx:138-151,187-196`
- 问题：renderer 的既有口径只在 `title`、`directory`、`id` 上做大小写不敏感的字面 `includes`，但 SQL 同时把 `model` 加入匹配字段，并直接把用户输入拼入 `LIKE '%...%'`，因此 `%`、`_` 会被当作通配符。更严重的是 renderer 仍会对每个返回页按旧口径再次过滤，并把过滤后的 `all.length` 当作下一页 offset：例如前 50 条中有许多仅因 `model` 命中的行，它们会被 renderer 丢弃，但已经消耗了 SQL offset，后续真正标题命中的行可能永远不会被加载。
- 建议：让 SQL 过滤字段和字面匹配语义严格对齐 `filter_sessions`（不包含 `model`，并转义 LIKE 通配符或改用等价的字面匹配表达式），同时避免用“本地过滤后的条数”推进后端分页 offset。

### t248_code_f003 - 内容搜索丢失未加载页的元信息命中

- 严重度：important
- 锚点：AC5；勾选「包含消息内容」时，结果应保持现有“元信息命中与正文命中并集”的可观察语义，同时不要求 renderer 持有全量列表。
- 位置：`src/renderer/components/session-library/SessionLibrary.tsx:212-227,250-269`
- 问题：启用内容搜索后，后端请求只按 Agent/日期扫描候选集，响应中的 `sessions` 只包含正文命中的会话；renderer 的元信息结果 `filtered` 只从当前分页的 `all` 计算。若第 51 条之后的会话标题/路径/ID 命中关键词但正文不命中，后端不会把它放进 `content_sessions`，renderer 也没有全量 `all` 可供 `filtered` 使用，因此该会话不会显示。基线实现中全量列表上的 `filter_sessions(all, library_filters)` 会保留这类元信息命中，随后再与正文命中取并集。
- 建议：在后端内容搜索响应中同时返回后端元信息过滤得到的命中会话，或增加独立的后端元信息搜索分页/合并查询；renderer 不应依赖首屏页来构造内容搜索的元信息部分。

### t248_code_f004 - 「加载更多」缺少请求中的并发保护，快速点击会重复追加同一页

- 严重度：important
- 锚点：AC3；每次加载更多应追加下一页，而不是重复同一个 offset 的页面。
- 位置：`src/renderer/components/session-library/SessionLibrary.tsx:180-201`
- 问题：`load_more` 在请求开始后没有设置 loading 状态或 ref 锁，`has_more` 在请求完成前仍为 true。用户快速连续点击两次时，两次闭包都读取同一个 `all.length`，发出相同 `offset` 的请求；两个响应随后都执行 `set_all(current => [...current, ...processed])`，导致同一页会话重复渲染，并错误增加 `visible`。
- 建议：增加 `loading_more` 状态/ref，在请求进行期间禁用按钮或直接返回；仅在请求完成后释放锁并根据实际页结果更新 `has_more`。

## 结论

- 前轮 finding 复核：无（Round 1）。
- 本轮新发现：4 条（4 important）。
- 未进表的提示：
    - 文件规模：`src/renderer/components/session-library/SessionLibrary.tsx` 538 行、`src/main/core/session-history/subscription-service.ts` 691 行、`src/main/core/local-api/server.ts` 703 行、`src/preload/index.ts` 683 行、`src/shared/types/ipc.ts` 628 行均达到实现文件 minor 阈值且本 task 有净增；`src/main/index.ts` 1082 行、`src/main/core/token-stats/token-stats-store.ts` 1473 行达到 important 文件规模阈值且有净增；`tests/unit/renderer/components/session_library/SessionLibrary.test.tsx` 706 行达到测试文件 minor 阈值且有净增。按提示规则文件过大只列结论，不单独进 finding 表。生成物、vendor、lockfile 未计入。
    - 复杂度：未发现达到需进 finding 表的新增函数圈复杂度问题。
    - IPC/preload 类型一致性：`TOKEN_STATS_SESSION_STATS`、分页过滤类型与内容搜索响应类型在共享类型、main IPC、preload 和 renderer 间可通过类型检查；未发现额外协议不一致。
    - 后端分页/取消：main 按 sender 保存内容搜索 `AbortController`，service 的并发限制和 `AbortSignal` 路径存在；本轮未将其本身列为 finding，但内容搜索结果合并缺口见 `t248_code_f003`。
    - 统计口径：`query_session_stats` 使用会话表的 `COUNT(*)`、`COUNT(DISTINCT source)` 和四类 token `SUM`，与既有头部累计口径一致；统计 IPC 与列表 IPC 独立发起。
- 验证：`pnpm exec vitest run tests/unit/renderer/components/session_library/SessionLibrary.test.tsx tests/unit/ipc/session-history-ipc.test.ts tests/unit/ipc/token-stats-ipc.test.ts tests/unit/main/core/token-stats/token-stats-store.test.ts tests/unit/preload/token_stats_session_library.test.ts` 通过（5 files, 145 tests）；`pnpm exec tsc --noEmit` 通过。现有测试未覆盖上述隐藏页 Agent/元信息、LIKE 口径和快速重复点击场景。
- 总体判断：当前实现仍有 AC3、AC4、AC5 的可观察行为缺陷，且存在分页结果丢失/重复风险，未解决 important findings 阻断通过。
- 系统性 follow-up：无。

verdict: FAIL

## Round 2 (2026-08-07 13:09 UTC+8)

## Findings

### t248_code_f005 - 内容搜索结果忽略当前排序选项

- 严重度：important
- 锚点：非范围约束「不改变会话库的排序选项」；用户选择排序后，内容搜索结果仍应保持该排序。
- 位置：`src/renderer/components/session-library/SessionLibrary.tsx:183-184,207-215`；`src/main/ipc/session-history-ipc.ts:111-116,240-254`
- 问题：进入「包含消息内容」搜索后，renderer 直接把后端返回的 `sessions` 作为 `content_filtered`，没有再按当前 `sort` 排序；发给后端的内容搜索 filters 也没有携带排序字段，main 的候选集和元信息查询因此都使用 store 默认的 `ended_at DESC`。例如用户先选择「Token 最多」或「最早创建」，再输入关键词，命中会话会按最近活跃顺序展示，排序选项失效。
- 建议：把当前排序映射传入内容搜索候选/元信息查询，或在 renderer 合并后按当前 `sort` 排序；两部分必须使用同一稳定排序。

### t248_code_f006 - 聚合统计失败时静默回退为首屏部分统计

- 严重度：important
- 锚点：AC2；头部会话数、Agent 数和 tokens 必须与全量数据一致，并独立于首屏分页列表。
- 位置：`src/renderer/components/session-library/SessionLibrary.tsx:88-105`
- 问题：`getSessionStats()` 被拒绝时，catch 直接吞掉异常，`session_stats` 保持 `null`；随后 `stats` 回退到 `count_stats(all)`，而 `all` 只包含首屏最多 50 条。全量有 50 条以上且统计 IPC 暂时失败时，头部会显示首屏的会话/token 数，Agent chips 也回退为首屏来源，产生可见的错误统计而不是明确的失败状态。
- 建议：为统计请求维护独立的失败/不可用状态，失败时不要把分页列表统计冒充全量统计；显示不可用或保留可重试的统计状态，并记录/处理错误。

## 结论

- 前轮 finding 复核：`t248_code_f001` 已消除：生产路径新增 `TOKEN_STATS_SESSION_STATS` 返回全量 `source_counts`，renderer 优先使用该聚合渲染 Agent chips；`t248_code_f002` 已消除：SQL 仅匹配 title/directory/id，且字面转义 LIKE 通配符，renderer 不再二次过滤或用过滤后数量推进 offset；`t248_code_f003` 已消除：main 合并后端元信息命中与正文命中并返回 `sessions`，renderer 不再从分页 `all` 构造内容搜索元信息结果；`t248_code_f004` 已消除：加载更多使用 ref 并发锁并禁用按钮，重复点击不会重复请求同一 offset。
- 本轮新发现：2 条（2 important）。
- 未进表的提示：文件规模与新增函数复杂度未产生需进 finding 表的问题；生成物、vendor、lockfile 未计入。现有回归测试未覆盖内容搜索与当前排序组合，也未覆盖统计 IPC 失败时的头部一致性。
- 验证：`pnpm exec vitest run tests/unit/renderer/components/session_library/SessionLibrary.test.tsx tests/unit/ipc/session-history-ipc.test.ts tests/unit/ipc/token-stats-ipc.test.ts tests/unit/main/core/token-stats/token-stats-store.test.ts tests/unit/preload/token_stats_session_library.test.ts` 通过（5 files, 146 tests）；`pnpm exec tsc --noEmit` 通过；`git diff --check c4697f3d805a9cace58538248175bb6be0cd9835` 通过。
- 总体判断：四条前轮 code finding 已修复，但内容搜索排序回归和统计失败时的错误部分统计仍为未解决 important finding，当前不能通过。
- 系统性 follow-up：无。

verdict: FAIL

## Round 3 (2026-08-07 13:24 UTC+8)

## Findings

### t248_code_f007 - Unicode 大小写不敏感搜索与既有内存过滤不一致

- 严重度：important
- 锚点：AC4；标题/路径/会话 ID 搜索结果必须与既有全量内存过滤结果一致。
- 位置：`src/main/core/token-stats/token-stats-store.ts:1047-1052`；对照 `src/renderer/lib/session-library/filter.ts:29-33`
- 问题：renderer 的既有过滤先对标题、路径和 ID 执行 JavaScript `toLowerCase().includes()`，支持 Unicode 大小写折叠；后端改用 SQLite `LIKE`，其默认大小写不敏感规则只覆盖 ASCII。会话标题为 `Привет`、搜索词为 `привет` 时，旧内存过滤命中，但当前 SQL 条件返回 0，用户看不到应命中的会话，违反 AC4。已用项目运行时 SQLite 验证：`SELECT 'Привет' LIKE '%привет%'` 返回 `0`，而 `'Привет'.toLowerCase().includes('привет')` 为 `true`。
- 建议：让后端搜索与既有 Unicode 不区分大小写语义一致（例如对存储值和查询值采用统一 Unicode 规范化/大小写折叠后比较，或使用已验证支持该语义的 SQLite 查询方案），同时保留 `%`、`_`、反斜杠的字面匹配。

## 结论

- 前轮 finding 复核：`t248_code_f001` 已修复：统计 IPC 返回全量 `source_counts`，renderer 不再从分页列表生成 Agent 选项；`t248_code_f002` 的字段范围、LIKE 通配符转义和分页 offset 缺陷已修复，但其“严格复刻内存过滤语义”仍存在本轮 `t248_code_f007` 的 Unicode 残余；`t248_code_f003` 已修复：后端合并元信息命中与正文命中并返回会话；`t248_code_f004` 已修复：加载更多使用 ref 锁并禁用按钮；`t248_code_f005` 已修复：内容搜索结果按当前 `sort` 统一排序；`t248_code_f006` 已修复：统计失败显示“统计不可用”，不回退为首屏部分统计或 Agent chips。
- 本轮新发现：1 条（1 important）。
- 未进表的提示：未发现新增文件规模或函数复杂度达到需进 finding 表的问题；生成物、vendor、lockfile 未计入。
- 验证：`pnpm exec vitest run tests/unit/renderer/components/session_library/SessionLibrary.test.tsx tests/unit/ipc/session-history-ipc.test.ts tests/unit/ipc/token-stats-ipc.test.ts tests/unit/main/core/token-stats/token-stats-store.test.ts tests/unit/preload/token_stats_session_library.test.ts` 通过（5 files, 148 tests；含排序、统计失败和分页并发回归）；`pnpm exec tsc --noEmit` 通过；`git diff --check c4697f3d805a9cace58538248175bb6be0cd9835` 通过；项目运行时 SQLite/JavaScript Unicode 搜索对照复现上述差异。
- 总体判断：Round 1/2 的既有修复大部分成立，但 AC4 仍有可观察的 Unicode 搜索漏结果，未解决 important finding 阻断通过。
- 系统性 follow-up：无。

verdict: FAIL

## Round 4 (2026-08-07 13:41 UTC+8)

## Findings

### t248_code_f008 - 内容搜索失败时继续展示上一关键词的结果

- 严重度：important
- 锚点：AC5；内容搜索结果必须与当前关键词和筛选条件一致；错误路径不能把旧结果冒充当前结果。
- 位置：`src/renderer/components/session-library/SessionLibrary.tsx:199-201,219-251`
- 问题：内容搜索 effect 在发起新关键词/筛选查询时只设置 `content_searching=true`，没有清空 `content_sessions`；请求失败的 `catch` 也只设置 `content_searching=false`，不清除旧结果或设置错误状态。用户先搜索 `旧关键词` 得到会话 A，再改搜 `新关键词`，若第二次 `searchContent` reject，`content_filtered` 仍从旧的 `content_sessions` 渲染，会话 A 会在新关键词下继续显示，且界面没有提示搜索失败。这是可观测的错误结果和 swallowed error。
- 建议：新查询开始时清空或标记结果为过期；失败时清空当前结果并显示明确的搜索失败状态，避免沿用上一查询的会话集合。

### t248_code_f009 - 后端搜索无法复刻旧的跨字段字面匹配语义

- 严重度：important
- 锚点：AC4；标题/路径/会话 ID 搜索结果必须与既有全量内存过滤结果一致。
- 位置：`src/main/core/token-stats/token-stats-store.ts:1050-1055`；对照 `src/renderer/lib/session-library/filter.ts:29-33`
- 问题：旧 renderer 先把 `title`、`directory`、`id` 用单个空格连接，再对整个字符串执行 `toLowerCase().includes(q)`；当前 SQL 则要求关键词分别出现在三个字段之一。比如某行 `title="foo"`、`directory="bar"`、`id="s1"`，搜索 `"foo bar"` 时旧实现的 haystack 是 `"foo bar s1"`，会命中，而当前三个 `LIKE '%foo bar%'` 条件都不命中，结果被后端分页直接丢弃。该差异与 Round 3 已修复的 Unicode/通配符语义问题独立，仍违反 AC4。
- 建议：让 SQL 按旧实现对 `COALESCE(title,'') || ' ' || COALESCE(directory,'') || ' ' || id` 的拼接值做字面大小写不敏感匹配，并继续保留通配符转义；或明确迁移并验证新的字段边界语义后同步契约。

### t248_code_f010 - 筛选切换期间旧分页请求会解除新请求的并发锁

- 严重度：important
- 锚点：AC3；每次「加载更多」必须只追加当前筛选/排序下的下一页，不能因并发请求重复追加同一 offset。
- 位置：`src/renderer/components/session-library/SessionLibrary.tsx:123-129,160-179`
- 问题：筛选/排序变化时 effect 无条件把 `load_more_inflight_ref.current` 置回 `false`，但未取消旧的加载更多请求。若旧请求 R1 尚未完成，用户切换筛选后点击新列表的「加载更多」发起 R2，此时 R1 或其拒绝路径执行 `.finally()`，又无条件把共享 ref 和 `loading_more` 清零；用户可再次点击并发发出与 R2 相同 offset 的 R3，导致同一页重复请求，响应成功后可能重复追加会话。R1 的 `.then()` 虽用 seq 丢弃了旧数据，但 `.finally()` 没有同样的 seq 守卫。
- 建议：在 `.finally()` 中仅当请求 seq 仍是当前 seq 时释放锁和 loading 状态；或为每轮筛选取消/隔离旧分页请求，避免旧请求修改新查询的并发状态。

## 结论

- 前轮 finding 复核：`t248_code_f001` 至 `t248_code_f006` 的修复仍成立；`t248_code_f007` 已消除，当前 `query_sessions` 注册了 `unicode_lower`，并由 SQLite/renderer 回归测试覆盖 Unicode 大小写不敏感搜索与通配符字面匹配。
- 本轮新发现：3 条（3 important）。
- 未进表的提示：实现文件 `src/renderer/components/session-library/SessionLibrary.tsx` 当前 523 行、`src/main/core/session-history/subscription-service.ts` 691 行、`src/main/core/local-api/server.ts` 703 行、`src/preload/index.ts` 683 行达到实现文件 minor 阈值且本 task 有净增；`src/main/core/token-stats/token-stats-store.ts` 1488 行、`src/main/index.ts` 1082 行达到 important 文件规模阈值且有净增；测试文件 `tests/unit/renderer/components/session_library/SessionLibrary.test.tsx` 910 行达到测试文件 minor 阈值且有净增。按提示规则仅列结论，不单独进 finding 表。未发现本轮新增函数圈复杂度达到需进 finding 表的情况；生成物、vendor、lockfile 未计入。
- 验证：`pnpm exec vitest run tests/unit/renderer/components/session_library/SessionLibrary.test.tsx tests/unit/ipc/session-history-ipc.test.ts tests/unit/ipc/token-stats-ipc.test.ts tests/unit/main/core/token-stats/token-stats-store.test.ts tests/unit/preload/token_stats_session_library.test.ts` 通过（5 files，153 tests）；`pnpm exec tsc --noEmit` 通过；`git diff --check c4697f3d805a9cace58538248175bb6be0cd9835` 通过。现有测试未覆盖内容搜索失败后的旧结果残留、跨字段空格搜索和筛选切换期间旧分页请求释放新锁。
- 总体判断：前轮 Unicode blocker 已修复，但当前仍存在内容搜索失败展示错误结果、AC4 搜索语义漏结果和 AC3 分页并发状态错乱三项未解决 important finding，不能通过。
- 系统性 follow-up：无。

verdict: FAIL

## Round 5 (2026-08-07 13:55 UTC+8)

## Findings

### t248_code_f011 - 筛选请求失败时仍展示上一筛选的数据

- 严重度：important
- 锚点：AC4；设置搜索、Agent 或日期筛选后，列表结果应与当前筛选条件一致；请求失败时也不能把上一条件的结果冒充当前结果。
- 位置：`src/renderer/components/session-library/SessionLibrary.tsx:124-147,199-200,272-273`
- 问题：筛选或排序变化会启动新的首屏请求，但 effect 开始时没有清空 `all`，`load_first_page` 的 `catch` 也只设置 `load_error`，未清除旧列表。由于当前 `filtered` 直接等于 `all`，用户先加载出筛选 A 的会话，再切换到筛选 B 且 B 的 `getSessions` 请求失败时，界面仍渲染筛选 A 的会话；此时 `load_error` 只会在列表非空时额外显示“会话列表加载中断”，不能阻止错误结果展示。该失败场景产生与当前筛选不一致的可观测列表结果。
- 建议：开始新筛选轮次时清空或标记旧 `all` 为过期，并在首屏请求失败时展示当前筛选的明确错误/空态；不要继续把旧筛选结果作为当前列表。

## 结论

- 前轮 finding 复核：
    - `t248_code_f001` 至 `t248_code_f006` 仍已修复：全量 Agent 统计、SQL 字面搜索与分页 offset、内容搜索元信息并集、加载更多并发锁、内容搜索排序、统计失败状态均保持正确。
    - `t248_code_f007` 仍已修复：`query_sessions` 使用已注册的 `unicode_lower`，并保留 SQL 通配符转义。
    - `t248_code_f008` 已修复：内容搜索 effect 在新查询开始时清空 `content_sessions`，失败时清空结果并展示“消息内容搜索失败”。
    - `t248_code_f009` 已修复：后端按 `title + directory + id` 的拼接 haystack 执行字面、大小写不敏感匹配，与旧 renderer 语义对齐。
    - `t248_code_f010` 已修复：首屏筛选序号与加载更多请求序号一致时才释放并发锁，旧请求的 `finally` 不再解除新请求的锁。
- 本轮新发现：1 条（1 important）。
- 未进表的提示：实现文件 `src/renderer/components/session-library/SessionLibrary.tsx` 533 行、`src/main/core/session-history/subscription-service.ts` 691 行、`src/main/core/local-api/server.ts` 703 行、`src/preload/index.ts` 683 行、`src/shared/types/ipc.ts` 629 行达到实现文件 minor 阈值且本 task 有净增；`src/main/index.ts` 1082 行、`src/main/core/token-stats/token-stats-store.ts` 1488 行达到 important 文件规模阈值且有净增；测试文件 `tests/unit/renderer/components/session_library/SessionLibrary.test.tsx` 997 行达到测试文件 minor 阈值且有净增。按提示规则文件过大只列结论，不单独进 finding 表。未发现本轮新增函数圈复杂度达到需进 finding 表的情况；生成物、vendor、lockfile 未计入。
- 验证：仓库根确认是 `D:/Dev/Code/omni_usage_t248`；`pnpm exec vitest run tests/unit/renderer/components/session_library/SessionLibrary.test.tsx tests/unit/ipc/session-history-ipc.test.ts tests/unit/ipc/token-stats-ipc.test.ts tests/unit/main/core/token-stats/token-stats-store.test.ts tests/unit/preload/token_stats_session_library.test.ts` 通过（5 files，156 tests）；`pnpm exec tsc --noEmit` 通过；针对本轮触及生产文件的 `pnpm exec eslint ... --max-warnings=0` 通过；`git diff --check c4697f3d805a9cace58538248175bb6be0cd9835` 通过。测试输出有既有 React `act(...)` stderr 警告，但未导致失败，本轮不评测试层。
- 总体判断：Round 4 的三项 blocker 修复成立，但筛选/排序首屏请求失败时仍会展示上一条件的旧列表，属于未解决 important 行为缺陷，不能通过。
- 系统性 follow-up：无。

verdict: FAIL

## Round 6 (2026-08-07 14:07 UTC+8)

## Findings

无新 finding。

## 结论

- 前轮 finding 复核：
    - `t248_code_f001` 已修复：Agent 筛选芯片使用独立聚合返回的 `source_counts`，不再由当前分页生成，位置：`src/renderer/components/session-library/SessionLibrary.tsx:93-104`；生产统计由 `src/main/core/token-stats/token-stats-store.ts:1087-1111` 全量聚合。
    - `t248_code_f002` 已修复：后端搜索使用标题、路径、ID 拼接后的字面匹配，注册 `unicode_lower` 并转义 LIKE 通配符；renderer 直接消费后端分页结果，不再二次过滤或用过滤后数量推进 offset，位置：`src/main/core/token-stats/token-stats-store.ts:1050-1055`、`src/renderer/components/session-library/SessionLibrary.tsx:202-205`。
    - `t248_code_f003` 已修复：内容搜索由 main 按 Agent/日期取得候选，并将元信息命中与正文命中合并返回，renderer 使用响应会话集合，位置：`src/main/ipc/session-history-ipc.ts:239-303`、`src/renderer/components/session-library/SessionLibrary.tsx:203-205`。
    - `t248_code_f004` 已修复：加载更多在请求期间设置 ref 锁并禁用按钮，成功后按实际页长度更新列表和 `has_more`，位置：`src/renderer/components/session-library/SessionLibrary.tsx:163-183`。
    - `t248_code_f005` 已修复：内容搜索响应统一通过 `sort_sessions` 按当前排序选项渲染，位置：`src/renderer/components/session-library/SessionLibrary.tsx:203-205`。
    - `t248_code_f006` 已修复：统计请求维护独立的 loading/ready/error 状态，失败时显示“统计不可用”，不再回退为首屏部分统计，位置：`src/renderer/components/session-library/SessionLibrary.tsx:106-121,362-367`。
    - `t248_code_f007` 已修复：SQLite 连接注册 `unicode_lower`，后端搜索保持与 JavaScript `toLowerCase()` 一致的 Unicode 大小写语义，位置：`src/main/core/token-stats/token-stats-store.ts:704-706,1050-1055`。
    - `t248_code_f008` 已修复：内容搜索新查询开始时清空旧结果，失败时清空当前结果并显示明确错误，位置：`src/renderer/components/session-library/SessionLibrary.tsx:224-227,258-261`。
    - `t248_code_f009` 已修复：SQL 对 `title + directory + id` 的拼接 haystack 执行字面匹配，复刻旧 renderer 的跨字段搜索语义，位置：`src/main/core/token-stats/token-stats-store.ts:1053-1055`。
    - `t248_code_f010` 已修复：加载更多请求的 `finally` 仅在请求序号仍为当前序号时释放锁，旧筛选请求不会解除新筛选请求的锁，位置：`src/renderer/components/session-library/SessionLibrary.tsx:166-183`。
    - `t248_code_f011` 已修复：筛选/排序变化启动新首屏请求时立即清空 `all`、重置分页和错误状态，失败时不会继续展示上一筛选数据，位置：`src/renderer/components/session-library/SessionLibrary.tsx:124-149`。
- 本轮新发现：0 条。
- 未进表的提示：`src/renderer/components/session-library/SessionLibrary.tsx` 535 行、`src/main/core/session-history/subscription-service.ts` 691 行、`src/main/core/local-api/server.ts` 703 行、`src/preload/index.ts` 683 行、`src/shared/types/ipc.ts` 629 行达到实现文件 minor 阈值且本 task 有净增；`src/main/index.ts` 1082 行、`src/main/core/token-stats/token-stats-store.ts` 1488 行达到 important 文件规模阈值且本 task 有净增；`tests/unit/renderer/components/session_library/SessionLibrary.test.tsx` 1016 行达到测试文件 minor 阈值且本 task 有净增。按提示规则仅列结论，不单独进 finding 表。未发现本 task 新增函数圈复杂度达到需进 finding 表的情况；生成物、vendor、lockfile 未计入。
- 验证：`pnpm exec vitest run tests/unit/renderer/components/session_library/SessionLibrary.test.tsx tests/unit/ipc/session-history-ipc.test.ts tests/unit/ipc/token-stats-ipc.test.ts tests/unit/main/core/token-stats/token-stats-store.test.ts tests/unit/preload/token_stats_session_library.test.ts` 通过（5 files，157 tests）；`pnpm exec tsc --noEmit` 通过；针对本轮触及生产文件的 `pnpm exec eslint ... --max-warnings=0` 通过；`git diff --check c4697f3d805a9cace58538248175bb6be0cd9835` 通过。
- 总体判断：Round 1 至 Round 5 的全部 code finding 均已在最终 diff 中消除；当前无未解决 critical / important finding，代码审阅通过。
- 系统性 follow-up：无。

verdict: PASS

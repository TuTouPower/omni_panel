# Task review t227（reviewer_focus: 代码）

- task：`t227_session_library_view`
- spec：`docs/tasks/t227_session_library_view/spec.md`
- diff_anchor：`75e6056c6882bc189356c47990a4e381ce625703`
- target：`git diff 75e6056c6882bc189356c47990a4e381ce625703`
- round：1
- reviewed_at：2026-08-06 16:25 UTC+8

## Findings

### t227_code_f001 - 内容搜索用交集而非并集，AC2「正文含关键词的会话出现在结果」不成立

- 严重度：important
- 锚点：AC 2「开启「包含消息内容」后，正文含关键词的会话也出现在结果中」
- 位置：`src/renderer/components/session-library/SessionLibrary.tsx:111-123`（`filtered` 已含元信息 search 过滤；`content_filtered` = `filtered.filter(content hit)`）
- 问题：内容搜索生效时，`content_filtered` 取「元信息命中 ∩ 正文命中」，而 AC 2 的语义是「元信息或正文」并集（默认匹配元信息，开关开启后「连正文一起搜」= 追加正文匹配）。具体失败场景：搜索词 `登录` + 开启「包含消息内容」。会话 A 标题不含「登录」但正文含（应为内容命中），会话 B 标题含「登录」但正文不含（应为元信息命中）。期望 A、B 都出现；实际 `filtered`（元信息）= [B]，`content_hits` = {A}，`content_filtered` = B∩{A} = 空 → 空态「没有匹配的会话」。副效应：仅元信息命中的会话 B 在开启内容搜索后反而从结果消失，与「开启后连正文一起搜」（只应加宽）矛盾。正文搜索 effect（`:125-153`）内 `candidates` 只按 agent/date 过滤（不含元信息 search），说明实现本意就是算「纯正文命中」补充集，最终组成却写成交集。测试侧无组件用例勾选该开关（test reviewer t227_test_f001 同指向），故缺陷全绿通过。
- 建议：`content_filtered` 改为并集：`filtered ∪ (candidates ∩ content_hits)`。把 effect 内候选集提到组件状态，或在 `content_filtered` memo 内基于 `all` 重算 agent/date 过滤集再取命中，与 `filtered` 做 union。

### t227_code_f002 - AC5「首条用户消息摘要」在卡片/列表行未实现

- 严重度：important
- 锚点：AC 5「会话卡片显示 agent 色条、徽标、标题、首条用户消息摘要、`轮数 · tokens · 相对日期`、cwd/路径」
- 位置：`src/renderer/components/session-library/SessionLibrary.tsx:517-578`（SessionCard / SessionRow）
- 问题：卡片与行渲染元素为：色条（`.lib-card-accent`）、徽标（`agent_abbrev`）、标题（`s.title ?? s.id`）、meta 行（轮数/tokens/相对日期）、目录。全程无「首条用户消息摘要」元素（全仓 grep「摘要/summary/first」无命中；CSS 亦无对应类）。spec 上下文区方案明确「首条用户消息摘要…经 `sessionHistory.query` 读消息正文」，实现仅在预览抽屉（`:173-184`）读消息，卡片未读。AC 5 缺项。推测为免每卡一次 query 而省略，属未记录的裁剪。
- 建议：补卡片首条 user 消息摘要渲染；来源可复用预览链路按需惰性加载，或从 sessionHistory query 取首条 user 消息截断。若判定该元素应移除，须改 spec AC 5 并记录处置（按规则「实现合理但与 spec 不符→处置为改 spec」不计 FAIL，但此处是缺失而非 spec 过时，先确认意图）。

### t227_code_f003 - query_sessions `order_by`/`direction` 直接拼接 SQL，IPC 层无运行时白名单

- 严重度：important
- 锚点：行为缺陷（安全/数据完整性）；本 task 上下文区方案新增的查询参数在 IPC 信任边界未校验
- 位置：`src/main/core/token-stats/token-stats-store.ts:1063-1068`；`src/main/ipc/token-stats-ipc.ts:50-70`
- 问题：`ORDER BY ${order_expr} ${direction}, ended_at DESC` 中 `order_expr = filters.order_by ?? "ended_at"`（仅 `"tokens"` 特判）与 `direction = filters.direction ?? "desc"` 均未做白名单校验，直接内插。类型约束（`"ended_at"|"tokens"|"calls"|"started_at"` / `"asc"|"desc"`）仅编译期，IPC handler 把 `filters` 原样透传给 store，任何能调 `tokenStats:sessions` 通道的 renderer 代码可传任意字符串（如 `order_by: "ended_at"` 配合 `direction: "(SELECT sql FROM sqlite_master)--"`）形成单语句内 ORDER BY 注入：读库结构、条件注入、或 `prepare` 抛错致查询崩溃。项目同文件已有 IPC 入参 zod 校验惯例（`:123` dashboard 用 `tokenStatsDashboardQuerySchema.safeParse`），本通道未沿用。缓解项：`src/preload/index.ts:120-130` 与 `src/shared/types/ipc.ts:553-559` 的 `getSessions` 类型未暴露新参数，当前 renderer 走不到该注入路径——但这只说明「现在没人调用」，注入面仍经 IPC 可达，防御纵深要求校验。
- 建议：`order_by`/`direction` 按枚举白名单映射为固定 SQL 片段（如 `ORDER_BY_EXPR: Record<string,string>`），非法值回落默认或抛 `INVALID_ARGUMENT`；方向同理。

### t227_code_f004 - 内容搜索异步无取消/序号，旧查询迟到覆盖新结果

- 严重度：important
- 锚点：行为缺陷（并发时序）
- 位置：`src/renderer/components/session-library/SessionLibrary.tsx:125-153`
- 问题：内容搜索 effect 内部 `void (async () => {...})()` 无 cleanup、无 AbortController、无序号守卫，依赖 `[search, search_content, all, agents, start_at, end_at]`。用户连击/改词时多个异步 run 并发，各自最后整体写 `content_hits_ref.current` 并 `set_content_searching(false)`——迟到完成者胜。场景：搜 `login`（候选多、慢）中途改成 `login bug`（候选少、快），新 run 先写完，旧 run 后覆盖为 `login` 的命中集：搜索框显示 `login bug`，结果却是 `login` 的命中；且旧 run 的 `set_content_searching(false)` 会在新 run 进行中提前关掉「搜索消息内容中…」提示。由于依赖不变后不再触发 effect，错误结果一直停留到用户再次改输入。
- 建议：effect 内维护递增序号 ref，每次 run 自增并捕获本地序号，写回前校验「仍是当前序号」否则丢弃；`content_searching` 状态同样按序号守卫；cleanup 置取消标志。

### t227_code_f005 - 预览抽屉消息异步加载竞态，可显示前一会话的消息

- 严重度：minor
- 锚点：行为缺陷（并发时序）
- 位置：`src/renderer/components/session-library/SessionLibrary.tsx:173-184`
- 问题：`open_preview` 把 `preview` 置为新会话后异步 `query`，无取消/序号。快速连续点 A、B 两张卡的「预览」：A 的 query 慢、B 的快，B 先回 `preview_msgs`=B 消息，A 后回则把 `preview_msgs` 覆盖为 A 的消息，而 `preview` 头是 B —— B 抽屉内展示 A 的消息。与 f004 同根（无序列守卫）。
- 建议：同 f004 序号方案，或在 `open_preview` 记录会话 id，`.then` 内校验仍为当前 preview 才写。

### t227_code_f006 - `toggle_select` 在 `set_selected` updater 内调 `show_toast`（updater 不纯）

- 严重度：minor
- 锚点：代码质量（控制流/副作用）
- 位置：`src/renderer/components/session-library/SessionLibrary.tsx:157-166`
- 问题：`set_selected((prev) => { if (prev.length >= MAX_SELECT) { show_toast(...); return prev; } ... })` —— `show_toast` 触发另一处 `set_toast` + 计时器，属在 setState updater 内执行副作用。React 要求 updater 纯函数；StrictMode 下会双调 updater → 双弹 toast 计时器，且该模式脆弱。当前可用但不该。
- 建议：把超限判断移出 updater：先读 `selected`（或 ref）判断长度，超限直接 `show_toast` 后 return；updater 内只做纯数组变换。

### t227_code_f007 - 会话库一次性 `getSessions({ limit: 10000 })`，超 1 万静默截断且分页纯前端切片

- 严重度：minor
- 锚点：AC 1「统计行与全量数据一致」/ AC 9 在规模下的边界
- 位置：`src/renderer/components/session-library/SessionLibrary.tsx:58-71`
- 问题：组件启动一次拉全量 `limit: 10000`，统计行、agent 计数、筛选全在内存完成；「加载更多」只是 `visible` 切片（`:373-383`）。当会话数 >10000：统计行/agent 计数按 10000 计，与全量不一致（AC 1 边界），超出部分永远搜不到。本 task 已把 main 侧 `query_sessions` 扩展出 `limit/offset/sources/order_by` 等能力（`token-stats-store.ts:1060-1070`），但 renderer 未消费，分页仍是纯前端。
- 建议：改用 `offset` 增量拉取（加载更多时按 `PAGE_SIZE` 翻页），或至少把上限抬到可配置并在统计行用后端 COUNT；若维持全量拉取，把 10000 硬编码提取为常量并注明取舍。

### t227_code_f008 - 选中/托盘槽位以 `s.id` 为身份，跨 source/env 同 id 会串选

- 严重度：minor
- 锚点：行为缺陷（边界条件）
- 位置：`src/renderer/components/session-library/SessionLibrary.tsx:159`（`prev.some(x => x.id === s.id)`）、`:197`（`selected_ids` 按 `s.id`）、`:462`（dock key=`s.id`）
- 问题：工作台层身份键是 `source|env|session_id`（`WorkspaceView.tsx` `loc_key`），本组件网格卡片 key 也用了 `${source}|${env}|${id}`（`:337`），但勾选身份与 dock 键只按 `id`。同 source 不同 env 或同 id 跨 source 时（`token_stats_sessions` 主键正是 `(id, source, env)`，`token-stats-store.ts:188`），勾选 A 会连带选中同 id 的 B、dock 槽位 key 冲突、去重失效。当前 agent 集 id 命名空间不同碰撞概率低，属潜在缺陷。
- 建议：统一以 `${source}|${env}|${id}` 作为勾选身份与 dock key，与工作台 `loc_key` 对齐。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：8 条
- 未进表的提示：
    - 文件过大（本 task 新建文件，超 minor 阈值 400）：`src/renderer/components/session-library/SessionLibrary.tsx` 584 行；`src/renderer/styles/session-library.css` 704 行。均未给不可拆硬约束，建议拆分（组件拆 `SessionCard`/`SessionRow`/`SelectionDock`/`PreviewDrawer` 子组件；CSS 按区块拆文件）。
    - 复杂度：`SessionLibrary` 单组件函数承载全部状态与约 10 个内联回调（`toggle_select`/`open_session`/`open_preview`/`filtered`/内容搜索 effect 等），未用工具实测 McCabe，按体积与分支量提示关注，不进 finding 表。
    - 范围外观察：main 侧 `query_sessions` 扩展（`sources`/`start_at`/`end_at`/`order_by`/`direction`）被实现并测试（`token-stats-store.test.ts:319-368`），但 renderer 全量拉取 + 前端过滤，扩展在当前功能中未被消费；且 `preload`/`UsageboardApi.getSessions` 类型（`src/preload/index.ts:120`、`src/shared/types/ipc.ts:553`）未同步暴露新参数，IPC 层与类型面不一致。倾向确认：保留扩展作为能力但补 preload 类型，或收敛到前端过滤并标注扩展为待用。若采用服务器端过滤，f003 注入面会变成真实可达，需同步白名单。
    - `format_tokens` 与 `src/renderer/lib/workspace/slots.ts:124` 同名函数输出口径不同（`toLocaleString("en-US")` vs `String(n)`），同指标两处格式不一致，属轻微 DRY 分叉，未造成可观测缺陷，不单列 finding。
- 总体判断：AC 2 语义错误（交集非并集）、AC 5 缺「首条用户消息摘要」元素、IPC SQL 拼接注入、内容搜索并发竞态 4 条未解决 important；本轮 FAIL。
- 系统性 follow-up：无

verdict: FAIL

## Round 2 (2026-08-06 17:35 UTC+8)

## Findings

### t227_code_f009 - 内容搜索命中集与并集去重仍按裸 `s.id`，与 f008 的 key_of 主键不一致

- 严重度：minor
- 锚点：行为缺陷（边界条件，跨 source/env 同 id）
- 位置：`src/renderer/components/session-library/SessionLibrary.tsx:183`（`hits.add(s.id)`）、`:154-156`（`extra` 去重 `f.id === s.id`）
- 问题：f008 已把勾选身份/dock/grid 键统一为 `key_of` = `source|env|id`，但 f001 并集修复仍以 `s.id` 作为内容命中成员与去重键。`token_stats_sessions` 主键为 `(id, source, env)`（token-stats-store.ts:188），同 id 跨 source/env 时：会话 A（source1, id=X）元信息命中在 `filtered` 内、会话 B（source2, id=X）正文命中，则 `filtered.some(f => f.id === s.id)` 因 A 命中而把 B 从 `extra` 排除——B 应出现却消失；且 `hits` 集合两会话共享一个 id 成员，命中归属无法区分。与 f008 同属低概率碰撞类，但 f001 修复未沿用新主键，属内部不一致。
- 建议：`hits` 存 `key_of(s)`，`extra` 去重比较改为 `!filtered.some(f => key_of(f) === key_of(s))`，与 f008 主键口径对齐。

### t227_code_f010 - `ensure_summary` 在 setState updater 内触发异步查询（updater 不纯，StrictMode 下重复请求）

- 严重度：minor
- 锚点：代码质量（控制流/副作用）；与本 task 已修 f006 同根
- 位置：`src/renderer/components/session-library/SessionLibrary.tsx:67-81`（`set_summaries(prev => { … window.usageboard.sessionHistory.query(...) … })`）
- 问题：f002 的 `ensure_summary` 在 `set_summaries` 的 updater 函数体内发起 `sessionHistory.query` 副作用——正是 f006 已修掉的「updater 不纯」反模式。应用入口 `src/renderer/index.tsx:15` 启用 `<StrictMode>`，dev 下 React 双调 updater → 首屏每张可见卡触发两次重复查询（生产单次）。功能正确但属可观测的重复请求与脆弱模式。
- 建议：把 query 移出 updater，先查 ref/map 判断该 key 是否已请求/已缓存，未请求再发起，updater 内只做纯占位写入。

### t227_code_f011 - 清空搜索或关闭「包含消息内容」时 `content_searching` 不复位，提示残留至孤立查询跑完

- 严重度：minor
- 锚点：行为缺陷（并发时序，f004 修复残余）
- 位置：`src/renderer/components/session-library/SessionLibrary.tsx:163-192`
- 问题：内容搜索 effect 在 `!search || !search_content` 时提前 return，既不递增 `content_seq_ref` 也不 `set_content_searching(false)`。用户在正文搜索进行中清空搜索框/取消勾选 → 正在跑的异步循环序号仍等于当前序号（未被失效），「搜索消息内容中…」横幅一直显示到该孤立循环跑完（候选多时可达数秒）；期间 `content_hits` 被旧查询写入但未展示（`content_filtered` 短路过），无显示影响，仅提示残留。f004 主竞态已修，此为短路径遗漏。
- 建议：短路径分支里 `set_content_searching(false)` 并 `++content_seq_ref.current` 使在途查询失效。

### t227_code_f012 - offset 分页拉全量时 `catch { break }` 静默截断，统计行按部分数据展示

- 严重度：minor
- 锚点：行为缺陷（错误处理/数据完整性，AC1 边界）
- 位置：`src/renderer/components/session-library/SessionLibrary.tsx:89-99`
- 问题：f007 的 offset 翻页循环在任一页 `getSessions` 抛错时 `break`，不重试、不提示。中途失败 → `all` 静默部分数据，页头统计行（AC1「与全量一致」）按部分计数展示且无标识；首页即失败 → 会话库显示空态（与真实「无会话」无法区分）。IPC 失败属异常路径，但静默截断违背「统计行与全量一致」的可验证含义。
- 建议：失败时记录错误并至少提示一次（toast 或状态位），可保留已拉部分；或对瞬时错误有限重试后放弃并明示。

## 结论

- 前轮 finding 复核（以 diff 与代码为准）：
    - `f001`（important）已消除：`content_filtered` 改并集（`filtered ∪ extra`），验证 normal 路径元信息∪正文正确；残余 id 口径不一致 → 新 `f009`。
    - `f002`（important）已消除：`ensure_summary` 懒加载首条 user 消息，`SessionCard`/`SessionRow` 渲染 `.lib-card-summary`/`.lib-row-summary`，CSS 类存在；残余 updater 不纯 → 新 `f010`。
    - `f003`（important）已消除：`order_by`/`direction` 经三元链白名单回落固定 SQL 片段（非法值落 `ended_at`/`DESC`），`sources` 参数化占位，注入面在 store 层收敛，与 IPC 入参形态无关。
    - `f004`（important）已消除：`content_seq_ref` 序号守卫，旧查询写回与 `set_content_searching(false)` 均经序号校验；残余短路径不复位 → 新 `f011`。
    - `f005`（minor）已消除：`preview_seq_ref` 守卫，切换预览丢弃旧消息。
    - `f006`（minor）已消除：`toggle_select` 超限判断移出 updater，`set_selected` 内只做纯数组变换。
    - `f007`（minor）已消除：offset 分页循环拉全量，不再 `limit: 10000` 截断；残余错误静默截断 → 新 `f012`。
    - `f008`（minor）已消除：`key_of` 用于勾选身份、dock key、grid/list key、summary 缓存；f001 命中集未同步 → 新 `f009`。
- 本轮新发现：4 条（全部 minor：f009/f010/f011/f012）。
- 未进表的提示：
    - 文件过大（本 task 新建/持续净增）：`src/renderer/components/session-library/SessionLibrary.tsx` 639 行（round 1 584 → 639，仍增长，超 minor 阈值 400，未达 800 important）；`src/renderer/styles/session-library.css` 725 行。均未给不可拆硬约束，建议拆子组件与 CSS 分块。
    - 复杂度：`SessionLibrary` 单组件承载约 12 个内联回调与 effect（`ensure_summary`/内容搜索 effect/`open_preview`/`toggle_select`/分页 effect 等），round 1 已提示，未工具实测 McCabe，不进 finding 表。
    - 范围外观察（round 1 已提示，仍存在）：main 侧 `query_sessions` 扩展（`sources`/`start_at`/`end_at`/`order_by`/`direction`）未被 renderer 消费（renderer 全量拉取 + 前端过滤），`src/preload/index.ts:120` 与 `src/shared/types/ipc.ts:553` 的 `getSessions` 类型未暴露新参数，IPC 层与类型面不一致。倾向后续收敛：补 preload 类型启用服务端过滤，或标注扩展为待用能力。
    - summary 懒加载首屏对前 50 张可见卡并发发起 `sessionHistory.query`，无并发上限（spec 上下文区仅要求内容搜索串行）；demo 数据量无碍，大数据量下关注。
    - `format_tokens` 与 `src/renderer/lib/workspace/slots.ts:124` 同名函数输出口径分叉（round 1 已提示，未消除，无可观测缺陷）。
- 总体判断：前轮 4 important + 4 minor 已全部消除，无未解决 blocking；本轮 4 条新 minor 均非阻断 → PASS。
- 系统性 follow-up：无

verdict: PASS

## Round 3 (2026-08-06 18:05 UTC+8)

## Findings

### t227_code_f013 - load_error 仅在空结果态渲染：中途分页失败仍静默、与筛选空态混淆（f012 修不彻底）

- 严重度：minor
- 锚点：行为缺陷（错误处理/数据完整性，AC1 边界）
- 位置：`src/renderer/components/session-library/SessionLibrary.tsx:98`（`set_load_error(true)`）、`:371-388`（空态分支为唯一渲染点）
- 问题：f012 修复把 load_error 置位，但唯一渲染点是被 `visible_sessions.length === 0` 门控的空态分支，留下两个可观测缺口。① 中途失败：首页成功后某页 `getSessions` 抛错，`all` 为部分数据，`load_error=true` 却无处显示——页头统计行仍按部分计数展示且无「加载中断」标识，恰是 f012 问题陈述中「中途失败 → 静默部分数据无标识」未真正消除。② 空态文案混淆：`load_error=true` 且当前筛选匹配 0 条（部分数据 + 过严筛选）时，空态显示「会话列表加载失败」并隐藏「清除筛选」按钮——把筛选空态误报为加载失败，用户无法一键清除恢复。
- 建议：load_error 与「筛选空态」分离呈现：非空数据加载中断时在页头或工具栏常驻提示（如「部分会话加载失败」）；空态文案仅当 `load_error && all.length === 0` 显示「加载失败」，否则显示「没有匹配的会话」并保留「清除筛选」。

## 结论

- 前轮 finding 复核（以 diff 与代码为准，不采信 task.md 处置表）：
    - f001（important）仍消除：`content_filtered = filtered ∪ extra` 并集（SessionLibrary.tsx:152-159），`extra` 取 `hits.has(key_of(s)) && !filtered.some(f => key_of(f) === key_of(s))`。
    - f002（important）仍消除：`ensure_summary` 懒加载首条 user 消息，卡片/行渲染 `.lib-card-summary`/`.lib-row-summary`（:585/:625），CSS 类存在（session-library.css:255/:416）。
    - f003（important）仍消除：store `order_expr` 三元链白名单回落固定 SQL 片段、`direction` 仅 `ASC`/`DESC`、`sources` 参数化占位（token-stats-store.ts:1050-1068），IPC 透传（token-stats-ipc.ts:66-69）无法绕过。
    - f004（important）仍消除：`content_seq_ref` 序号守卫，旧查询写回与 `set_content_searching(false)` 均经序号校验（:165/:192）。
    - f005（minor）仍消除：`preview_seq_ref` 守卫（:220/:226）。
    - f006（minor）仍消除：`toggle_select` 超限判断移出 updater，updater 内仅纯数组变换（:205-215）。
    - f007（minor）仍消除：offset 循环分页拉全量，不再 `limit: 10000` 截断（:85-104）。
    - f008（minor）仍消除：`key_of` 统一勾选身份、dock key、grid/list key、summary 缓存键。
    - f009（minor）已修：内容命中 `hits.add(key_of(s))`（:187），`extra` 去重改 `key_of` 比较（:156），与 f008 主键口径一致。
    - f010（minor）已修：`ensure_summary` 异步查询移出 `set_summaries` updater，`summary_inflight` ref 防重复请求（:66-83），updater 内仅纯对象展开。
    - f011（minor）已修：短路径先 `++content_seq_ref.current` 使在途查询失效，再 `set_content_searching(false)`（:165-169），清空/取消不再残留提示。
    - f012（minor）修不彻底 → 新 f013（首页失败空态已区分，中途失败静默与筛选空态混淆仍存）。
- 本轮新发现：1 条（f013，minor）。
- 未进表的提示：
    - 文件过大（round 1/2 已提示，仍持续净增）：`SessionLibrary.tsx` 645 行（round 2 639 → 645，超 minor 阈值 400，未达 important 800）；`session-library.css` 725 行。均未给不可拆硬约束，建议拆子组件与 CSS 分块。
    - 范围外观察（round 1/2 已提示，仍存在）：main 侧 `query_sessions` 扩展（`sources`/`start_at`/`end_at`/`order_by`/`direction`）未被 renderer 消费（renderer 全量拉取 + 前端过滤）；`src/preload/index.ts:120` 与 `src/shared/types/ipc.ts:553` 的 `getSessions` 类型未同步暴露新参数，IPC 层与类型面不一致。
    - `summary_inflight` 失败后 key 永久驻留：查询失败置空摘要后不再重试（缓存语义；缺源文件场景，可观测影响极低），观察不单列。
    - 单测实测：`npx vitest run tests/unit/renderer/components/session_library tests/unit/renderer/lib/session_library_filter.test.ts` → 2 files / 22 tests 全绿；act() 警告仍现（test reviewer 遗留 p057，非本域）。
- 总体判断：round 1 全部 8 条与 round 2 f009-f011 经代码核实已消除；f012 修不彻底，残余为 minor 级展示缺口（异常路径 + 筛选空态混淆），无未解决 critical/important → PASS。
- 系统性 follow-up：无

verdict: PASS

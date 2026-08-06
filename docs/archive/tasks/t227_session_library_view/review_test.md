# Task review t227（reviewer_focus: 测试）

- task：`t227_session_library_view`
- spec：`docs/tasks/t227_session_library_view/spec.md`
- diff_anchor：`75e6056c6882bc189356c47990a4e381ce625703`
- target：`git diff 75e6056c6882bc189356c47990a4e381ce625703`
- round：1
- reviewed_at：2026-08-06 16:20 UTC+8

验证方式：`pnpm exec vitest run` 单独执行四个相关测试文件全部通过（filter 9 / SessionLibrary 7 / token-stats-store 80 / SessionShell 8），本报告以通过的绿测为基准评估 AC 覆盖与可信度。

## Findings

### t227_test_f001 - AC2「包含消息内容」开关接线无组件测试

- 严重度：important
- 锚点：AC 2「开启「包含消息内容」后，正文含关键词的会话也出现在结果中」
- 位置：`tests/unit/renderer/components/session_library/SessionLibrary.test.tsx`（无该用例）；`tests/unit/renderer/lib/session_library_filter.test.ts:76-84` 仅测 `match_content` 纯函数
- 问题：AC 2 的用户可观察行为是「勾选开关 → 候选会话逐个读正文 → 命中会话出现在结果」。现有测试只覆盖两段拼接的两端：组件测试（test 2）验证默认元信息搜索；数据层测试验证 `match_content` 字符串匹配。整条接线（checkbox 状态、`sessionHistory.query` 逐候选调用、`content_hits_ref` 过滤）无测试。若开关失效（如勾选后结果不变、或 query 结果未进命中集合），全部现有测试仍绿。spec 可测试性声明明确要求「AC 2 以受控 fixture 测正确性」，当前只测了字符串 helper，未测特性行为。
- 建议：组件测试勾选「包含消息内容」，mock `sessionHistory.query` 使会话 a 的正文含关键词、会话 b/c 不含；断言勾选后仅 a 出现在结果，且 query 被调用。

### t227_test_f002 - AC3 时间范围：renderer 纯函数弱断言 + 组件日期输入无测试

- 严重度：important
- 锚点：AC 3「设置时间范围（起止日期）后，只有活动时间与该范围有交集的会话纳入搜索与结果」
- 位置：`tests/unit/renderer/lib/session_library_filter.test.ts:57-61`
- 问题：`expect(r.length).toBeGreaterThanOrEqual(1)` 是弱化断言（危险模式 `>=`）。fixture 为 a[1000,3000]/b[100,1000]/c[500,2000]，范围 [1100,1900] 期望恰好 a、c（长度 2）。`>= 1` 在实现把时间过滤完全删掉（返回全部 3）或只返回无交集会话时同样通过，不验证 AC 3 交集语义。组件层起止日期输入→筛选结果的接线也无测试。注：main 侧 SQL 交集测试精确（`token-stats-store.test.ts:357-361`），本 finding 针对 renderer 数据层与组件层。
- 建议：断言精确结果集（`expect(r.map(s=>s.id).sort()).toEqual(["a","c"])`）；补组件日期输入用例（设起止日期后断言结果集变化）。

### t227_test_f003 - AC5 卡片信息存在即通过，测试名不副实

- 严重度：important
- 锚点：AC 5「会话卡片显示 agent 色条、徽标、标题、首条用户消息摘要、`轮数 · tokens · 相对日期`、cwd/路径；列表视图显示等价信息」
- 位置：`tests/unit/renderer/components/session_library/SessionLibrary.test.tsx:87-96`
- 问题：测试 2 标题称「卡片显示 agent 色条/徽标/标题/轮数/tokens/相对日期」，实际断言仅：`getByText("会话 b")`（标题）、`queryByText("会话 a")` 为 null（搜索正确性）、`document.querySelector(".lib-card")` 存在。徽标、meta 行（轮数/tokens/相对日期）、目录均未断言；`document.querySelector(".lib-card")` 是存在性断言，属于存在即通过——卡片信息 AC 的实际内容无证据。AC 5 后半「列表视图显示等价信息」也未断言（test 3 仅查 `.lib-list` 存在）。
- 建议：断言卡片 meta 文本（如 `5 轮 · 375 tokens · …`）、徽标、目录；列表视图断言行内 title/meta/dir。

### t227_test_f004 - AC9「加载更多」无测试

- 严重度：important
- 锚点：AC 9「「加载更多」分页加载会话」
- 位置：`tests/unit/renderer/components/session_library/SessionLibrary.test.tsx`（无超过 `PAGE_SIZE` 的用例）
- 问题：分页分支完全无测试。`PAGE_SIZE = 50`，现有最大 fixture（test 4）仅 9 个会话，从不触发「加载更多」按钮渲染与翻页逻辑。若按钮不渲染、点击不增加可见数或超出后不隐藏，全部测试仍绿。
- 建议：mock 55 个会话，断言初始渲染 50（第 51 个不可见），点击「加载更多」后可见数达 55 且按钮隐藏。

### t227_test_f005 - AC7 预览「加入选择」「单独打开」无测试

- 严重度：important
- 锚点：AC 7「「单独打开」把该会话装入工作台槽位并切到工作台；「加入选择」勾选该会话」
- 位置：`tests/unit/renderer/components/session_library/SessionLibrary.test.tsx:129-154`（预览测试仅覆盖前 5 条消息与 Esc）
- 问题：预览抽屉「加入选择」「单独打开」两个 AC 列出的用户动作无测试。「加入选择」是独立行为（从预览调 `toggle_select`，不经过 IPC），若按钮 onClick 未接线（点击无效果）现有测试仍绿。「单独打开」（预览与卡片，AC 6）走 open+switch 路径，机制上与「并排打开」同源但未直接断言。
- 建议：预览测试中点击「加入选择」断言 `n/8` 计数增加；点击「单独打开」断言 `sessionHistory.open` 与 `on_switch_workspace` 被调用。

## 结论

- 前轮 finding 复核：无（Round 1）
- 改测方向复核：仅 `tests/unit/renderer/components/session_shell/SessionShell.test.tsx:66-79` 改动既有测试——把「会话库空态占位」断言改为 `.session-library` 真实视图。t227 用真实视图替换占位属真实行为变化，断言随规格更新是合法适配，非「迁就实现」。无问题。
- 本轮新发现：5 条
- 未进表提示：
    - `query_sessions` 扩展 `order_by: "started_at"` SQL 分支无测试（tokens/calls/默认 ended_at 已覆盖，`token-stats-store.test.ts:363-368`）。
    - AC 6 第 9 个提示的 toast 文案未断言（上限行为已由「8/8」计数验证）。
    - SelectionDock 槽位单个移除、「清空」未测（计数与并排打开已测）。
    - 预览抽屉标题/meta/文件路径未断言（前 5 条消息与 Esc 已测）。
    - `sort_sessions` 测试 `void sorts;` 死代码（`session_library_filter.test.ts:99`）。
    - AC 10「工作台槽位已满超位 toast」无测试：超位校验在 WorkspaceView（t224 层）`try_add_slot`，SessionLibrary 仅发 `sessionHistory.open` IPC，跨层集成路径，单元组件测试难断言；建议确认 t224 覆盖或补集成测试。
    - 范围外观察（交 code reviewer）：SessionCard 未渲染 AC 5 要求的「首条用户消息摘要」元素。
- 总体判断：AC 2/3/5/9/7 存在覆盖缺口，含弱化断言与存在即通过，当前存在未解决 important。
- 系统性 follow-up：无

verdict: FAIL

---

## Round 2 (2026-08-06 17:35 UTC+8)

复核范围：`git diff 75e6056c6882bc189356c47990a4e381ce625703` 相对当前工作区。验证：`npx vitest run` 单独执行四个相关测试文件全绿（SessionLibrary 10 / session_library_filter 9 / token-stats-store 80 / SessionShell 8）。以 diff 与代码为准，不采信处置表自述。

## Findings

### t227_test_f006 - 内容搜索并集测试只验证「正文命中并入」，未验证元信息命中在开启内容搜索后仍保留

- 严重度：minor
- 锚点：AC 2「开启「包含消息内容」后，正文含关键词的会话也出现在结果中」
- 位置：`tests/unit/renderer/components/session_library/SessionLibrary.test.tsx:185-207`
- 问题：新增并集测试（f001 修复）只构造正文含「秘密词」、元信息不含的会话 b，断言 b 出现。验证了「正文命中并入结果」方向，未验证并集另一方向：开启内容搜索后元信息命中的会话仍保留。若实现改为内容搜索开启时只显示正文命中（丢弃元信息命中），本测试仍绿。实现（`SessionLibrary.tsx:155` `[...filtered, ...extra]`）当前正确，此为覆盖扩展缺口。
- 建议：同一测试中让搜索词同时命中某会话标题，断言元信息命中与正文命中会话同时出现。

### t227_test_f007 - SessionLibrary.test.tsx 存在未包裹 act() 的异步状态更新

- 严重度：minor
- 锚点：无（测试可信·异步时序）
- 位置：`tests/unit/renderer/components/session_library/SessionLibrary.test.tsx`（`npx vitest run` 输出多处 "An update to SessionLibrary inside a test was not wrapped in act(...)"）
- 问题：运行该文件时 vitest 报多条 React act 警告，来自 `ensure_summary` / 内容搜索 effect 的异步 setState 在断言后落盘。当前 10 例全绿，无 flaky 证据，属测试卫生问题。
- 建议：异步断言处用 `await waitFor` / `await act` 使状态更新落定后再断言。

## 结论

- 前轮 finding 复核（以 diff/代码为准）：
    - t227_test_f001（内容搜索开关接线）：**已消除**。test 8（`SessionLibrary.test.tsx:185-207`）mock `sessionHistory.query` 使仅会话 b 正文含「秘密词」，勾选开关+搜索后断言 b 出现。接线失效（开关不联动 / query 未调用 / 命中未并入）时测试失败，真实触达 AC2 行为。
    - t227_test_f002（时间范围弱断言 + 组件日期输入无测试）：**修不彻底**。数据层弱断言已改强断言（`session_library_filter.test.ts:60` `toEqual(["a","c"])`；fixture a[1000,3000]/c[500,2000] 与 [1100,1900] 交集核实正确），main 侧 SQL 交集也精确（`token-stats-store.test.ts:359`）。但组件层起止日期输入→筛选结果接线仍无测试（全 `tests/` 目录无「起始日期/结束日期」触达），spec 测试策略明确「筛选/排序/搜索/时间范围：数据层纯函数测试 + 组件测试」，组件侧缺口仍在。残留 important。
    - t227_test_f003（AC5 卡片信息存在即通过）：**仍存在**。test 2（`SessionLibrary.test.tsx:87-96`）与 round 1 描述完全一致——仅断言标题「会话 b」、搜索正确性 null、`.lib-card` 存在；徽标 / `轮数·tokens·相对日期` meta / 目录均无断言（grep 确认 `.lib-card-meta` `.lib-card-badge` `.lib-card-dir` `.lib-row-*` 与 `轮 ·` 在测试文件 0 命中）。处置表「已修」与代码不符。残留 important。
    - t227_test_f004（AC9 加载更多无测试）：**已消除**。test 9（`SessionLibrary.test.tsx:209-218`）60 会话初始渲染 50 卡、点击「加载更多」后 60 卡，真实触达分页分支。按钮加载完隐藏断言缺失（隐含于 60<60 不渲染），可加 case，不阻断。
    - t227_test_f005（AC7 预览加入选择/单独打开无测试）：**修不彻底**。预览「单独打开」已补（test 10，`SessionLibrary.test.tsx:220-240`，断言 `sessionHistory.open` + `on_switch_workspace` 被调用）；预览抽屉「加入选择」按钮接线仍无测试（全 `tests/` 目录无「加入选择」触达，AC7 该动作未验证）。残留 important。
- 改测方向复核：无「迁就实现」改测。`session_library_filter.test.ts:60` 断言从 `>=1` 改为精确 `["a","c"]` 朝 AC3 交集语义加强（fixture 真交集即 a/c，非迁就实现输出）；`SessionShell.test.tsx` 占位→`.session-library` 真实视图为合法适配。
- 本轮新发现：2 条（均 minor，f006/f007）
- 未进表的提示：
    - `query_sessions` `order_by: "started_at"` SQL 分支仍无测试（round 1 已提，延续）。
    - `sort_sessions` 测试 `void sorts;` 死代码仍在（`session_library_filter.test.ts:99`，round 1 已提，延续）。
    - SelectionDock 单个移除/「清空」、预览抽屉标题/meta/文件路径、AC10 超位 toast 无测试（round 1 未进表提示，延续）。
- 总体判断：f003 卡片信息断言未修（仍为存在即通过），f002 组件日期接线、f005 预览加入选择接线修不彻底，仍有 3 条未解决 important。
- 系统性 follow-up：无

verdict: FAIL

---

## Round 3 (2026-08-06 18:10 UTC+8)

复核范围：`git diff 75e6056c6882bc189356c47990a4e381ce625703` 相对当前工作区。验证命令：`npx vitest run tests/unit/renderer/components/session_library tests/unit/renderer/lib/session_library_filter.test.ts`（SessionLibrary 13 / filter 9 全绿）；另跑 `tests/unit/renderer/components/session_shell tests/unit/main/core/token-stats/token-stats-store.test.ts`（SessionShell 8 / token-stats-store 80 全绿）。以 diff 与代码为准，不采信 task.md 处置表自述。

## Findings

### t227_test_f008 - AC5 摘要内容与列表视图等价信息仍为存在性断言（f003 修不彻底）

- 严重度：important
- 锚点：AC 5「会话卡片显示 …首条用户消息摘要、`轮数 · tokens · 相对日期`、cwd/路径；列表视图显示等价信息」
- 位置：`tests/unit/renderer/components/session_library/SessionLibrary.test.tsx:100`（`.lib-card-summary` 仅 `toBeTruthy`）；`:123`（列表视图仅 `.lib-list` 存在）
- 问题：本轮 grid 卡片已补实值断言（徽标文本「OC」、色条 `.lib-card-accent`、title、meta「2 轮/375 tokens」、dir「/proj/b」，`:95-103`），f003 的 grid 部分已消除。但 AC5 仍有两处存在即通过：
  (a) 首条用户消息摘要仅断言 `.lib-card-summary` 元素存在。该元素在 JSX 中无条件渲染（`{summary}`，未加载时为 `""`），断言恒真；`ensure_summary` 管道（`sessionHistory.query` → 取首条 user 消息 → `set_summaries` → 卡片渲染文本）内容完全未验证。本测试中 query 走默认 mock 返回空消息，若摘要恒为空/管道损坏，测试仍绿。
  (b) 列表视图切换后仅断言 `.lib-list` 容器存在（`:123`）。`SessionRow` 的 `.lib-row-*`（badge/title/summary/meta/dir）均无断言；SessionRow 是独立 JSX 组件，若回归缺渲染 meta/dir，现有测试全部仍绿。
  两处均属「存在即通过」危险模式，`expect(element).toBeTruthy()` 是 AC5 对应子项的唯一定性证据。
- 建议：(a) mock `sessionHistory.query` 返回含 `role: "user"` 的消息（复用预览测试的 query mock），`await waitFor` 断言 `.lib-card-summary` 文本；(b) 切换列表视图后断言 `.lib-row-badge`/`.lib-row-title`/`.lib-row-meta`/`.lib-row-dir` 实值。

## 结论

- 前轮 finding 复核（以 diff/代码为准）：
    - t227_test_f001（AC2 内容搜索开关接线）：**已消除**。test 8（`SessionLibrary.test.tsx:233-261`）仍完整存在，mock query 按会话区分正文，勾选开关+搜索后仅正文命中会话 b 出现，接线失效即红。
    - t227_test_f002（AC3 时间范围）：**已消除**。数据层弱断言已为精确 `toEqual(["a","c"])`（`filter.test.ts:60`，fixture 与 [1100,1900] 交集核实正确）；本轮新增起始/结束日期组件接线测试两方向（`SessionLibrary.test.tsx:126-164`）。核对语义：起始日测试 `start_at = new Date("2026-07-10T00:00:00")` 与 fixture 同为本地时区解析，older（ended < start_at）排除、newer 保留；结束日测试 `end_at = new Date("2026-07-09T23:59:59")`，older（started_at ≤ end_at）保留、newer 排除。断言全部为行为断言（getByText/queryByText），非 mock/内部状态。
    - t227_test_f003（AC5 卡片信息存在即通过）：**修不彻底**。grid 卡片徽标/色条/title/meta/dir 已补实值断言；但摘要内容与列表视图等价信息仍为存在性断言，残留 important，见本轮 f008。
    - t227_test_f004（AC9 加载更多）：**已消除**。test 9（`:263-272`）60 会话初始 50 卡、点击后 60 卡，真实触达分页分支。
    - t227_test_f005（AC7 预览「加入选择」）：**已消除**。本轮新增测试（`:296-317`）打开预览→点「加入选择」断言「1/8」出现→再点断言「1/8」消失，真实触达 `toggle_select(preview)` 双向接线。
    - t227_test_f006（并集测试元信息命中保留）：**已消除**。test 8 第二段（`:254-260`）搜索词改「会话 a」（仅元信息命中），断言「会话 a」保留且「会话 b」（正文命中）随搜索词变化消失；内容搜索 effect 的 seq 守卫使旧命中集被丢弃，waitFor 收敛到正确终态。
    - t227_test_f007（act 警告）：**仍存在**。运行 13 个 SessionLibrary 测试仍输出 10 条 "An update to SessionLibrary inside a test was not wrapped in act(...)"，来自 `ensure_summary` / 内容搜索 effect 的异步 setState 在断言后落盘。当前 13 例全绿、无 flaky 证据，属测试卫生问题（minor，非阻断）。
- 改测方向复核：无「迁就实现」改测。本轮新增/修改测试全部断言 spec 语义（日期交集过滤、加入选择 toggle、并集保留元信息命中），未把断言预期改成当前实现输出。
- 本轮新发现：1 条（f008，important）。
- 未进表提示（round 1/2 延续）：
    - `query_sessions` `order_by: "started_at"` SQL 分支无测试（tokens/calls/默认 ended_at 已覆盖）。
    - `sort_sessions` 测试 `void sorts;` 死代码（`filter.test.ts:99`）。
    - SelectionDock 槽位单个移除、「清空」未测；预览抽屉标题/meta/文件路径未断言。
    - AC10 工作台超位 toast 无测试（校验在 t224 WorkspaceView 层，跨层集成路径）。
    - 卡片 meta 的「相对日期」段因依赖 `Date.now()` 非确定性未断言（可用 fake timers 扩展）。
    - 加载更多按钮加载完隐藏未显式断言（隐含于 `visible < length` 条件）。
- 总体判断：f002/f005 等本轮补修目标已消除，grid 卡片断言大幅加强；但 AC5 摘要内容与列表视图等价信息仍为存在性断言（f008，important），f007 act 警告（minor）仍在。存在 1 条未解决 important。
- 系统性 follow-up：无

verdict: FAIL

---

## Round 4 (2026-08-06 18:14 UTC+8)

复核范围：`git diff 75e6056c6882bc189356c47990a4e381ce625703` 相对当前工作区。验证命令：`npx vitest run tests/unit/renderer/components/session_library tests/unit/renderer/lib/session_library_filter.test.ts`（SessionLibrary 14 / filter 9 全绿）；另跑 `tests/unit/renderer/components/session_shell tests/unit/main/core/token-stats/token-stats-store.test.ts`（SessionShell 8 / token-stats-store 80 全绿）。code 自 round 3 未改动，仅测试文件本轮变更。以 diff/代码/运行结果为准，不采信 task.md 自述。

## Findings

本轮无新 finding。

## 结论

- 前轮 finding 复核（以 diff/代码为准）：
    - t227_test_f008（AC5 摘要内容与列表视图等价信息存在性断言）：**已消除**。
      (a) 摘要内容：新增测试「卡片与行摘要取首条用户消息内容（f008）」（`SessionLibrary.test.tsx:80-102`）mock `sessionHistory.query` 返回 assistant 首条 + user 次条，`await waitFor` 断言 `.lib-card-summary` 文本含 user 消息「真正要显示的用户消息」且**不含** assistant「不应显示的回复」。断言经真实 `ensure_summary` 管道（`SessionLibrary.tsx:67-83` → `query({limit:5})` → `.find(m => m.role === "user")` → `set_summaries` → 卡片渲染）。若管道损坏（摘要恒空 / 取首条 assistant），`toContain(user)` 或 `not.toContain(assistant)` 必红，非恒真。切换列表视图后断言 `.lib-row-summary` 含同一 user 文本，行摘要同样触达 `summaries` 状态。
      (b) 列表视图等价信息：测试「agent 芯片多选过滤 + 排序 + 视图切换」（`SessionLibrary.test.tsx:104-127`）补 `.lib-row-title`（会话 c）、`.lib-row-badge`（`G`，`agent_abbrev("grok")` 精确匹配）、`.lib-row-meta`（`9 轮`）、`.lib-row-dir`（`/proj/c`）实值断言，全部触达 `SessionRow`（`SessionLibrary.tsx:612-639`）。fixture 核实：点击 Claude 后仅剩 a，再点 Grok 后 a+c，排序 calls desc 首条为 c（calls=9 > a=5），行首即 c，断言真实。`.lib-list` 存在性断言降为辅助证据，非唯一定性。
    - t227_test_f001（AC2 内容搜索开关接线）：**已消除**，无回归。test 11（`:233-261`）仍完整，勾选开关+「秘密词」搜索仅正文命中会话 b 出现，第二段验证元信息命中「会话 a」在内容搜索开启后仍保留（f006 一并保持）。
    - t227_test_f002（AC3 时间范围）：**已消除**，无回归。数据层精确 `toEqual(["a","c"])`（`filter.test.ts:60`）+ 组件起止日期双向接线测试（`:129-164`）均在。
    - t227_test_f003（AC5 卡片信息）：**已消除**，无回归。grid 徽标/色条/title/meta/dir 实值断言保留（`:56-66`）。
    - t227_test_f004（AC9 加载更多）：**已消除**，无回归。60 会话初始 50 卡/点击后 60 卡（`:263-272`）。
    - t227_test_f005（AC7 预览「加入选择」）：**已消除**，无回归。开抽屉→点「加入选择」断言「1/8」出现/消失（`:296-317`）。
    - t227_test_f007（act 警告）：**仍存在**（minor，非阻断）。运行仍输出 "An update to SessionLibrary inside a test was not wrapped in act(...)"，来自 `ensure_summary`/内容搜索 effect 异步 setState；14 例全绿、无 flaky 证据。已知 minor 遗留，本轮不阻断。
- 改测方向复核：无「迁就实现」改测。本轮仅（1）新增摘要内容断言测试；（2）在既有视图切换测试中**追加**行实值断言（`.lib-row-*`），均朝 AC5 语义加强，未删除/反转/弱化既有断言。
- 本轮新发现：0 条（f008 修复为前轮重要 blocker 消除）。
- 未进表提示（round 1/2 延续，非本轮引入）：
    - `query_sessions` `order_by: "started_at"` SQL 分支无测试（tokens/calls/默认 ended_at 已覆盖）。
    - `sort_sessions` 测试 `void sorts;` 死代码（`filter.test.ts:99`）。
    - SelectionDock 槽位单个移除、「清空」未测；预览抽屉标题/meta/文件路径未断言。
    - AC10 工作台超位 toast 无测试（校验在 t224 WorkspaceView 层，跨层集成路径）。
    - 卡片 meta「相对日期」依赖 `Date.now()` 非确定性未断言；加载更多按钮加载完隐藏未显式断言。
    - f007 act 警告可经 `await act`/`waitFor` 收敛异步 setState 后消除（minor 卫生项）。
- 总体判断：f008 以真实内容断言（user 出现 / assistant 不出现）与行实值断言真正消除，全部 AC 覆盖缺口闭环；仅存 f007 act 警告 minor 遗留，无未解决 important。
- 系统性 follow-up：无

verdict: PASS

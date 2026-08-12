# Task review t328（reviewer_focus: 代码）

- task：`t328_session_library_infinite_scroll`
- spec：`docs/tasks/t328_session_library_infinite_scroll/spec.md`
- diff_anchor：`99048f7b0b278110a7931e455bcdbcb107b58860`
- target：`git diff 99048f7b0b278110a7931e455bcdbcb107b58860`
- round：1
- reviewed_at：2026-08-12 22:40 UTC+8

## Findings

### t328_code_f001 - 首屏内容不溢出（无滚动条）时无限滚动永不触发，AC-002 行为缺口

- 严重度：minor
- 锚点：行为缺陷 —— 容器内容高度 ≤ 可视高度（`scrollHeight ≤ clientHeight`）时无任何 scroll 事件，`has_more=true` 的下一页永远无法加载
- 位置：`src/renderer/components/session-library/SessionList.tsx:54-59`
- 问题：`handle_scroll` 只在 scroll 事件到达时判定触底。若首屏 50 条恰好不溢出容器（宽屏/高窗 + 紧凑卡片，如 6 列网格 9 行 × 卡片高，MacBook Pro 16" 可用高度约 1728px 即可能命中；列表视图 50 行 × 约 60px = 3000px 一般仍溢出），容器无滚动条、无 scroll 事件，`on_scroll_to_bottom` 永不触发，用户既无按钮也无滚动可用，卡在首屏。触发条件中 `scrollHeight - clientHeight ≤ 120` 时首帧即判定 true，但前提仍是「有 scroll 事件」；纯不可滚场景此前提不成立。无挂载后兜底检测（如内容变化后检查容器是否仍不可滚且 `has_more`）。
- 建议：`visible_sessions`/`has_more` 变化后（或挂载后）检查滚动容器 `scrollHeight ≤ clientHeight` 且 `has_more` 为真时主动调用一次 `load_more`；或复用 ResizeObserver。属低概率边界，AC-002 语义缺口，非首屏常规路径。

### t328_code_f002 - content 搜索模式滚动突发无并发锁，单次触底可一次追加多页（最多渲染全部匹配）

- 严重度：minor
- 锚点：行为缺陷 —— content 模式（`search && search_content`）下 `set_visible(+PAGE_SIZE)` 无节流，快速滚到底一帧内多个 scroll 事件各 +50，可见量可瞬间追平 `content_sessions.length`，一次性渲染全部匹配卡片
- 位置：`src/renderer/components/session-library/SessionLibrary.tsx:159-163`
- 问题：content 分支的守卫 `content_sessions.length <= visible || load_more_inflight_ref.current` 中，`load_more_inflight_ref` 在该分支从不被置位（仅后端分页分支置位/释放），故该分支的 inflight 检查恒为 false，是死守卫。滚动突发（拖滚动条到底，浏览器每帧发多个 scroll 事件）时，每次调用都 `set_visible(current => current + PAGE_SIZE)`，功能式更新使可见量叠加；`content_sessions` 大（几千条正文命中）时一次 render 插入数千 DOM 节点，UI 卡顿/冻结，违背「一页页追加」的分页意图（改按钮为滚动后新引入的突发路径；旧按钮一次点击仅 +50）。不违反 AC-004 字面（content 模式无网络请求，「在途请求」恒成立），但无节流导致的分页保护失效是真实可观测劣化。
- 建议：content 分支同样用 `load_more_inflight_ref`（或独立节流 ref）在 `set_visible` 前置位、下轮 render 后释放，使一次触底仅追加一页；或把 `|| load_more_inflight_ref.current` 移除并显式处理突发。

## 结论

- 前轮 finding 复核：本轮为 Round 1，无
- 本轮新发现：2 条（均 minor）
- 未进表的提示：
    - 文件过大：无。`SessionLibrary.tsx` 559 行超 minor 阈值 400，但本 task 对其为净减行（删按钮/状态），不满足「仍净增」出 finding 条件；`SessionList.tsx` 99 行，未超。
    - 复杂度：无。`load_more` 圈复杂度手算约 9（<10），且分支结构为 anchor 既有（本 task 仅删 `set_loading_more`）；`handle_scroll` 约 2。
    - 范围外观察：新增 `tests/e2e/web/session_library_infinite_scroll.spec.ts` 尚未入库（untracked），不在 `git diff <anchor>` 指纹计算范围（`git diff` 不含未跟踪文件）；若入库前改动该文件，`check_review_status` 指纹无法捕获。移除「加载更多」按钮后无任何加载中视觉提示（`loading_more` 状态已删）——spec 范围内行为，仅提示。
    - StrictMode：`src/renderer/index.tsx:12` 用 `<StrictMode>`，但 `onScroll` 是 JSX 合成事件 prop（React 根容器捕获代理，组件卸载自动解绑），无手动 `addEventListener`，无双挂载泄漏；reset/content 双 effect 均带 `disposed`/abort 清理，与 t328 改动无关。
- 总体判断：AC-001~006 实现与测试均到位，单元测试 36 例全绿、typecheck 通过；2 条 minor 非阻断，无未解决 critical/important → PASS
- 系统性 follow-up：无

### AC 复验披露

- AC-001：`re_verified` —— 源码按钮 JSX 已删（grep `src/` 无 `加载更多`/`can_load_more`/`loading_more`/`library-load-more` 残留）；重跑 `SessionLibrary.test.tsx` 36 例全绿，其中双视图 `queryByRole("button", { name: "加载更多" })` 为 null 断言通过。
- AC-002：`re_verified` —— 单元测试 "t328 AC-002：滚到底自动加载下一页并追加" 断言滚动后 50→60 卡片；e2e `session_library_infinite_scroll.spec.ts` 读核（50→100→130）。真实 Chromium 滚动执行未由 reviewer 运行（属 test reviewer 复验域），下述 e2e 条目同理。
- AC-003：`re_verified` —— 单元测试断言 `has_more=false` 后触底 `getSessions` 仍 2 次；e2e 断言 `offsets.length` 与各 offset 计数不变；代码 `if (!has_more || inflight) return` 直查。
- AC-004：`re_verified` —— 单元测试断言连续两次触底 `offset=50` 仅请求一次、总调用 2 次；「旧分页请求不释放新列表并发锁」用例验证 seq 守卫 + finally 条件释放；`load_more_inflight_ref` 同步置位路径直查。
- AC-005：`re_verified` —— 单元测试 "t328 AC-005" 断言搜索重置后触底继续加载且末次请求 `{ search:"needle", offset:50 }`；reset effect 重置 `visible`/`has_more`/`inflight` 直查。
- AC-006：`re_verified` —— 单元测试断言 grid/list 两容器 `onScroll` 均触发加载且均无按钮；e2e 列表视图条目读核。

coverage = re_verified / 总 AC 数 = 6 / 6

（披露：AC-002/003/006 的「真实 Chromium 滚动」e2e 由 reviewer 读核未执行，执行验证属 test reviewer；reviewer 的 re_verified 依据为单元测试重跑全绿 + 代码路径直查。）

reviewed_scope: ad4ec093bc402198

verdict: PASS

## Round 2 (2026-08-12 22:51 UTC+8)

Round 1 verdict: PASS（2 minor：f001 首屏不溢出不加载；f002 content 搜索滚动突发无锁）。本轮核实 f001/f002 修复，扫描修复引入的新问题。以 `git diff 99048f7b0b278110a7931e455bcdbcb107b58860`（工作区）与代码/测试本身为准。

### 前轮 finding 复核

- **f001（minor）——修不彻底且方向反**。核实 `src/renderer/components/session-library/SessionList.tsx:64-71`：挂载 effect 条件为 `el.scrollHeight > el.clientHeight` 时调 `on_scroll_to_bottom()`。判定方向与 f001 场景（首屏内容不溢出 → 无 scroll 事件 → 永不加载）**相反**：
    - `scrollHeight ≤ clientHeight`（f001 原场景，无滚动条）→ 条件 false → 不调 `on_scroll_to_bottom()` → 用户无滚动条也无按钮，仍永远无法加载下一页，f001 缺陷原样保留。
    - `scrollHeight > clientHeight`（常规首屏 50 条溢出）→ 挂载提交后立即调 `load_more` → 无任何滚动即预取 offset=50 第 2 页，见新 finding f003。
    - 附：effect 闭包捕获挂载时 `on_scroll_to_bottom`（父 `load_more`），`[]` 依赖本身安全（挂载检查本就该用挂载时状态，含 `has_more`/inflight 守卫）；问题只在条件写反。
- **f002（minor）——部分修复，突发防护未达成**。`SessionLibrary.tsx:160` 顶部共享锁 `if (load_more_inflight_ref.current) return` 已使 content 分支守卫不再恒假（死守卫消除），但 `SessionLibrary.tsx:166-168` 用 `queueMicrotask` 释放锁：微任务在当前 scroll 事件任务结束、**下一 scroll 事件任务开始前**即被清空，锁在相邻事件之间恒为释放态。滚动突发（拖滚动条到底，每帧一个事件任务）时每个事件各 `set_visible(+50)` 仍会叠加；真正抑制突发靠的是 render 提交后 DOM 增高把用户带离触底带（时序取决于渲染速度 vs 60Hz 事件），正文命中量大时仍可能一次叠加渲染多页。f002「防突发」目标未真正达成，残余 minor 风险。

### 本轮新发现

### t328_code_f003 - 首屏挂载 effect 触底判定写反：溢出即预取第 2 页（新回归），不溢出场景依旧不加载（f001 未修）

- 严重度：important
- 锚点：AC-002 —— 规定触发模型为「滚动到会话列表底部时自动加载下一页」；当前实现打开/重置筛选即未滚动自动发第 2 页请求，违背触发语义。
- 位置：`src/renderer/components/session-library/SessionList.tsx:66-68`（effect 条件）
- 问题：可复现、常见路径恒命中。真实浏览器有布局：库首开及每次筛选/搜索/排序/日期重置后，首屏 50 条 grid 在常规窗口溢出 → SessionList 挂载提交后 effect 检查 `scrollHeight > clientHeight` 恒真 → 直接调 `on_scroll_to_bottom()` → 父 `load_more`（backend 分支，`has_more`/inflight 均放行）发 offset=50 请求并把 `visible` 提到 100。可观测后果：①每次打开库/每次筛选重置多一次网络请求（offset=50），②首屏渲染 100 卡而非 50（未滚动先加载一页）。同时 `scrollHeight ≤ clientHeight`（f001 原场景）时 effect 不做任何事，无滚动条用户依旧无法加载下一页。
    - 证据链（为何单测全绿仍漏）：
        - 单元测试 `SessionLibrary.test.tsx:125-158`（t248 AC1/AC2）断言首屏 `getSessions` 仅 1 次，但 jsdom 无布局（`scrollHeight=clientHeight=0`），`0 > 0 = false` → 挂载 effect 不触发，恒绿，无法捕获回归。
        - e2e `session_library_infinite_scroll.spec.ts:82` `await expect(page.locator(".library-card")).toHaveCount(50)` 与预取响应形成竞态：本次运行通过（断言先于 offset=50 响应提交），但脆弱、随时序翻红；`grid_squash` 循环「滚动→计数递增」对预取免疫故不受影响。
    - 结论：修复把 f001 的目标条件写反了——应在**不溢出**（`scrollHeight <= clientHeight`，即「整页内容已可见、无可滚动余量」）时补一次触底加载，而非溢出时预取。
- 建议：条件反转为 `if (el && el.scrollHeight <= el.clientHeight) on_scroll_to_bottom();`；溢出分支不应在挂载时预取。注意仅 mount 查一次不充分——首屏不溢出加载第 2 页后可能仍不溢出，需在 sessions/has_more 变化后重查（或依赖触底带失效后重复触发）直至溢出或 `has_more=false`。jsdom 下此分支仍无法由单测断言，须由 e2e/人工验证。

## 结论（Round 2）

- 前轮 finding 复核：f001 修不彻底（方向反，见 f003）；f002 部分修复（死守卫消除，但 queueMicrotask 释放过早，突发叠加仍可能）。f001/f002 均未真正闭环。
- 本轮新发现：1 条（f003，important）。
- 未进表的提示：
    - 单元测试命名/覆盖缺口：`SessionLibrary.test.tsx:204` 名为「t328 AC-002 test f001」的用例实际只验证 handle_scroll 的「非底部滚动不触发加载」（用 mock 的 scrollHeight/clientHeight），**未触及**挂载 effect 的溢出分支；全文件无 content 模式滚动突发用例。jsdom 无布局能力，f001 修复回归只能由 e2e/人工捕获（e2e 现又因竞态而脆弱）。
    - 复杂度：无变化。文件行数：SessionLibrary.tsx 566 行（净减），SessionList.tsx 114 行，均不出文件过大 finding。
- 总体判断：f003 为新的 important（blocking）——修复把 f001 的目标条件写反，常见路径（溢出首屏）引入未滚动预取第 2 页回归 + 多一次请求/次重置，且 f001 原场景（不溢出）依旧无法加载下一页 → **FAIL**，须修复后进入下一轮。
- 系统性 follow-up：无。

### AC 复验披露（Round 2）

- AC-002：`re_verified` —— 复核 `SessionList.tsx:64-71` effect 与 `SessionLibrary.tsx:158-169` load_more：溢出挂载即调 `load_more`（offset=50），未滚动即加载，违背「滚到底自动加载」触发模型；jsdom 下单测恒绿（`0>0=false`），e2e `:82` 与预取竞态。
- AC-005：`re_verified` —— 筛选重置 `SessionLibrary.tsx:127-156` 置 `all=[]` → SessionList 卸载再挂载 → 挂载 effect 再次触发预取，重置后首屏同样被预取为 100（与 AC-002 同源问题）。
- AC-001/003/004/006：Round 1 复验结论不受本轮 diff 影响（按钮仍无、has_more/inflight 守卫仍在、双视图同源），仍 `re_verified`。

coverage = re_verified / 总 AC 数 = 6 / 6（Round 2）

reviewed_scope: 66b1f79dc82480d3

verdict: FAIL

## Round 3 (2026-08-12 23:02 UTC+8)

Round 2 verdict: FAIL（f003 important：首屏挂载 effect 条件写反——溢出即未滚动预取第 2 页；f001 原场景不溢出依旧不加载）。本轮核实 f003 修复 + f001/f002 残余，以 `git diff 99048f7b0b278110a7931e455bcdbcb107b58860`（工作区）与代码/测试本身为准。

### 前轮 finding 复核

- **f003（important）——已修，复核通过**。`SessionList.tsx:66-73` 挂载 effect 条件反转为 `el.clientHeight > 0 && el.scrollHeight <= el.clientHeight`：
    - 溢出场景（`scrollHeight > clientHeight`，常规首屏）→ 条件 false → 挂载不预取 → 靠 onScroll 触底加载。✓
    - 不溢出场景（f001 原场景）→ 挂载主动调 `on_scroll_to_bottom()` 一次 → 填满。✓
    - `clientHeight > 0` 前置合理：jsdom 无布局（clientHeight=0）→ 跳过，单测挂载不误触发；真实浏览器容器 0 高（折叠态）同样跳过，避免误加载。✓
    - 复验证据（reviewer 独立重跑，非自述）：①web e2e `session_library_infinite_scroll.spec.ts` **2 passed**（真实 Chromium，1280×720 grid 首屏 50 卡溢出）——首屏断言 count=50、`offsets` 中 offset=0 仅一次，滚动后 50/100 各一次；若挂载预取仍在，offset=50 会提前 ≥2、count 提前涨至 100，断言必翻红。e2e 通过即证溢出路径无挂载预取。②单测 38 passed。③`tsc --noEmit` exit 0。
    - 残余（非阻塞）：effect `[]` 依赖仅挂载查一次，f003 建议的「sessions/has_more 变化后重查」未实现 → 极端大屏下自动加载第 2 页后仍不溢出则无后续触发，见新 finding f004（minor）。
- **f001（minor）——主场景已修，极端角落未闭环**。不溢出首屏现于挂载时自动加载一页，不再永卡 50 条；「自动加载后仍不溢出」的极端角落（需视口装下 100 张 grid 卡 ≈ 17 行×~230px ≈ 3900px，仅 4K 竖屏级别）无重查 → 归入 f004。
- **f002（minor）——处置可接受，采纳**。`SessionLibrary.tsx:161-170` content 分支现由共享 `load_more_inflight_ref` 前置守卫（`:160`）+ 分支内置位 + `queueMicrotask` 释放。核实机制：微任务在 scroll 事件任务结束后、下一事件任务前即清空，锁在相邻事件之间恒为释放态，**并不阻止**滚动突发逐事件各 +50；但 content 模式为本地分页（无网络请求、无 AC-004 在途请求可违），突发收敛到 `content_sessions` 全量展示，无请求放大，唯一代价是大命中量一次渲染多卡（有限、终态正确）。「无实际危害」成立，采纳。附带问题见结论段注释准确性提示。

### 本轮新发现

### t328_code_f004 - 挂载后不溢出场景仅自动加载一页，加载后仍不溢出则无后续触发（f001 极端角落）

- 严重度：minor
- 锚点：行为缺陷 —— 首屏不溢出 → 挂载触发一次 `on_scroll_to_bottom()` → 加载第 2 页后若容器仍不溢出（`scrollHeight ≤ clientHeight`），无 scroll 事件、无重查，`has_more=true` 的后续页无法加载
- 位置：`src/renderer/components/session-library/SessionList.tsx:66-73`（挂载 effect，`[]` 依赖仅执行一次）
- 问题：f003 修复建议已明确提示「仅 mount 查一次不充分——首屏不溢出加载第 2 页后可能仍不溢出，需在 sessions/has_more 变化后重查」，实施仅挂载查一次，未做重查。可复现输入：视口高到 100 张 grid 卡（≈17 行×~230px≈3900px）或 100 行 list（≈5000px）仍不溢出（4K 竖屏等极端大屏）——挂载加载到 100 后无滚动条、无任何触发，用户卡在 100 条而 `has_more` 可能仍为 true。现实窗口首屏 50 条基本溢出，命中概率极低，非阻断。
- 建议：`sessions`/`has_more` 变化后（或复用父 `load_more` 完成回调）重查容器是否仍不溢出且 `has_more=true`，继续补加载直至溢出或 `has_more=false`；或接受「自动加载一页即停」为当前边界，在 task.md 处置表记录决策。

## 结论（Round 3）

- 前轮 finding 复核：f003 已修（reviewer 独立重跑 e2e/单测/tsc 三证）；f001 主场景已修、极端角落归入 f004；f002 残余处置可接受（采纳）。
- 本轮新发现：1 条（f004，minor）。
- 未进表的提示：
    - `SessionLibrary.tsx:165` content 分支注释「下个 tick 释放锁避免滚动突发叠加」与机制不符——`queueMicrotask` 在相邻 scroll 事件任务之间已释放锁，突发逐事件 +50 未被该锁抑制（实际无害性来自 content 本地分页收敛到全量、无网络放大）。建议改注如实描述或若真要抑制突发改用跨事件保留的节流（如 `setTimeout` ~50ms）。属注释准确性 minor，不单列 finding。
    - 复杂度/文件过大：无变化。`SessionList.tsx` 115 行、`SessionLibrary.tsx` 565 行（本 task 净减行），均不触发阈值 finding。
- 总体判断：f003（唯一 important blocker）已修复并获 reviewer 独立复验（真实 Chromium e2e 2 passed 直接证伪挂载预取、38 单测全绿、tsc 0）；f002 残余处置可接受；新增 1 条 minor（f004）非阻断 → **PASS**。
- 系统性 follow-up：无。

### AC 复验披露（Round 3）

- AC-001：`re_verified` —— 单测「t328 AC-001/AC-006」网格/列表均 `queryByRole("button", { name: "加载更多" })` 为 null；e2e 两视图 `getByRole("button", { name: /加载更多/ })` count=0。
- AC-002：`re_verified` —— 复核 `SessionList.tsx:66-73` effect（溢出不预取、不溢出挂载加载一次）+ 重跑 e2e 网格/列表 2 passed：真实 Chromium 1280×720 首屏 50 卡溢出，offset=0 仅一次，滚动后 50/100 各一次，证溢出路径无挂载预取且触底加载追加正常。
- AC-003：`re_verified` —— e2e 末页 30 条（has_more=false）后再次触底 `offsets.length` 不变；`SessionLibrary.tsx:171` `if (!has_more) return` 直查。
- AC-004：`re_verified` —— e2e 三 offset（0/50/100）各 `toHaveLength(1)` 无重复；单测「t328 AC-003/AC-004」连续两次触底 offset=50 仅一次 + seq/finally 条件释放直查。
- AC-005：`re_verified` —— 单测「t328 AC-005：搜索重置后触底继续自动加载」末次请求 `{ offset: 50 }`；reset effect 重置 visible/has_more/inflight 直查。
- AC-006：`re_verified` —— e2e 列表视图 2 passed（无按钮、触底 50→100）；单测「t328 AC-001/AC-006」列表触底 `offset=50` 请求断言。

coverage = re_verified / 总 AC 数 = 6 / 6（Round 3）

reviewed_scope: 6258f5f10a4a311c

verdict: PASS

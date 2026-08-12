# Task review t328（reviewer_focus: 测试）

- task：`t328_session_library_infinite_scroll`
- spec：`docs/tasks/t328_session_library_infinite_scroll/spec.md`
- diff_anchor：`99048f7b0b278110a7931e455bcdbcb107b58860`
- target：`git diff 99048f7b0b278110a7931e455bcdbcb107b58860`
- round：1
- reviewed_at：2026-08-12 22:38 UTC+8

## Findings

### t328_test_f001 - 单测 scroll_to_bottom 在 jsdom 恒真，无测试守卫「非底部不触发」回归

- 严重度：minor
- 锚点：AC-002（触发方向的正断言已覆盖，负方向缺失）
- 位置：`tests/unit/renderer/components/session_library/SessionLibrary.test.tsx:62-67`；`tests/e2e/web/session_library_infinite_scroll.spec.ts:62-71`
- 问题：单测 helper 注释自明——jsdom 下 scrollHeight/clientHeight 均为 0，触底条件 `scrollTop+clientHeight >= scrollHeight-120` 对任意 scroll 事件恒真；e2e 也总是在 `scrollTop=scrollHeight` 后才派发 scroll。两条路径都只验证「滚到底触发加载」（正方向），没有任何测试断言「非底部 scroll 不触发」。若生产 `handle_scroll` 的阈值判断被移除（任意 scroll 都调 `on_scroll_to_bottom`），现有测试全部仍绿。注：spec 上下文区「有意不测」声明了阈值精确像素值不测、以「滚到底部附近触发」替代，正行为已在真实 Chromium 验证——故不阻断，仅提示该负向行为目前无守卫。
- 建议：e2e 补一条负向断言——容器只滚动一半高度（`scrollTop = scrollHeight/2`）后派发 scroll，断言 600ms 内无新 `/v1/sessions` 请求、卡片数不变。可并入现有网格用例。

### t328_test_f002 - AC-005 仅直接覆盖搜索重置，排序/筛选重置后的「触底继续加载」未直接断言

- 严重度：minor
- 锚点：AC-005（部分覆盖）
- 位置：`tests/unit/renderer/components/session_library/SessionLibrary.test.tsx:1029-1060`
- 问题：AC-005 列「切换筛选/搜索/排序/翻页重置」，单测只对搜索重置验证了 has_more 重置 + 触底继续加载。排序/筛选重置复用同一 reset effect（`backend_filters` 依赖），现有用例（`普通分页切换 tokens/calls…`、`Agent 与日期筛选…`）只断言 offset 归 0，未断言 reset 后触底仍能加载下一页。因共用同一 effect，行为分叉风险低。
- 建议：在 AC-005 用例后追加排序或 agent 筛选 reset 后再 `scroll_to_bottom` 的断言；不补也可接受。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无
- 改测方向复核：无「迁就实现」的改测。既有测试的按钮点击→滚动触底是交互载体变化的机械改写，断言精神保留：`t248 AC3` 双击去重改为双触底去重（仍断言 offset=50 仅一次、总调用 2 次）；「旧请求不释放并发锁」用例保留 seq 守卫语义（resolve 旧请求后再次触底仍无第三请求）；「按钮消失」断言删除因按钮已整体移除，由 AC-001 无按钮断言（前置 + 两视图）以更强形式覆盖；t327 grid_squash 的加载循环改滚到底，卡片高度/不重叠/可滚动断言原样保留。
- 本轮新发现：2 条（均 minor）
- 未进表的提示：content_mode（包含消息内容）分支的滚动翻页（`visible` bump）无独立测试——无 AC 要求，现有守卫逻辑复用，暂不阻断；若后续关注 content 搜索分页可在 AC-005 用例体系内扩展。
- 总体判断：AC-001~006 全有对应测试且已在本轮复验跑绿；危险模式扫描（恒真/删断言/弱化/.skip/静默错误/mock 误用/阈值掩盖/条件跳过/存在即通过）均无命中；改测均有归因。仅 2 条 minor，不阻断。
- 系统性 follow-up：无

### AC 复验方式

- AC-001（无按钮）：`re_verified`——单测 `SessionLibrary.test.tsx:626/1009/1016` 两视图 `queryByRole` null；e2e `session_library_infinite_scroll.spec.ts:85/124` `toHaveCount(0)`，均已跑绿。
- AC-002（滚到底自动加载）：`re_verified`——单测 `:978-991`（50→60）、e2e 网格（50→100→130）/列表（50→100）`toHaveCount` 精确断言跑绿。
- AC-003（has_more=false 停止）：`re_verified`——单测 `:643-648`（末页 2 条后触底调用数仍 2）；e2e 末次触底后 `offsets.length` 不变 + 0/50/100 各一次，跑绿。
- AC-004（并发锁）：`re_verified`——单测 `:628-641` 双触底 offset=50 仅一次、总调用 2 次；e2e offsets 去重。
- AC-005（重置后一致）：`re_verified`——单测 `:1029-1060` 搜索 reset 后 has_more 重置、触底继续加载 offset=50（含 search 过滤），跑绿。
- AC-006（网格/列表一致）：`re_verified`——单测 `:993-1027` 列表触底加载至 100；e2e 网格/列表双用例。

coverage = 6 / 6

复验命令：`npx vitest run tests/unit/renderer/components/session_library/SessionLibrary.test.tsx`（36 passed）；`MOCK_FIXTURE=synthetic npx playwright test --project=web tests/e2e/web/session_library_infinite_scroll.spec.ts`（2 passed）与 `.../session_library_grid_squash.spec.ts`（1 passed）。

reviewed_scope: ad4ec093bc402198

verdict: PASS

## Round 2 (2026-08-12 22:52 UTC+8)

### 前轮 finding 复核（以当前 diff 与代码为准）

- **t328_test_f001（minor，无「非底部 scroll 不触发」守卫）：已消除。** 新增单测 `t328 AC-002 test f001：非底部滚动不触发加载`（`tests/unit/renderer/components/session_library/SessionLibrary.test.tsx:204-221`）：首屏 50 条渲染后取 `calls_before`，用 `Object.defineProperty` 在 `.library-grid` 容器上设 `scrollTop=0/clientHeight=100/scrollHeight=1000` 后 `fireEvent.scroll`，断言 `getSessions.mock.calls.length` 不变。**非恒真已核实**：生产 `handle_scroll`（`SessionList.tsx:54-59`）从 `e.currentTarget` 读三属性做 120px 阈值判断，mock 值 `0+100=100 < 1000-120=880` → 不触发；若阈值判断被移除（任意 scroll 都调 `on_scroll_to_bottom`），`load_more` 会在 `has_more=true`、inflight=false 时以 offset=50 发起新请求 → 调用数变 2 → 断言失败。**布局 mock 真实**：设置的是生产代码从同一 DOM 节点读取的同名属性（jsdom 无布局引擎，此为补环境不 mock 被测逻辑）；挂载期自动加载 effect（`SessionList.tsx:64-71`）仅挂载时按 jsdom 的 0/0 判定（false），不干扰本用例。已跑绿（`-t "test f00"` 2 passed）。
- **t328_test_f002（minor，AC-005 排序/筛选重置后触底继续加载未直接断言）：已消除（以搜索重置变体形式）。** 新增单测 `t328 AC-005 test f002：筛选重置后触底继续加载`（`SessionLibrary.test.tsx:225-254`）：搜索重置后先断言 `toHaveBeenLastCalledWith({ offset: 0 })`（重置生效、offset 归 0），再 `scroll_to_bottom(grid())`，断言 "会话 p50" 渲染（下一页加载）。可靠性已核实：p50 仅在实际发起 offset=50 请求且 `all` 追加后渲染，waitFor 超时即失败，非恒真；jsdom 下 `0+0 >= 0-120` 恒真 → 触发确定性。说明：该修复选择搜索重置而非排序/agent 筛选重置，但排序/筛选/搜索共用同一 reset effect（`backend_filters` 依赖），Round 1 原 finding 已注明「不补也可接受」——排序/筛选重置+触底的直接断言残差属已获批准的跳过项，不另出 finding。

### 本轮新发现

0 条。

### 危险模式扫描（本轮新增测试）

- f001：`Object.defineProperty` 设 DOM 滚动指标属 jsdom 无布局环境下的环境 setup（与 e2e 设 `scrollTop=scrollHeight` 同思路），未 mock 被测逻辑；断言为调用数精确相等，非恒真/弱化。
- f002：断言为带实参的 `toHaveBeenLastCalledWith({offset:0})` + waitFor 文本出现，非弱化。
- 无 `.skip` / `.only` / `eslint-disable` / `@ts-ignore` / `toBe(true)`（新增代码）。

### 改测方向复核

无「迁就实现」的改测。两处修复均为纯新增 `it` 块，未改动既有断言预期。

### AC 复验方式（Round 2）

- AC-001：`re_verified`——单测全量（38 passed）与 e2e 网格/列表 `toHaveCount(0)` 重跑绿。
- AC-002：`re_verified`——正方向既有用例 + 新增 f001 负向守卫均跑绿（负向能挡阈值移除回归，经静态推演确认）。
- AC-003：`re_verified`——e2e 末页 30 条 `has_more=false` 后触底 offsets 不变，重跑绿。
- AC-004：`re_verified`——单测双触底 offset=50 仅一次 + e2e offsets 去重，重跑绿。
- AC-005：`re_verified`——既有搜索重置用例 + 新增 f002（offset 归 0 再滚底加载 p50）均跑绿。
- AC-006：`re_verified`——e2e 列表视图触底加载至 100 重跑绿。

coverage = 6 / 6

复验命令：`npx vitest run tests/unit/renderer/components/session_library/SessionLibrary.test.tsx`（38 passed）；`npx tsc --noEmit`（0 error）；`MOCK_FIXTURE=synthetic npx playwright test --project=web tests/e2e/web/session_library_infinite_scroll.spec.ts tests/e2e/web/session_library_grid_squash.spec.ts`（3 passed）。

### 未进表的提示

- e2e 仍只覆盖触底正方向（滚动前恒设 `scrollTop=scrollHeight`），无「非底部」负向用例；f001 负向守卫已落在单测层并足够挡阈值回归，e2e 补负向为可选扩展。
- 「排序 / agent 筛选重置 + 触底继续加载」的直接断言仍缺（Round 1 f002 已声明可接受跳过，机制共用同一 effect，风险低）。

### 总体判断

Round 1 两条 minor 均已以真实、非恒真的断言修复（经生产代码静态推演确认能挡「阈值判断被移除」回归）；新增测试无危险模式命中；改测无迁就实现。无未解决 critical / important。

reviewed_scope: 66b1f79dc82480d3

verdict: PASS

## Round 3 (2026-08-12 23:06 UTC+8)

本轮触发：Round 2 code FAIL 的 f003（首屏挂载 effect 条件写反——溢出即未滚动预取第 2 页）已在 Round 3 修复（`SessionList.tsx:66-73` 条件反转为 `el.clientHeight > 0 && el.scrollHeight <= el.clientHeight`）。test 轴指纹自 Round 2（`66b1f79dc82480d3`）停滞后已因 code 改动漂移到当前 `6258f5f10a4a311c`（scope=stale）。本轮对 test 轴做 Round 3 复审：核实 f003 修复后既有测试是否仍有效、是否引入测试失效，并重写本轮指纹。

### 前轮 finding 复核（以当前 diff 与代码为准）

- **t328_test_f001（minor，非底部滚动不触发加载守卫）：仍有效，已消除。** 修复测试 `SessionLibrary.test.tsx:204-221` 目标的是 `handle_scroll` 阈值逻辑（`scrollTop+clientHeight >= scrollHeight-120`），f003 只改挂载 effect、未触碰 `handle_scroll`；测试在挂载后 `Object.defineProperty` 设 `scrollTop=0/clientHeight=100/scrollHeight=1000`，挂载 effect 早已按 jsdom `clientHeight=0` 判定跳过（`0>0=false`），无干扰。`0+100=100 < 1000-120=880` → 不触发 → 断言调用数不变，非恒真。
- **t328_test_f002（minor，重置后触底继续加载）：仍有效，已消除。** 修复测试 `SessionLibrary.test.tsx:224-252` 走「搜索重置 → offset 归 0 → `scroll_to_bottom` → offset=50 加载 p50」，全程由 reset effect 与 `handle_scroll` 驱动，与挂载 effect 无关；f003 条件反转不影响该路径。
- **test 文件自 Round 2 未改动**：f001/f002 测试行号（`task.md` 处置表 `:204-222` / `:224-252`）与当前文件一致；Round 3 diff 仅含 code 改动（`SessionList.tsx`）。指纹漂移 `66b1f79dc82480d3` → `6258f5f10a4a311c` 全部来自 code 侧。

### f003 修复对测试轴的影响核实

- **jsdom 单测不受影响（确认）**：Round 2 条件 `scrollHeight > clientHeight` 与 Round 3 条件 `clientHeight > 0 && scrollHeight <= clientHeight` 在 jsdom（0/0）下均判 false——挂载 effect 前后都跳过，无「挂载自动加载」干扰任何用例，38 个单测全绿（本轮独立重跑 `SessionLibrary.test.tsx`，38 passed）。f002 用 `search="zz"` 的 mock 分支在 Round 2 已验证跑绿，本轮重跑仍在 38 passed 内。
- **e2e 真实浏览器守卫溢出回归（反向成立）**：网格用例固定 1280×720、首屏 50 卡恒溢出 → `scrollHeight <= clientHeight` false → 挂载不预取，`toHaveCount(50)` 与 `offsets` 中 offset=0 仅一次成立。若 Round 2 反写条件仍在（溢出即预取），offset=50 会提前入列、count 提前涨到 100，断言必翻红——e2e 独立守卫 f003 类溢出回归。本轮独立重跑 `session_library_infinite_scroll.spec.ts`，2 passed。
- 结论：f003 修复未使任何既有测试失效或变成假行为；测试所断言行为（滚动阈值、重置后触底、has_more/inflight 守卫）与 f003 改动无交集。

### 本轮新发现

#### t328_test_f003 - f003 修复目标路径（首屏不溢出自动补加载一页）两个测试层均不可达，零自动化覆盖

- 严重度：minor
- 锚点：AC-002（f003 修复的「不溢出补加载」分支无任何测试守卫）
- 位置：`SessionList.tsx:66-73`（挂载 effect）；`tests/e2e/web/session_library_infinite_scroll.spec.ts:74-108/110-131`（网格/列表用例均 1280×720、注入 50/50/30 卡，首屏恒溢出）
- 问题：f003 修复的目标行为——首屏内容不溢出容器（`el.clientHeight > 0 && el.scrollHeight <= el.clientHeight` 为真）时挂载自动加载一页——在两个测试层都无法触达：jsdom 无布局 `clientHeight=0` → effect 恒跳过；e2e 两用例首屏 50 卡在 1280×720 恒溢出 → 条件 false → 挂载不触发。现有 e2e 只能守卫「溢出时不预取」（反写条件会使 `toHaveCount(50)` 翻红，Round 3 code 复核已证），但**破坏「不溢出补加载」分支（把条件再写反、或整体删除挂载 effect）现有全部测试仍绿**——f003 修复的核心路径处于无守卫状态。与 code 轴 Round 2 f003 备注「jsdom 无布局，f001 修复回归只能由 e2e/人工捕获」同源，但 e2e 实际亦未覆盖该分支，故 test 轴仍须记此缺口。
- 建议：e2e 补一条「首屏不溢出」用例（大视口 + 短首页使 `scrollHeight <= clientHeight` 且 `has_more=true`），断言挂载后未滚动即出现下一页卡片；不补亦可接受（现实窗口首屏 50 条基本溢出，命中概率低，且溢出回归已有 e2e 守卫），属覆盖扩展。

### 危险模式扫描（本轮）

- 本轮 test 侧无新增代码（diff 仅 code 侧）；扫描既有测试在 f003 后仍无恒真/删断言/弱化/.skip/`@ts-ignore`/mock 误用/条件跳过命中。
- f003 修复后单测挂载分支仍恒跳过——该跳过是 jsdom 环境限制而非测试「条件跳过弱化断言」，无静默掩盖（挂载补加载本无单测可写，Round 1/2 已如实披露）。

### 改测方向复核

无。Round 3 diff 未改任何测试文件，无「迁就实现」的改测。

### AC 复验方式（Round 3）

- AC-001：`re_verified`——单测两视图 `queryByRole` null + e2e `toHaveCount(0)`；本轮重跑 e2e 2 passed、单测 38 passed。
- AC-002：`re_verified`——单测滚底 50→60、e2e 网格 50→100→130（本轮重跑绿）；f003 后首屏 50 未预取（count=50 断言成立）即 AC-002 触发模型未回归。
- AC-003：`re_verified`——单测末页 2 条后触底调用数不变、e2e 末次触底 `offsets.length` 不变（本轮重跑绿）。
- AC-004：`re_verified`——单测双触底 offset=50 仅一次、e2e offsets 去重（本轮重跑绿）。
- AC-005：`re_verified`——单测搜索重置 + f002（offset 归 0 后滚底加载 p50）本轮重跑绿。
- AC-006：`re_verified`——单测列表 50→100、e2e 列表视图 50→100（本轮重跑绿）。

coverage = 6 / 6

复验命令：`npx vitest run tests/unit/renderer/components/session_library/SessionLibrary.test.tsx`（38 passed）；`MOCK_FIXTURE=synthetic npx playwright test --project=web tests/e2e/web/session_library_infinite_scroll.spec.ts`（2 passed，真实 Chromium）；`npx tsc --noEmit`（exit 0）。

### 未进表的提示

- e2e 仍无「非底部」负向用例（Round 2 已注明可选扩展，f001 负向守卫在单测层足够）。
- 「排序 / agent 筛选重置 + 触底继续加载」直接断言仍缺（Round 1 f002 已声明可接受，共用同一 reset effect）。

### 总体判断

f003 修复未使任何既有测试失效、未引入假行为；Round 1/2 两条 minor 的修复测试在 f003 后仍真实有效；e2e 独立守卫「溢出不预取」回归（反写即翻红，本轮重跑 2 passed 证伪）。新发现 1 条 minor（f003 修复的「不溢出补加载」路径零覆盖），非阻断。无未解决 critical / important。

reviewed_scope: 6258f5f10a4a311c

verdict: PASS

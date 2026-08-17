# Task review t434（reviewer_focus: 测试）

- task：`t434_session_refresh_collect_reset`
- spec：`docs/tasks/t434_session_refresh_collect_reset/spec.md`
- diff_anchor：`0a3849a7b61c85f443ec66739ea936220e75e562`
- target：`git diff 0a3849a7b61c85f443ec66739ea936220e75e562`
- round：1
- reviewed_at：2026-08-17 01:25 UTC+8

## Findings

### t434_test_f001 - AC-002 槽位消息重拉无测试：`sessionHistory.query` 刷新后再次调用从未断言

- 严重度：important
- 锚点：AC-002（已打开且 ready 的槽位消息被重新 query，现有 refresh 行为不丢）+ 测试策略「刷新回调后 `sessionHistory.query` / `tokenStats.getSessions` 被再次调用」的前半句未落地
- 位置：`tests/unit/renderer/components/session_shell/SessionShell.test.tsx:235`（新测试）；行为点在 `src/renderer/components/workspace/WorkspaceView.tsx:100-104`（refresh_token 递增 → refresh_all）
- 问题：新测试只断言 `forceCollect` 被调用与 `tokenStats.getSessions` 调用数增加（会话库路径），未打开任何槽位，也未断言 `sessionHistory.query` 在刷新后再次调用。全测试目录 grep 复核：无任何测试以 `refresh_token` prop 渲染 WorkspaceView 或断言 `refresh_all` 重查（`WorkspaceView.test.tsx` 全 1336 行无 refresh_token/refresh_all/forceCollect 命中；`use-workspace-columns` 无对应测试文件）。AC-002 的「已打开且 ready 的槽位消息被重新 query」完全无测试钉住：若未来刷新路径丢失 `refresh_token → refresh_all`，现有全部测试仍绿。测试策略明示要求 `sessionHistory.query` 重拉断言，本 task 未兑现。
- 建议：在 SessionShell 测试中先经 `focus_cb()` 打开一个槽位（query mock 返回消息，等渲染），点「刷新当前面板」后 waitFor 断言 `sessionHistory.query` 调用数增加；与现有 getSessions 计数断言同模式。

### t434_test_f002 - AC-003 最近会话 UI 未重查且无测试：新测试标注 AC-001/AC-003 但场景实为会话库（AC-004）

- 严重度：important
- 锚点：AC-003（最近会话相关 UI 若依赖 token-stats 会话查询，按原调用方式再请求一次）
- 位置：`tests/unit/renderer/components/session_shell/SessionShell.test.tsx:235`（标注 AC-001/AC-003 的测试）；`src/renderer/components/workspace/RecentSessionsModal.tsx:22-38`
- 问题：新测试名「t434 AC-001/AC-003: 顶栏刷新触发 forceCollect 并重拉会话库列表」，实际场景是切到**会话库页签**后点刷新、断言库列表 getSessions 重拉——该行为是 AC-004 的验收内容，与标注的 AC-003 错位。工作台侧的「最近会话」UI（`RecentSessionsModal`，依赖 `tokenStats.getSessions({ limit: 100 })`）只在挂载（弹窗打开）时查询一次（`RecentSessionsModal.tsx:22-38`，`RECENT_LIMIT=100` 即「原 limit」），顶栏刷新不会触发其再次请求，也无任何测试覆盖。按 AC-003 字面读法（「AC-001 之后最近会话 UI 再请求一次」），实现与测试双缺失；若 AC-003 意图即会话库列表重拉，则测试标注应指向 AC-004，且 AC-003 名义覆盖落空。另：AC-001 名义场景「工作台页签点刷新」整体无测试（仅共享 handler 使两页签行为等价，可接受但未直接验证）。「有意不测」区未豁免该场景，未知契约区亦无说明。
- 建议：先明确 AC-003 的「最近会话 UI」所指：(a) 若为弹窗——打开弹窗后点刷新，断言 `getSessions({ limit: RECENT_LIMIT })` 再次调用（实现侧需让弹窗响应刷新，属实现改动，交 code reviewer 与 implementer 处置）；(b) 若为会话库列表——将测试标注改为 AC-004 并在 spec 澄清语义，避免「测了 A 标了 B」的覆盖记账。

### t434_test_f003 - AC-005 interval 重置零断言：测试标题声称「interval reset」但仅断言 config 消息

- 严重度：important
- 锚点：AC-005（手动采集后自动采集定时器以 `poll_interval_ms` 重新起算；可用假时钟/桩断言）+ 测试策略「`setInterval`/`clearInterval` 或可注入 scheduler 断言 reset」
- 位置：`tests/unit/main/core/token-stats/manager.test.ts:336-351`；重置逻辑在 `src/main/core/token-stats/collector.ts:791-795`（start_interval）
- 问题：测试标题为「force_collect posts config to the running child (collect + interval reset)」，断言只有 `expect(last_child!.postMessage).toHaveBeenLastCalledWith({ type: "config", config: base_config })`——验证的是「与周期采集同一入口」（AC-001 语义成立），interval 重置本身零断言。重置发生在 collector 子进程 `start_interval()`（先 `clearInterval` 再按 `config.poll_interval_ms` `setInterval`），而 `collector.test.ts` 全文件无任何 `start_interval`/`setInterval`/`clearInterval`/假时钟测试。AC-005 的「以 `poll_interval_ms` 从该时刻重新起算」无测试钉住：若未来 collector 消息处理被改为「仅首次 config 时 arm interval、后续 config 跳过重置」，manager 测试与 collector 测试仍全绿。测试注释将重置行为作为他人（collector）事实引用，属「claim 而非证据」。
- 建议：collector 侧补测试：`vi.useFakeTimers()` 下发送两次 config 消息（或直接调用 configure+start_interval 两次），断言旧 interval 被 clear、新 interval 按 `poll_interval_ms` 到期触发 collect；或按测试策略注入可断言 scheduler。

## 结论

- 改测方向复核：无「迁就实现」的改测。diff 中对既有测试的改动仅是为新 API 成员补 mock（`popup_view_test_utils.ts:222`、`popup_view_height.test.tsx:238`、`popup_view_mirror.test.tsx:141`、`session_history_test_utils.ts:59`、`settings_view_test_utils.ts:241` 各加 `forceCollect: vi.fn().mockResolvedValue(null)`），无任何既有断言被改动或删除，属合法接口扩展兼容。
- 危险模式扫描：逐条扫过——无恒真断言、无删除/反转/注释断言、无 `.skip`/`.only`、无 eslint-disable/@ts-ignore（`manager.test.ts:1` 的 eslint-disable 为既有行，非本 diff 引入）、无阈值掩盖、无条件跳过、交互用 `fireEvent.click` 非程序赋值。`toBeGreaterThan(calls_after_first)` 断言「刷新后至少再调一次」与 AC「再请求一次」语义吻合，且前序渲染断言已证首次加载，不构成弱化。
- 本轮新发现：3 条（全部 important）
- 未进表的提示：`popup_view_*`、`settings_view`、`session_history` 等仅加 mock 成员的文件消费方测试未跑（CPU 节制指令限定 3 个定向文件），建议合并前至少抽样跑一次 `popup_view_*` 两文件确认 mock facade 兼容；AC-001 名义「工作台页签」场景未直接测，共享 handler 使行为等价，并入 f002 提示未单列。
- 总体判断：AC-001/AC-004 有测试且断言可信（点击共享刷新按钮 → forceCollect + 库列表重拉），但 AC-002/AC-003/AC-005 三个关键行为无测试或仅半条测试（f001/f002/f003 未解决）——本 task 最核心的「重置计时」与「槽位/最近会话重拉」无证据钉住，FAIL。
- 系统性 follow-up：无（f003 建议的 collector interval 测试缺口可单开 task，或在本 task 内补，未发现既有等价 tid）。

### AC 复验方式

- AC-001：re_verified。重跑 `SessionShell.test.tsx` 断言 `forceCollect` 被调用（点击「刷新当前面板」）；`manager.test.ts:344-349` 断言 `force_collect` 向 child 发送与 `start()` 相同的 `{type:"config"}` 消息（同入口成立）。
- AC-002：re_verified（判定无测试）。grep 全测试目录：无 `refresh_token`/`refresh_all` 覆盖，无 `sessionHistory.query` 刷新重查断言（f001）。
- AC-003：re_verified（判定无测试）。新测试标注 AC-003 但场景为会话库页签；`RecentSessionsModal.tsx:22-38` 仅挂载查询，刷新不重查（f002）。
- AC-004：re_verified。`SessionShell.test.tsx:249-259` 断言刷新后 `getSessions` 调用数增加；`SessionLibrary.tsx:167-168` refresh_token 依赖重拉，代码核对一致。
- AC-005：re_verified（判定半条无断言）。`manager.test.ts:344-349` 仅断言 config 消息；`collector.test.ts` 无 interval/假时钟测试（f003）。
- AC-006：re_verified（定向子集）。`pnpm exec vitest run tests/unit/main/core/token-stats/manager.test.ts tests/unit/renderer/components/session_shell/SessionShell.test.tsx tests/unit/renderer/components/workspace/WorkspaceView.test.tsx`：3 文件 82 用例全绿（manager 23 / SessionShell 12 / WorkspaceView 47）。全量未跑（CPU 节制指令），其余改动 util 消费者未验。
- AC-007：trust_prior。`[deploy]` 真实实例行为，依赖运行中桌面进程与真实磁盘，无自动测试可独立复验；依赖实施侧已在收尾材料声明的事实，不据此出 finding。

coverage = 6 / 7

reviewed_scope: 1a4d296e6a9048fe

verdict: FAIL

## Round 2 (2026-08-17 10:35 UTC+8)

- round：2
- reviewed_at：2026-08-17 10:35 UTC+8

### 前轮 finding 复核（以当前 diff 为准）

- **f001（AC-002 槽位消息重拉无测试）——已修。** `SessionShell.test.tsx` 新增用例「t434 AC-001/AC-002/AC-003: 顶栏刷新触发 forceCollect、槽位消息重拉与会话库重拉」：先 `focus_cb()({ source: "claude_code", env: "win", session_id: "s1" })` 打开槽位，`waitFor(getByText("你好"))` 证明消息渲染（query 至少一次），记 `query_after_focus`；点「刷新当前面板」后 `waitFor` 断言 `sessionHistory.query.mock.calls.length > query_after_focus`。干扰源核查：工作台唯一自动重拉是 30s 兜底轮询（`use-workspace-columns.ts:370`，FALLBACK_MS），远大于 `waitFor` 默认 1000ms 超时——若实现回退丢失 `refresh_token → refresh_all`（`WorkspaceView.tsx:100-104`），轮询不会在超时内兜底，测试会红，断言有效非弱化。重跑 `SessionShell.test.tsx` 12 用例全绿。
- **f002（AC-003 最近会话不重查 + 测试标注错位）——修不彻底，仍 important。** 实现侧已补：`RecentSessionsModal` 新增 `refresh_token` prop，`useEffect` 依赖 `[refresh_token]` 按 `RECENT_LIMIT=100`（原 limit）重查（`RecentSessionsModal.tsx:28-45`），`WorkspaceView.tsx:438` 传入，链路 `SessionShell onRefresh → set_refresh_token → WorkspaceView → RecentSessionsModal` 成立。但测试侧未补：SessionShell 新用例场景仍为「切会话库页签 → 刷新 → getSessions 重拉」，断言载体是 `SessionLibrary`（AC-004 行为）；全测试目录 grep 无任何用例在弹窗打开状态下断言刷新后 `getSessions` 再次调用（`WorkspaceView.test.tsx` 弹窗用例仅覆盖打开/选择/confirm，无 `refresh_token` 命中）。AC-003「最近会话 UI 按原调用方式再请求一次」仍无测试钉住：若 `useEffect` 依赖回退为 `[]`，现有测试全绿。用例标题含 AC-003 但验证的是会话库路径，标注错位依旧。
- **f003（AC-005 interval 重置零断言）——已修。** `collector.test.ts` 新增 `describe("interval 重置 (t434 AC-005)")`：`vi.useFakeTimers()` 下两次 `configure + start_interval`（poll_interval_ms 120_000 → 300_000），spy `globalThis.setInterval/clearInterval`，断言旧 interval 被 clear（`clear_spy.toHaveBeenCalled()`）且 re-arm delay 为新 `poll_interval_ms`。直接触达导出的真实生产函数 `start_interval`/`configure`（`collector.ts:791-795` 先 `clearInterval(interval_id)` 再按 `config.poll_interval_ms` arm），非 mock 自己模块；`afterEach` 里 `useRealTimers + reset_config`（reset_config 亦清 interval_id）。真实 IPC 路径 `load_state → configure → start_interval`（`collector.ts:801-810`）与测试直调 `configure + start_interval` 等价，符合测试策略建议。重跑 `collector.test.ts` 48 用例全绿。

### 本轮新发现

0 条独立新 finding。两点观察不入表：(a) collector 新测试 `set_spy/clear_spy.mockRestore()` 位于 it 尾部而非 `afterEach`，断言失败时 spy 残留（spyOn 默认 callThrough 不改行为，低风险）；(b) `manager.test.ts` 新用例标题标注 AC-005 但本用例仅断言 config 消息，interval 重置由 collector 测试互补覆盖，非缺陷。

### 危险模式扫描（本轮新增）

逐条扫过：无恒真断言（`interval_calls.length ≥ 1` 后紧跟精确 delay 断言，非「存在即通过」）；无删/反转/注释 expect；无 `.skip`/`.only`；无 eslint-disable/@ts-ignore 新增；假时钟 spy 在系统边界（global `setInterval`/`clearInterval`）而非 mock 被测模块；无阈值掩盖；无条件跳过弱化断言；无程序赋值替代交互（`fireEvent.click` 真实点击）。`toBeGreaterThan` 计数断言有前序渲染证据支撑且 30s 兜底轮询不干扰，不构成弱化。

### 改测方向复核

无「迁就实现」的改测。本轮测试改动全部为新增用例或 mock 成员扩展（`tokenStats.forceCollect`），无既有断言被改动/删除/弱化。

### 结论

- 前轮 finding 复核：f001 已修；f002 修不彻底（实现已补、AC-003 弹窗重查仍无测试钉住、标注仍错位）；f003 已修。
- 改测方向复核：无。
- 本轮新发现：0 条（f002 残余计入前轮复核）。
- 未进表的提示：见上「本轮新发现」两点；另 `popup_view_*`/`settings_view` 等仅补 mock 成员的消费方测试未跑（CPU 节制指令限定 4 个定向文件），建议合并前抽样跑一次。
- AC 复验更新：AC-002 re_verified（query 重拉断言重跑绿）；AC-003 re_verified（判定仍无测试，实现链路已查证）；AC-005 re_verified（collector 假时钟测试重跑绿）；AC-001/AC-004/AC-006 维持 Round 1 复验——本轮 4 文件 130 用例全绿（manager 23 / collector 48 / SessionShell 12 / WorkspaceView 47）；AC-007 trust_prior（`[deploy]`，依赖实施侧证据）。
- coverage = 6 / 7
- 总体判断：f001/f003 已真修（diff + 重跑双重核实），f002 仅实现侧落地、测试侧未钉住 AC-003 且标注错位仍在——仍有 1 条未解决 important，FAIL。
- 系统性 follow-up：无。

reviewed_scope: e32c6a583e75ea53

verdict: FAIL

## Round 3 (2026-08-17 10:45 UTC+8)

- round：3
- reviewed_at：2026-08-17 10:45 UTC+8

### 前轮 finding 复核（以当前 diff 为准）

- **f001（AC-002 槽位消息重拉无测试）——维持已修。** 本轮 diff 未触碰 `SessionShell.test.tsx`，合并用例「t434 AC-001/AC-002/AC-003」（`SessionShell.test.tsx:235-276`）仍在：`focus_cb()` 打开槽位 → `waitFor(getByText("你好"))` 证明 query 有渲染产物 → 点「刷新当前面板」后断言 `sessionHistory.query` 调用数增加。重跑绿。无回退。
- **f002（AC-003 最近会话不重查 + 测试标注错位）——已修。** 本轮新增 `WorkspaceView.test.tsx:384-405` 用例「t434 AC-003: 最近会话弹窗打开态下顶栏刷新按原 limit 重查（refresh_token 依赖）」：`getByRole("button", { name: "最近会话" })` 打开弹窗 → `waitFor` 断言 `session-recent-row` 行渲染（getSessions 至少一次，`calls_before > 0`）→ **弹窗保持打开态**点 `getByTitle("刷新当前面板")` → 断言 getSessions 调用数 > calls_before。链路以 diff 核实：`SessionShell.tsx:60-64`（onRefresh → forceCollect + `set_refresh_token(k+1)`）→ `WorkspaceView.tsx:438`（`refresh_token={refresh_token}` 传入弹窗）→ `RecentSessionsModal.tsx:28-45`（effect 依赖 `[refresh_token]`，按 `RECENT_LIMIT=100` 原 limit 重查）。钉住有效性论证：弹窗条件渲染 `recent_open && <RecentSessionsModal>`（`WorkspaceView.tsx:435-439`），点刷新不翻转 `recent_open`、无 key 变化，组件不重挂载；若 effect 依赖回退为 `[]` 或 refresh_token 未透传，计数不增、测试必红；getSessions 在渲染树中仅 RecentSessionsModal 调用，工作台 30s 兜底轮询只触发 `sessionHistory.query`（AC-002 路径）不干扰计数。断言有前序渲染证据（行出现）支撑，非「存在即通过」。标注错位核心危害（AC-003 名义覆盖落空）消除——AC-003 现已由专用用例独立钉住。残余：SessionShell 合并用例标题仍含 AC-003 标签，但其 getSessions 断言场景为会话库（AC-004），属标题标签冗余（见未进表提示），不再构成覆盖记账错误，不阻断。
- **f003（AC-005 interval 重置零断言）——维持已修。** `collector.test.ts`「interval 重置 (t434 AC-005)」假时钟用例（configure + start_interval 两次、断言旧 interval 被 clear、新 delay 为 300_000）本轮未动，重跑绿。Round 2 观察项「set_spy/clear_spy.mockRestore() 位于 it 尾部」仍在，低风险不升级。

### 本轮新发现

0 条独立新 finding。

### 危险模式扫描（本轮新增）

新用例逐条扫过：无恒真断言（`calls_before > 0` 与 `> calls_before` 均有前序渲染证据）；无删/反转/注释 expect；无 `.skip`/`.only`（单独 `-t` 跑 1 passed / 47 skipped，skipped 为 `-t` 过滤而非标记）；无 eslint-disable/@ts-ignore；无阈值掩盖（waitFor 默认 1000ms，唯一候选干扰源 30s 兜底远大于之）；无条件跳过；交互用 `fireEvent.click` 真实点击（开弹窗、顶栏刷新两按钮分离，非程序赋值）。

### 改测方向复核

无「迁就实现」的改测。本轮测试改动仅 `WorkspaceView.test.tsx` +22 行（新增用例），既有断言零改动零删除。

### 结论

- 前轮 finding 复核：f001 维持已修；f002 已修（弹窗打开态刷新重查由专用用例双重钉住，diff + 独立重跑核实；仅余标题标签冗余 minor 级）；f003 维持已修。无未解决 important。
- 改测方向复核：无。
- 本轮新发现：0 条。
- 未进表的提示：(a) 新用例标题声称「按原 limit 重查」但仅断言调用数、未断言参数 `{limit: 100}`——AC-003 明示「不强制新 limit 数值」且 effect 为共享调用体，不构成缺陷；可选加固 `toHaveBeenLastCalledWith({ limit: RECENT_LIMIT })`。(b) SessionShell 合并用例标题含 AC-003 标签冗余，建议后续改标或由 spec 澄清（不阻断）。(c) `popup_view_*` / `settings_view` 等仅补 mock 成员的消费方文件仍未跑（CPU 节制指令限定 4 个定向文件），建议合并前抽样跑一次。
- AC 复验更新：AC-003 本轮 re_verified（新增用例单独 `-t` 跑绿 + 链路代码核实，前轮判定「无测试」已翻转）；AC-001/AC-002/AC-004/AC-005 维持 re_verified（4 文件 131 用例全绿：manager 23 / collector 48 / SessionShell 12 / WorkspaceView 48）；AC-006 re_verified（定向子集）；AC-007 trust_prior（`[deploy]`，依赖实施侧证据）。
- coverage = 6 / 7
- 总体判断：f002 残余 important 已真消除（专用用例钉住弹窗打开态刷新重查，断言可信、钉真实）；余项均为 minor 级标签/可选加固，PASS。
- 系统性 follow-up：无。

reviewed_scope: 97d5e3ab4e677499

verdict: PASS

## Round 4 (2026-08-17 10:55 UTC+8)

- round：4
- reviewed_at：2026-08-17 10:55 UTC+8

### 前轮 finding 复核（以当前 diff 为准）

- **f001（AC-002 槽位消息重拉无测试）——维持已修。** `SessionShell.test.tsx` 合并用例（235-276）本轮未动：`focus_cb()` 打开槽位 → 渲染产物证明 query → 点「刷新当前面板」断言 `sessionHistory.query` 调用数增长。重跑绿。
- **f002（AC-003 最近会话不重查 + 标注错位）——维持已修。** `WorkspaceView.test.tsx` AC-003 专用用例本轮仅改断言载体（见 f004 复核），弹窗打开态刷新重查的钉住语义不降反升；SessionShell 合并用例标题 AC-003 标签冗余维持 minor 级提示，不阻断。
- **f003（AC-005 interval 重置零断言）——维持已修。** `collector.test.ts` 假时钟用例（configure + start_interval 两次、断言 clear 旧 + 新 delay 300_000）本轮未动，重跑绿。
- **f004（code 侧 important：AC-003 用例断言被隐藏挂载 SessionLibrary 的 limit:50 重拉污染）——已修，判定真消除。** 修复将断言从「全部 getSessions 调用数增长」改为按参数过滤：`recent_calls()` 只统计 `mock.calls` 中 `c[0].limit === 100` 的调用（`WorkspaceView.test.tsx:396-399`），并保留 `calls_before > 0` 前置（:400-401，证弹窗 mount 查询已发生、过滤非空泛）。以当前代码核实隔离依据：`limit:100` 在测试渲染树中唯一归因 RecentSessionsModal——`SessionLibrary.tsx:24` `PAGE_SIZE=50`（f004 污染源，被过滤剔除）、`SessionPickerModal.tsx:17` `PICKER_LIMIT=500`（且本用例未打开）、`use-workspace-columns.ts` 四处 getSessions 为 5/200；`RecentSessionsModal.tsx:16` `RECENT_LIMIT=100` 与过滤值精确一致。弹窗保持打开态不重挂载核实：`recent_open` 状态在 SessionShell（:27），刷新回调（SessionShell.tsx:58-64）只做 `forceCollect` + `set_refresh_token`，不触碰 `recent_open`/无 key 变化——刷新后新增的 limit:100 调用只能来自弹窗 effect 依赖 `[refresh_token]`（RecentSessionsModal.tsx:41-44）重跑，无其它来源。回归反证（推理，未改代码）：若弹窗 effect 依赖回退 `[]` 或 `refresh_token` 未透传，刷新后 `recent_calls()` 不增、waitFor 超时用例必红——测试仍能钉住 AC-003。断言强度较 Round 3 版本严格（此前库重拉即可满足计数增长，现仅弹窗可归因调用计数），属 code reviewer f004 建议的 (b) 方案落地。

### 本轮新发现

0 条独立新 finding。

### 危险模式扫描（本轮新增）

修复点逐条扫过：`recent_calls()` 过滤非恒真（有 `calls_before > 0` 前置 + 行渲染 `toHaveLength(1)` 证据，且最终断言是 `> calls_before` 增长比较）；无删/反转/注释 expect；无 `.skip`/`.only`（131/131 全量通过，无独占过滤）；无 eslint-disable/@ts-ignore 新增；无阈值掩盖（waitFor 默认 1000ms，唯一干扰源 30s 兜底轮询远大于之且仅触发 query 非 getSessions）；无条件跳过；交互仍为 `fireEvent.click` 真实点击。`(c[0] as { limit?: number } | undefined)?.limit === 100` 类型转换合法，未弱化断言。

### 改测方向复核

无「迁就实现」的改测。本轮唯一测试改动是对既有 AC-003 用例断言的**强化**（缩小计数范围、按 limit:100 参数隔离弹窗可归因调用），方向是让断言更精确钉住 AC-003，与 TDD 顺序一致；f004 为 code 侧 finding 但其修复载体在测试断言，属本 reviewer 复核范围，已按上述核实。

### 结论

- 前轮 finding 复核：f001 维持已修；f002 维持已修；f003 维持已修；f004（code 侧 important）已修——参数隔离真实有效（limit:100 唯一归因弹窗，库的 limit:50 重拉被剔除），回归反证成立，无未解决 critical/important。
- 改测方向复核：无。
- 本轮新发现：0 条。
- 未进表的提示：(a) `limit === 100` 硬编码 RECENT_LIMIT（组件未导出该常量），常量若变更会 loud failure（`calls_before > 0` 失败）而非静默误判，低风险，可选改为从组件导出常量复用；(b) SessionShell 合并用例标题含 AC-003 标签冗余（Round 2/3 已提示，维持 minor 不阻断）；(c) `popup_view_*` / `settings_view` 等仅补 mock 成员的消费方文件仍未跑（CPU 节制指令限定 4 个定向文件），建议合并前抽样跑一次。
- AC 复验更新：AC-003 本轮 re_verified（修复后断言按 limit:100 参数隔离、回归反证成立、定向重跑绿）；AC-001/AC-002/AC-004/AC-005 维持 re_verified（4 文件 131 用例全绿：manager 23 / collector 48 / SessionShell 12 / WorkspaceView 48，含修复后的 AC-003 用例）；AC-006 re_verified（定向子集）；AC-007 trust_prior（`[deploy]`，依赖实施侧证据）。
- coverage = 6 / 7
- 总体判断：f004 已真消除（diff + 全树归因核实 + 定向重跑三重验证），前轮 test 轴 finding 全部闭环，余项均为 minor 级标签/可选加固，PASS。
- 系统性 follow-up：无。

reviewed_scope: 57e903d3e4002b5e

verdict: PASS

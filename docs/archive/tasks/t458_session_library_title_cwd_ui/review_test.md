# Task review t458（reviewer_focus: 测试）

- task：`t458_session_library_title_cwd_ui`
- spec：`docs/tasks/t458_session_library_title_cwd_ui/spec.md`
- diff_anchor：`1e6a9c13d40277c88a8c928d108d998cb3870c4e`
- target：`git diff 1e6a9c13d40277c88a8c928d108d998cb3870c4e`
- round：1
- reviewed_at：2026-09-08 07:21 UTC+8
- reviewed_scope: 1051c38807bcb17e

## Findings

无。

## 结论

- 前轮 finding 复核：Round 1，无前轮。
- 改测方向复核：无迁就实现的改测。唯一改既有测试处为 `tests/e2e/web/session_library_mount_refill.spec.ts:108` 视口 2100→2200，属「测试前提修复」而非「断言迁就实现」：该用例断言语义不变——仍要求 offsets `[0,50]`（补满至中途溢出即停）与 `sh > ch`（真实可滚）；t458 筛栏新增两个输入使栏高 +44px，50 条首屏由「不溢出」翻转为「溢出」，破坏「首屏不溢出才触发补满」的测试前提。改视口恢复前提，断言未弱化（无阈值放宽、无条件跳过、未改 poll 内容）。归因充分：UI 结构变化属规格内行为（AC-001/002 新增输入），非实现 bug、非测试写错。注释明示 ch 1900→1856 探针实测值。
- AC 覆盖核对：
    - AC-001（标题输入独立、不串 directory/id）：`SessionLibrary.test.tsx:1536`「t458 AC-001」——组件层经 `fireEvent.change(getByLabelText("标题"))` 真实交互驱动（输入框 `aria-label` 见 `SessionLibrary.tsx:513`），断言请求 `title: "t-hit"` 且 `not.toHaveProperty("search")`/`("directory")`（参数分离）；结果判别经 mock `getSessions` 按 filters 返回不同列表（有 title → 仅 `t-hit`，无 title → 全量 SESSIONS），用户可观察：`会话 t-hit` 出现、`会话 a` 消失。mock 只在 IPC 边界（`install_history_usageboard`，`session_history_test_utils.ts`），未 mock 内部函数，生产过滤逻辑真实可达。
    - AC-002（目录输入独立、不串 title/id）：`SessionLibrary.test.tsx:1563`「t458 AC-002」——同构断言 `directory: "/proj/d-hit"`、`not.toHaveProperty("title")`，结果判别同理。
    - AC-003（五条件 AND + 分页不丢）：`SessionLibrary.test.tsx:1589`「t458 AC-003」——title+directory+日期+Agent 芯片+排序同时设置，断言首页请求 objectContaining 全条件；`scroll_to_bottom(grid())` 触发加载更多后，末次调用仍携带 title/directory/sources/start_at/end_at/order_by + `offset: 50`。日期断言 `expect.any(Number)` 可接受（t248 AC4 既有同模式；日期值转换属查询层 t457 已测语义）。
    - AC-004（清空筛选）：`SessionLibrary.test.tsx:1643`「t458 AC-004」——填入两输入后点「清除筛选」，断言两输入框 `.value === ""`（用户可观察 UI 状态）且末次 getSessions 调用 `expect.not.objectContaining` 非空 title/directory（请求不再携带）。`expect.not.objectContaining + stringMatching(/.+/)` 写法验证「不带非空参数」语义正确：空串键存在亦不满足非空串匹配，但实现侧空串本就不进 filters（`SessionLibrary.tsx:110-112` 展开守卫），断言强度与 AC 一致。
    - AC-005（内容搜索候选受 title/directory 约束）：`SessionLibrary.test.tsx:1670`「t458 AC-005」——勾选开关+填混搜词后，断言 `searchContent` 首调 `filters` matchObject 含 `title/directory/search` 三键。组件侧 filters 组装（`SessionLibrary.tsx:283-289`）与 effect 依赖（`:372` 含 `title_filter/directory_filter`）均被触达；正文排除「被过滤会话不出现在结果」由返回值判别承担，server 侧候选过滤已由 t457 IPC 用例（`session-history-ipc.test.ts:576` AC-006）覆盖，无假覆盖。
    - AC-006（web 与桌面一致）：架构事实已独立核实——`src/web/main-web.tsx:4` import 同一 `../renderer/App`，`App.tsx:30` → `SessionShell.tsx:148` → 同一 `SessionLibrary` 组件，两路 UI 行为由组件层 AC-001～005 用例共同保证。web 侧差异仅桥序列化：`usageboard-web.test.ts:689` 新增 AC-006 用例断言 searchContent POST body 原样携带 `filters:{title,directory,search}`（`toEqual` 全量，最强断言）；web `getSessions` title/directory 序列化已有 t457 用例 `usageboard-web.test.ts:73`（AC-007，含空串省略）。桌面 preload `src/preload/index.ts:118-121` filters 整体透传 invoke，无需单独序列化断言。覆盖闭环成立，无缺测 AC。
    - 边界补充：「有意不测」仅筛栏像素级布局；空串边界已由「AC-001 补充」用例（`SessionLibrary.test.tsx:1699`）主动覆盖（先带值后清空，末次调用 `not.toHaveProperty("title")`），超出 spec 最低要求。
- 危险模式扫描：无 `.only/.skip`、无删断言/注释断言、无 eslint-disable/@ts-ignore、无恒真断言、无删除测试块；mock 全部位于 IPC/fetch 边界（usageboard 全局 mock、`vi.stubGlobal("fetch")`），未 mock 自身模块或被测逻辑。异步时序：组件测试用 `waitFor` + mock 即时 resolve，300ms 防抖经 `waitFor` 轮询自然越过（jsdom 真实计时器，既有 AC5 同模式且本轮实测 51 用例 5.4s 全绿），无 timeout 掩盖。实跑验证：`vitest run` 两文件 108/108 通过（2026-09-08 07:15）。
- 本轮新发现：0 条
- 未进表的提示：AC-003 用例验证「加载更多请求携带条件」，但未断言第二页结果与首页不重叠的展示序号守卫——属既有 t227/t328 用例已覆盖的分页语义，AC-003 文义（分页不丢条件）已满足，可选增强非缺口。
- 总体判断：7 个新用例全部对准 AC 契约，断言在系统边界（组件 UI 交互 + IPC/fetch 请求体）验证用户可观察行为，web 一致性论证成立，改测方向合法，无 critical/important 问题。
- 系统性 follow-up：无

verdict: PASS

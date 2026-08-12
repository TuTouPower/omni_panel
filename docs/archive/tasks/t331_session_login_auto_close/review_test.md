# Task review t331（reviewer_focus: 测试）

- task：`t331_session_login_auto_close`
- spec：`docs/tasks/t331_session_login_auto_close/spec.md`
- diff_anchor：`9d871706fa570a6c846e9292f7b82cb33788b9ce`
- target：`git diff 9d871706fa570a6c846e9292f7b82cb33788b9ce`
- round：1
- reviewed_at：2026-08-13 00:35 UTC+8

## Findings

### t331_test_f001 - session-manager 新增 AC-001 测试与既有 auto-close 测试重复

- 严重度：minor
- 锚点：AC-001 已有覆盖，新增测试未提供额外验证价值
- 位置：`tests/unit/session/session-manager.test.ts:195-217`
- 问题：本 diff 新增的 `t331 AC-001: auto_close_ms 传入时捕获 Cookie 后定时关闭登录窗口` 与 anchor 处已存在的 `auto-closes window after auto_close_ms delay when cookie is captured`（`session-manager.test.ts:587-614`）验证同一生产路径、同一 fake timers 手法、断言近乎相同（cookie 捕获后推进 1500ms → `window.closed === true` → promise 解析 `saved:true`）。`session-manager.ts` 的 `auto_close_timer` 逻辑在 t331 前已存在并被测试覆盖，本新增测试为约 24 行冗余。测试策略区要求补 session-manager 层测试，实施方照做，但未发现既有覆盖已满足。
- 建议：删除新增测试（或保留一个，删另一个）；非阻断，实施方可记入 task.md 处置表。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无（Round 1）。
- 改测方向复核：无「迁就实现」的改测。`add_account_dialog.test.tsx:197` 与 `web_login_form.test.tsx:100` 两处既有断言更新，是给 `session.login` 期望参数精确补上 `auto_close_ms: 1500`——生产侧 WebLoginSection 对无 instance_id 路径新增该字段（spec 明确要求 web/桌面添加账号路径自动关窗），断言仍为全参数精确匹配（toHaveBeenCalledWith 全对象），未弱化。桌面编辑路径（有 instance_id）不传 auto_close_ms，由既有 `web_login_section.test.tsx:133`（AC-005 桌面路径）与 `settings_view.test.tsx:267` 的精确匹配守护，未改动、仍通过，构成对「编辑路径行为不变」的反向守卫。
- 本轮新发现：1 条（minor）。
- 未进表的提示：
    - AC-004（session.refresh 支持 auto_close_ms）无 refresh 通道级显式测试，仅由共享 handler 覆盖。`SESSION_REFRESH` IPC（`session-ipc.ts:81-90`）与 HTTP `/v1/session/refresh`（`server.ts:821-833`）均原样委托 `handleSessionLogin`，auto_close_ms 透传逻辑唯一存在于该共享函数，已被 AC-001 ipc 测试覆盖；refresh 无独立逻辑，显式测试价值近零。可选扩展，非缺口。
    - ipc AC-002 断言 `expect.not.objectContaining({ auto_close_ms: expect.any(Number) })`（`session-ipc.test.ts:79-81`）：若实现改为显式传 `auto_close_ms: undefined` 该断言仍通过。但 session-manager 用 `request.auto_close_ms != null` 判断，undefined 与缺省行为等价，无真实缺口。
    - 当前工作区 diff 未提交（HEAD 仍为 anchor `9d871706`），与 task-work「每 task 一个执行 commit」约定不符；属流程性观察，不影响本审阅结论。
    - 真实 Electron 窗口自动关闭行为列「有意不测」，放行。
- 危险模式扫描放行说明（命中项均调查）：
    - `web_login_section.test.tsx:175` `expect(screen.getByText("网页登录")).toBeTruthy()` 命中 toBeTruthy 模式。调查结论：按钮文本在 `logging_in` 时切换为「正在打开登录窗口…」，`getByText("网页登录")` 仅当 UI 恢复（logging_in=false）时命中；若实现使 UI 卡在加载态，该断言超时失败。存在性与「正在打开登录窗口…不在文档中」等强于相等，且与 `onSecrets` 行为断言（176 行）互补，非「存在即通过」，不弱化。放行。
- 总体判断：测试可信、AC-001~004 均有有效覆盖、改测方向正确（补精确参数非迁就实现）；仅 1 条 minor（测试冗余），无未解决 critical/important。
- AC 复验方式：
    - AC-001：`re_verified`——重跑 `session-manager.test.ts`（26 通过）、`session-ipc.test.ts`（13 通过）、`web_login_section.test.tsx`（7 通过）；fake timers `advanceTimersByTimeAsync(1500)` 后 `deps.window.closed === true` 且 promise 解析 `{saved:true}`，透传链 session-ipc → start_login 验证成立。
    - AC-002：`re_verified`——session-ipc AC-002 测试断言未携带 numeric auto_close_ms；既有 `session-manager.test.ts:641` 直接验证未传时捕获 cookie 不自动关窗。
    - AC-003：`re_verified`——web_login_section AC-003 测试运行通过；断言 `session.login` 参数含 `auto_close_ms:1500` 且登录成功后按钮恢复、`onSecrets` 收到 cookie。
    - AC-004：`re_verified`——组合验证：handleSessionLogin 透传测试（AC-001 ipc）覆盖唯一透传逻辑；refresh 两条通道（IPC `session-ipc.ts:81-90`、HTTP `server.ts:821-833`）原样委托该函数。
    - coverage = 4 / 4
- 系统性 follow-up：无。

reviewed_scope: 7fd8888d0a5e07d0

verdict: PASS

## Round 2 (2026-08-13 00:33 UTC+8)

### 前轮 finding 复核

- t331_test_f001（minor，session-manager 新增 AC-001 测试与既有 auto-close 测试重复）：**已消除**。`git diff 9d871706 -- tests/unit/session/session-manager.test.ts` 为空，文件与 anchor 完全一致——冗余 AC-001 测试（Round 1 位置 `session-manager.test.ts:195-217`，约 24 行）已整体删除，未留下弱化/残段。既有 `auto-closes window after auto_close_ms delay when cookie is captured`（现 `session-manager.test.ts:563-590`，行号较 Round 1 上移 24 行，与删除量吻合）原样保留。删除合法：同一生产路径的等价覆盖已存在（见下「AC-001 覆盖完整性」），非「删测试掩盖覆盖」。

### 本轮新发现

- 无（0 条）。

### AC-001 覆盖完整性复核（删除冗余测试后）

- 两层覆盖链仍完整，各司其职、无空洞：
    - session-ipc 透传层（`session-ipc.test.ts` t331 AC-001，diff 内新增，本轮未动）：断言 `start_login` 收到 `expect.objectContaining({ auto_close_ms: 1500 })`，证参数从 IPC 请求透传。
    - session-manager 行为层（既有 `session-manager.test.ts:563-590`）：`auto_close_ms:1500` + 捕获 Cookie → `advanceTimersByTimeAsync(1500)` → `deps.window.closed === true` → promise 解析 `saved:true`，证「捕获后按该时长自动关窗」。
    - 被删测试验证的恰是这条 manager 层路径，与既有测试重合；删除后该路径仍被既有测试完全覆盖。

### 结论（Round 2）

- 前轮 finding 复核：t331_test_f001 已消除（删除彻底、无弱化残留）。
- 改测方向复核：无「迁就实现」改测。本轮唯一变更即删除冗余测试，未改任何既有断言预期。
- 危险模式扫描：「删测试」命中项已调查，判合法删除（等价覆盖保留，见 AC-001 完整性）；其余危险模式项本轮 diff 无新增命中（session-manager.test.ts 回到 anchor 态）。
- 本轮新发现：0 条。
- 未进表的提示：Round 1 三条提示项（AC-004 无独立 refresh 通道测试、ipc AC-002 的 not.objectContaining 边界、diff 未提交）不因本轮变更而改变，维持原结论。
- 总体判断：Round 1 唯一 minor finding 已修复；AC-001 覆盖仍完整，全量回归通过；无未解决 critical/important。
- AC 复验方式：
    - AC-001：`re_verified`——重跑 `session-manager.test.ts`（25 通过）、`session-ipc.test.ts`（13 通过）；既有 L563-590 完整覆盖 auto_close_ms 关窗，ipc 透传测试证参数到达 start_login，全量 2991 passed 无回归。
    - AC-002：`re_verified`——`session-ipc.test.ts` AC-002 断言 start_login 不携带 numeric auto_close_ms；`session-manager.test.ts:617-643` 未传 auto_close_ms 捕获 cookie 不自动关窗。
    - AC-003：`re_verified`——`web_login_section.test.tsx` diff 与 Round 1 相同、本轮未改动，Round 1 已复验（按钮恢复 + onSecrets 收 cookie）；删除 session-manager 冗余测试不影响 web 层。
    - AC-004：`re_verified`——handleSessionLogin 透传测试（AC-001 ipc）覆盖唯一透传逻辑；refresh 两条通道（IPC `session-ipc.ts:81-90`、HTTP `server.ts:821-833`）原样委托该函数，与 Round 1 结论一致。
    - coverage = 4 / 4
- 系统性 follow-up：无。

reviewed_scope: 69bf44096dc9546d

verdict: PASS

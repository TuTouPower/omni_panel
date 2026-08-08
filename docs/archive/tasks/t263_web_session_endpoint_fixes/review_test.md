# Task review t263（reviewer_focus: 测试）

- task：`t263_web_session_endpoint_fixes`
- spec：`docs/tasks/t263_web_session_endpoint_fixes/spec.md`
- diff_anchor：`bcff81e97e56dd5b93183c27d937f2d2c48d9b59`
- target：`git diff bcff81e97e56dd5b93183c27d937f2d2c48d9b59`
- round：1
- reviewed_at：2026-08-08 14:24 UTC+8

## 验证基线

- 已用 `git rev-parse --show-toplevel` 确认仓库根 `D:/Dev/Code/omni_usage_t263`，与 task 工作区一致。
- 实际运行：`npx vitest run` 三个改动测试文件全部通过（web shim 27 + SessionLibrary 32 + server 38）；`npx playwright test --project=web -g "用量面板跨面板打开会话定位到目标会话"` 通过（943ms）。注：直接跑 server.test.ts 首次全红为 sqlite ABI 环境问题，`node scripts/ensure_sqlite_abi.mjs node` 后 38 全过，非本 diff 引入。
- web e2e 既有 4 失败（搜索统计行 / virtual list 三例）与本 diff 无关，已登记 p090，不作为覆盖缺口。

## Findings

### t263_test_f001 - e2e 用直接 API 调用替代 AC1 要求的用量面板会话表行点击

- 严重度：important
- 锚点：AC1（web 端从用量面板会话表打开会话 → 跳转并定位）
- 位置：`tests/e2e/web/session_panel.spec.ts:127-129`
- 问题：测试通过 `page.evaluate(() => window.usageboard.sessionHistory.open("claude_code","win","s1"))` 直接调 API 模拟触发，注释自述「模拟用量面板会话表触发打开」，绕过了 AC1 指定的真实交互路径：用量面板 SessionTable 行点击（`src/renderer/components/token-stats/SessionTable.tsx:202-204` → `TokenStatsView.tsx:864-874` onOpenSession → `open`）。该 onOpenSession→open 接线在本 diff 与既有 e2e 中均无覆盖（全仓仅此一条跨面板 e2e），若 identity_key 拆分或接线损坏，本测试仍会绿。fixture 已含 s1（claude_code|win），行点击可行。
- 建议：改为定位并点击用量面板会话表中 s1 的行（或行内打开按钮），经真实 UI 触发 open，再断言 slot-pane `data-loc-key`。

### t263_test_f002 - AC4「前序搜索请求被取消」无渲染层直接断言

- 严重度：minor
- 锚点：AC4（web 端连续触发内容搜索时，前序搜索请求被取消）
- 位置：`tests/unit/renderer/components/session_library/SessionLibrary.test.tsx:760-784`（t239 防抖测试）
- 问题：AC4 前半句「前序搜索请求被取消」未在渲染层直接断言：现有覆盖验证 signal 透传（`SessionLibrary.test.tsx:252-253, 778-782`）、web shim→fetch 透传（`usageboard-web.test.ts` 新增）、服务端断连中止（`server.test.ts` 新增），但没有任何测试断言「搜索 A 已 in-flight 时触发搜索 B，A 的 signal 变为 aborted」——`SessionLibrary.tsx:230/274` 的 `content_abort_ref.current?.abort()` 未被用例触及。防抖测试仅覆盖 300ms 窗口内两次输入合并为一次调用，未覆盖「已触发后在窗口外再次输入使前序取消」。若删掉渲染层 abort，本链测试仍全绿。
- 建议：补一条 fake-timer 用例：首次防抖触发后（mock 挂起 pending）再次输入并推进时间，断言首个 signal.aborted === true。属扩展覆盖，不阻断。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：round 1，无。
- 改测方向复核：无迁就实现的改测。`server.test.ts` 三条既有测试改动（id-only→400、before_cursor/404 补 source/env、searchContent→searchContentWithAbort）均由 spec AC3/AC5 与测试策略明确要求（移除 id-only 回退、按新语义调整）；`SessionLibrary.test.tsx` 两处为新增第二参断言，非弱化。
- 本轮新发现：2 条（f001 important、f002 minor）。
- 未进表的提示：① URL `loc` 读取后不清除（`workspace-view-helpers.ts:26-42`），跨面板/会话库打开都会写入，会话面板重挂载会重开上一次会话——与桌面 route_query 一次性语义存在差异，建议 code reviewer 评估是否回归；② preload `searchContent` legacy keyword 形态提取未单测（非范围：桌面 IPC 搜索路径，仅提示）。
- 总体判断：AC1-AC5 核心机制均有可信测试且实测通过；唯一未解决 important 为 e2e 以 API 替代 AC1 要求的会话表行点击，修后走下一轮。

verdict: FAIL

## Round 2 (2026-08-08 14:35 UTC+8)

### t263_test_f001 - 降级：important → minor

- 复核结论：降级为 minor（建议性、不阻断）。
- 依据（已亲自核实代码，非采信 implementer 自述）：
    1. `tests/unit/renderer/components/token-stats/session_table.test.tsx:92-107`：真实 SessionTable 组件行点击 `fireEvent.click(getByText("Alpha"))` → `onOpenSession("claude_code|win|s1")`，确认「行点击 → identity_key」接线。
    2. `tests/unit/renderer/views/token_stats_view.test.tsx:826-833`（`open_history` 即 `window.usageboard.sessionHistory.open` 的 mock，见 `:216-238`）：TokenStatsView `onOpenSession("claude_code|win|initial")` → `sessionHistory.open("claude_code","win","initial")`，确认 identity_key 拆分 → open 接线。
    3. 两端单测拼合，「会话表行点击 → identity_key 拆分 → sessionHistory.open」整条触发链路确有覆盖。原 f001 blocking 前提「该接线无覆盖」不成立——审查时只搜了 e2e 未搜单测，判定有误。
    4. `tests/e2e/web/session_panel.spec.ts:121-135` 用 `open` 直接调用，覆盖的是本 task 新增链路（open 编码 loc → URL search → 会话面板懒挂载 → initial_loc 读取 → slot 定位），经真实 SPA 路由/DOM 验证，属合理 e2e 覆盖。
    5. 真实行点击需用量面板渲染 SessionTable，依赖 `GET /v1/dashboard`；`tests/e2e/fixtures/synthetic.json` 无 dashboard fixture（已核实，p090 既有缺口），构造成本高且脆弱。
- 残余价值：仅「e2e 可进一步走真实行点击」的覆盖扩展建议，标 minor。

### t263_test_f002 - 维持 minor

- 复核：无争议，维持 minor（AC4 前序请求取消无渲染层直接断言，扩展覆盖建议）。

## 结论（Round 2）

- 前轮 finding 复核：f001 由 important 降级为 minor（接线经单测两端覆盖，e2e 聚焦新增链路，阻塞前提不成立）；f002 维持 minor。
- 改测方向复核：无。
- 本轮新发现：0 条。
- 未进表的提示：无新增（f002 与 f001 残余建议均已入表）。
- 总体判断：无未解决 critical / important；f001/f002 均为 minor 扩展建议。
- 系统性 follow-up：无。

verdict: PASS

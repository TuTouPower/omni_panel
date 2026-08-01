# Task review t182（reviewer_focus: 测试）

- task：`t182_e2e_real_refresh_assertion`
- spec：`docs/tasks/t182_e2e_real_refresh_assertion/spec.md`
- diff_anchor：`cc59e34d5090098e063217ac07e8b9a0f8d31569`
- target：`git diff cc59e34d5090098e063217ac07e8b9a0f8d31569`
- round：1
- reviewed_at：2026-08-01 16:33 UTC+8

## Findings

无（0 finding，clean review）。

## 结论

- 前轮 finding 复核：无（本轮）。
- 改测方向复核：无迁就实现的改测。diff 仅替换 `waitForTimeout(1000)`（非断言的盲睡）为一条真实信号断言，属增强而非改预期迁就实现。
- 本轮新发现：0 条。

### 危险模式扫描（逐条已查，无命中）

- 恒真断言：无。`not.toHaveClass(/spinning/, { timeout: 15_000 })` 轮询真实 DOM class，由生产 `refreshing` state 驱动（`PopupView.tsx` `handleRefreshAll` → `setRefreshing(true)` → `refreshAll().finally(() => setRefreshing(false))`，`TitleBar.tsx:45` `"icon-btn" + (refreshing ? " spinning" : "")`）。刷新挂起时 `.spinning` 持续存在 → 15s 超时失败，非 `expect(true).toBe(true)`。
- 删/反转 expect、注释断言：无。`waitForTimeout` 是 sleep 不是断言，替换不构成删断言。
- 弱化断言：不成立。旧实现无任何刷新完成断言（仅固定 1000ms 死等），新断言首次引入信号耦合断言，是增强。mock 即时刷新下 `.spinning` 窗口 < 帧（React 批量更新合并 setRefreshing），断言立即通过属信号天然消失，与上下文区已批准的 SPIKE 结论一致，且与 spec 认可的 popup_refresh_state_reset.spec.ts:56-72 模式同级；未掩盖旧测试能发现而新测试不能发现的失败。
- 删测试 / skip / only：无。scheduler.spec.ts 仅改动第 40-50 行，4 用例原样保留；popup_refresh_state_reset.spec.ts 未动。
- 静默错误：无新增 eslint-disable / @ts-ignore。
- mock 误用：无。断言作用于真实构建 SPA 的 DOM，mock 仅在系统边界（vite_mock_plugin /v1/\* 回放）；未 mock 内部类或刷新逻辑。
- 阈值掩盖：15_000 仅决定「刷新真挂起时」多快失败（>10s 默认 expect timeout 至 15s），不使坏实现通过；与 popup_refresh_state_reset.spec.ts:70 既有 15_000 一致，非掩盖。
- 条件跳过 / `.value=` 替代真实交互 / 存在即通过：无。仍走真实 `click()`；`.scroll` toBeVisible 为保留的「页面可用」副断言，非新断言的 AC 证据主体。

### AC 覆盖核对

- AC1（scheduler.spec.ts:43 不再 waitForTimeout 死等）：满足。diff 将该行替换为断言；实测 `grep waitForTimeout` 该文件 0 命中。
- AC2（替换后用例通过且真实等待刷新完成、非固定时长）：满足。断言耦合 `refreshing`→`.spinning`→`finally()` 复位链，刷新在途时真实轮询到信号消失，mock 即时完成时立即通过，无固定时长。
- AC3（既有 e2e 无新失败）：满足。worktree 实测 `MOCK_FIXTURE=synthetic pnpm test:e2e:web -- scheduler.spec.ts` 4 passed、`-- popup_refresh_state_reset.spec.ts` 3 passed，合计 7 绿；scheduler.spec.ts 复跑 2 次稳定（manual refresh 用例 ~270-280ms，断言即时通过，无固定 1000ms 延迟）。diff 未触碰共享 fixture/config，不会波及其余 spec 文件。

### 测试可信

- 断言用户可观察：是。`.spinning` 为刷新按钮上用户可感知的旋转态 class，非内部函数返回值。
- 异步时序：新断言用 Playwright 轮询 `expect`（自动重试），优于旧盲睡（旧 1000ms 固定等待本身即在慢环境与刷新完成存在 race）；`.finally()` 保证错误路径信号也复位；无漏 await。
- 生产逻辑可达：测试经真实点击 → 生产 `handleRefreshAll` → mock IPC → `finally()` 复位全链，触达被测生产实现，无平行实现冒充。

### 未进表的提示（范围外观察）

- mock 即时刷新下该断言对「刷新完全未触发」的破坏（如按钮未接线）不具判别力（此时 `.spinning` 自始至终不存在，断言立即通过）；但旧 `waitForTimeout` 同样无此判别力，已批准的同级模式 popup_refresh_state_reset.spec.ts 亦同，故不构成回归，不出 finding。若后续要验证「刷新真实发生」，需在 mock 层注入可控延迟 fixture，属扩展项非本 task 缺口。
- 系统性 follow-up：无。

verdict: PASS

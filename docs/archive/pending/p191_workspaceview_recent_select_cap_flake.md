# p191 WorkspaceView 最近会话选满 8 上限用例偶发失败

- 现象：`WorkspaceView.test.tsx:559`「recent：选择第 9 个被拒（上限 8）」偶发 `querySelectorAll('[data-testid="session-recent-check"].on')` 计数 0（期望 8）；单测重跑即过。复现统计（2026-08-16）：单文件循环 10 次 / renderer 全目录循环 5 次（1383 tests）/ 全量 `pnpm test` 循环 3 次（277 files）均 0 失败——真实偶发未复现；受控复现（`.scratch/p191/repro_recent_modal.test.tsx`）用延迟 resolve 的 getSessions 照抄用例流程，确定性复现「计数 0」失败形态。
- 影响：全量 `pnpm test` 偶红；与 t423 Card/StatusDot 改动无关（未触 workspace）。
- 根因：**测试断言时机竞态**（测试脆弱性，非产品缺陷）。`RecentSessionsModal` 挂载时 `useEffect` 异步 `tokenStats.getSessions().then(set_sessions)` 渲染列表（`MAX_PICK=8` 在 `RecentSessionsModal.tsx:15`）；用例 `await waitFor(() => screen.getByRole("dialog"))` 只保证 dialog 挂载、不保证列表渲染，随后**同步** `querySelectorAll('[data-testid="session-recent-row"]')` 读到空数组（不抛错）→ 循环 0 次点击 → `.on` 计数 0 ≠ 8。偶发来源：mock 立即 resolve，但「resolve→setState→re-render」在 act 外走 React 调度，全量并行/首跑 CPU 争抢放大窗口，`waitFor` 首轮命中 dialog 即返回；单文件跑时 act 自动 flush 掉窗口 → 重跑即过。同文件 p525（`:537` 注释）与快捷选择用例（`:350-354` 注释）已注明该竞态并用 waitFor 稳定化，p559 漏网。
- 测试缺口：p559 用 `querySelectorAll`（空数组不抛错、静默进 0 次点击路径）而非 `getByText`（空时抛 not found），失败更像偶发 flake；同文件已有两处稳定化先例未覆盖它。
- 同类位点（已确认，同一机制：异步 getSessions 列表 + 仅等 dialog 挂载后同步读/断言 DOM）：
    - `WorkspaceView.test.tsx:367-380` 会话选择弹窗用例：等 dialog 后同步 `fireEvent.click(screen.getByText("会话 s1"))`，未等 resolve（失败形态：getByText not found）
    - `WorkspaceView.test.tsx:492-523` picker 用例：等 dialog 后同步断言 `getByText("全部 3")` / `getByText("Claude 1")` / `getByText("已打开")` / `picker_titles()`（失败形态：getByText not found）
    - 已扫无：`SessionLibrary.test.tsx`（全部 waitFor 稳定化）、`SessionShell.test.tsx`（无列表断言）、picker 搜索/agent 筛选同步断言（纯前端 useMemo，无 promise 依赖，不同类）。
- 补测方向：recent/picker 弹窗用例统一「等列表元素出现再交互」，不以 dialog 出现为准——p559 改 `await waitFor(() => expect(querySelectorAll('[data-testid="session-recent-row"]')).toHaveLength(9))`（或 `findAllByTestId`）；:367 改 `await screen.findByText("会话 s1")`；:492 改 `await waitFor(() => expect(screen.getByText("全部 3")))`。
- 线索：`.scratch/p191/`（`repro_recent_modal.test.tsx` 受控复现、`vitest.p191.config.mts` 独立配置、`p191_analysis.md` 分析笔记、`repeat_{single,renderer_dir,full}.log` 循环日志）。
- 处理：t433

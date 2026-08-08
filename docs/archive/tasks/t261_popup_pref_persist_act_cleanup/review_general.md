# Task review t261（reviewer_focus: 通用）

- task：`t261_popup_pref_persist_act_cleanup`
- spec：`docs/tasks/t261_popup_pref_persist_act_cleanup/spec.md`
- diff_anchor：`e2c5156da22867c58a2f92d505dfb91a8d9d783e`
- target：`git diff e2c5156da22867c58a2f92d505dfb91a8d9d783e`
- round：1
- reviewed_at：2026-08-08 13:18 UTC+8

## Findings

### t261_gen_f001 - spec 上下文区「测试策略」shouldAdvanceTime 描述过时，实现改用 vi.stubGlobal 方案

- 严重度：minor
- 锚点：spec 上下文区「测试策略」（与 AC4 相关）
- 位置：`docs/tasks/t261_popup_pref_persist_act_cleanup/spec.md` 上下文区「测试策略」；实现见 `tests/unit/renderer/views/popup_view_t250.test.tsx:73`（`vi.stubGlobal("jest", vi)`）
- 问题：spec 上下文区「测试策略」写「RTL `waitFor` 需配置 `shouldAdvanceTime`」，但本仓 `@testing-library/dom@10.4.1` 的 waitFor 无该选项，其 fake-timers 分支直接调用全局 `jest.advanceTimersByTime`（`node_modules/@testing-library/dom/dist/wait-for.js`）。实现采用 `vi.stubGlobal("jest", vi)` 使 RTL 走 fake-timers 轮询分支，行为正确。属「实现合理但与 spec 描述不符（spec 过时）」。
- 建议：处置为改 spec，将上下文区「测试策略」的机制描述更新为实际方案（10.4.1 无 `shouldAdvanceTime`，以 `vi.stubGlobal("jest", vi)` 替代）；不计 FAIL。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：1 条
- 未进表的提示：
    - `pnpm typecheck` 报 `src/main/core/local-api/server.ts:323-325` 3 处 TS4111；该文件不在本 diff，锚点 commit（t259 遗留）已存在，与本 task 无关。
    - 批量跑 popup_view 8 文件出现 2 条 act 警告，定位在 `popup_view_height.test.tsx`（本 diff 未改该文件）；在锚点基线 worktree 复跑同文件同样 2 条，确认非本 diff 引入。
    - AC1「重开后保持所选值」未显式模拟重开，但恢复路径与既有 t222 用例（`popup_view_config.test.tsx:560` 恢复 1 天）及新用例 2（恢复 7 天）同机制，覆盖充分。
- 总体判断：4 条 AC 全部实现且有对应测试，实测 19 个用例通过；t250 单文件 act 警告 0；仅 1 条 spec 上下文过时 minor（改 spec 处置）。实现正确性经逐场景推演（无键首切 / 值相等首切 / 有键恢复 / 外部回显不误写 / 双击合并 / f001 闪回）无缺陷。
- 系统性 follow-up：无

verdict: PASS

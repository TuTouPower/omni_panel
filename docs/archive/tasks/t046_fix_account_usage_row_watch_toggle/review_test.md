# Task review t046（reviewer_focus: 测试）

- task：`t046_fix_account_usage_row_watch_toggle`
- spec：`docs\tasks\t046_fix_account_usage_row_watch_toggle/spec.md`
- diff_anchor：`be9f98d89d3949279b49bf8f8281a5f75890a143`
- target：`git diff be9f98d89d3949279b49bf8f8281a5f75890a143`
- round：1
- reviewed_at：2026-07-22 21:10 UTC+8

## Findings

无。

## 结论

- 本轮新发现：0 条
- 测试可信：`tests/unit/renderer/components/usage_rows.test.tsx:160-236` 新增 `AccountUsageRow upcoming-reset watch toggle (t046)` describe 共 4 条 it。用 `render` 渲染真实组件、`userEvent.setup().click()` 触发真实点击、`getAllByRole` / `querySelectorAll(".bar-watch")` / `getAttribute("aria-pressed")` 验证 DOM，未 import 内部函数凑数；未 mock 被测模块，`vi.fn()` 仅用于 props 边界回调——合法。
- AC 覆盖：
    - AC4「AccountUsageRow 单测：传 on_toggle_watched + watched_labels 时渲染 bell，点击触发回调」→ 4 条 it 直接对应（渲染数量、缺失不渲染、aria-pressed 状态、点击回传 `raw_label="glm-4-air"`）。
    - AC1「主面板 provider 卡片 account 详情 bell」、AC3「account 维度对齐 raw_label」→ `AccountUsageRow` 是该链路渲染端，已验证；spec 范围声明「不改 UsageBarList/ProviderAccountRow/ProviderAccountList 链（已正确）」，`UsageBarRow` 的 bell 视觉/`opacity:0.35` 已由 t043 测试覆盖（`usage_rows.test.tsx:118-158`），t046 无需重复。
    - AC2「持久化 + 刷新后保留」→ 持久化机制（`add/remove_watched_metric + save`）由 t043 的 `use_watched_metric_toggler.test.ts` 覆盖，t046 沿用相同机制；AccountUsageRow 层只验证回调透传，符合 spec AC4 明确接受的最小测试边界。
    - AC5「pnpm test 全绿」→ 验证 `Test Files 149 passed (149), Tests 1506 passed (1506)`。
- 危险模式扫描：
    - `usage_rows.test.tsx:229-233` 存在 `expect(second).toBeInTheDocument()` + `if (second) { await user.click(second) }`。看似「条件跳过点击」，但前置 `getAllByRole` 已 `toHaveLength(2)`，`bells[1]` 必然存在；且 `if` 内是 `click` 不是 `expect`，若 `second` 不存在则后续 `expect(on_toggle_watched).toHaveBeenCalledWith("glm-4-air")` 会 FAIL（回调未被调用）。非「前置不满足时无证据仍 PASS」，不构成危险模式。属冗余防御代码，不进 finding 表。
    - `usage_rows.test.tsx:211-214` 三条断言组合（`toContain("true")` + `toContain("false")` + `filter(...).toHaveLength(1)`），前两条看似弱化，但第三条精确限定只有一个 true，组合后等价于严格断言「一个 true 一个 false」，非弱化。
- 覆盖提示（不进 finding 表）：`ProviderCard.tsx:335-342` 新增的 `watchedMetrics?.[provider]?.[account.id]` → `watched_labels` 映射与 `on_toggle_watched` 的 wrap（包装成 `{provider, accountKey: account.id, raw_label}`）无单测；若维度字段误用（如 `accountLabel` 代替 `account.id`）或 wrap 丢参，AccountUsageRow 单测无法捕获。spec AC4 明确接受 AccountUsageRow 单测作为验证点，此缺口属 spec 授权的测试边界外，建议未来可选补 ProviderCard 集成测以增强 AC1/AC3 链路信心。
- 总体判断：测试自身体量小但质量合格，断言对齐用户可观察行为，满足 spec AC4 明确要求，无危险模式命中。

verdict: PASS

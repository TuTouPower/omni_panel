# Task review t041（reviewer_focus: 测试）

- task：`t041_upcoming_reset_threshold`
- spec：`docs\tasks\t041_upcoming_reset_threshold\spec.md`
- diff_anchor：`d38f3fb`
- target：`git diff d38f3fb`
- round：1
- reviewed_at：2026-07-22 16:50 UTC+8

## Findings

### t041_test_f001 - 账号按钮缺组件层测试（AccountRow bell 按钮）

- 严重度：important
- 位置：`tests/unit/renderer/components/provider_account_row.test.tsx`（无 t041 新增）、`tests/unit/renderer/components/cpa_card.test.tsx`（无 t041 新增）
- 问题：spec AC「账号设置『数据标签映射』旁有自画 icon 按钮，tooltip『是否监控即将重置』，点击 toggle 持久化」与「账号按钮/常规输入组件测」要求按钮在组件层被测。实现侧 `AccountRow.tsx` 新增 `on_toggle_upcoming` / `upcoming_reset_off` props 与一个 bell `<button>`（`aria-label="是否监控即将重置"`、`aria-pressed={!upcoming_reset_off}`、`onClick={on_toggle_upcoming}`），`CpaCard.tsx` / `VendorCard.tsx` 新增同名透传 props。但三个相关组件测试文件均未添加任何断言：
    - 无测试断言 bell 按钮在 `on_toggle_upcoming` 提供时渲染、未提供时不渲染；
    - 无测试断言 `aria-label="是否监控即将重置"` / `aria-pressed` 随 `upcoming_reset_off` 切换；
    - 无测试断言点击按钮调用回调（并在上游 SettingsView 的 `toggle_upcoming_reset` 中触发 `save_config`）。
- 建议：在 `provider_account_row.test.tsx` 中渲染 `<AccountRow on_toggle_upcoming={spy} upcoming_reset_off={false} />`，断言按钮存在且 `aria-pressed="false"`；再渲染 `upcoming_reset_off={true}` 断言 `aria-pressed="true"`；点击按钮断言 spy 被调用。CpaCard/VendorCard 的透传可用一条断言验证。

### t041_test_f002 - 常规设置阈值输入缺组件测试（SettingsView threshold input）

- 严重度：important
- 位置：`tests/unit/renderer/views/settings_view.test.tsx`（无 t041 新增）
- 问题：spec AC「常规设置有阈值输入，留空存 null、填数存 number，持久化」与「账号按钮/常规输入组件测」要求该 input 在组件层被测。实现侧 `SettingsView.tsx` 新增「即将重置提醒阈值」`<input type="number" min={0} max={100}>`，onChange 逻辑：空串 → `save_config({ ...config, upcomingResetThresholdPercent: null })`；`0..100` 整数 → `save_config({ ...config, upcomingResetThresholdPercent: num })`；越界或 NaN → 不保存。`settings_view.test.tsx` 没有为该 input 增加任何断言（`grep threshold|upcoming|即将` 零命中）。配置 schema 单测覆盖了「解析」而非「input → save_config 行为」。
- 建议：在 `settings_view.test.tsx` 中渲染 `<SettingsView/>`：(a) 初始 `upcomingResetThresholdPercent: null` → input 的 value 为空；(b) 模拟 change 到 "15" → 断言 `save_config` 被以 `upcomingResetThresholdPercent: 15` 调用；(c) 模拟 change 到 "" → 断言以 `null` 调用；(d) "150" / "abc" → 断言 `save_config` 未被调用。

### t041_test_f003 - PopupView「threshold null → 面板不渲染」AC 未直接测试

- 严重度：important
- 位置：`tests/unit/renderer/views/popup_view.test.tsx`（无 t041 新增；仅向两条既有测试注入 `upcomingResetThresholdPercent: 100` 维持渲染）
- 问题：spec AC「阈值 null → 面板不渲染」与「无符合账号 → 面板不渲染」是 PopupView 渲染层不变量。实现侧 `PopupView.tsx` 包裹 `UpcomingResetBanner` / `UpcomingResetRail` 于 `upcoming_reset_threshold_percent !== null && !== undefined` 条件下。`collect_upcoming_resets` 单测覆盖了「null → []」过滤层；但 PopupView 条件渲染本身（`null` 时不挂载 Banner/Rail）未被任何测试断言。本次 diff 只向既有用例补 threshold=100 让 Banner 继续可见，未新增「threshold null → 不渲染」断言。若条件渲染被回归破坏（例如 threshold=null 仍渲染空态 Banner），无测试捕获。
- 建议：新增一条用例：渲染 `<PopupView/>` 时 config mock 返回 `upcomingResetThresholdPercent: null`，断言 `UpcomingResetBanner` / `UpcomingResetRail` 容器不在 DOM（例如 `queryByText(/即将重置/)` 为 null 或对应 testid 不存在）。

## 结论

- 前轮 finding 复核：Round 1，无前轮。
- 本轮新发现：3 条（均 important，均为 AC 覆盖缺口，非危险模式）。
- 总体判断：t041 改动的测试在所覆盖范围内（config schema 解析、`collect_upcoming_resets` 过滤逻辑、`add/remove_account_override`、popup 既有渲染不回归）断言正确、边界齐全、未触发任何危险模式（无恒真/弱化/`.skip`/mock 误用）；threshold 直接用 `cycleDurationMs` 算剩余% 是 spec 周期算法的显式简化，不计缺陷。但 spec 点名的「账号按钮/常规输入组件测」两条 AC 在组件层完全缺测，外加「threshold null → 面板不渲染」这条 PopupView 层 AC 仅被过滤层间接覆盖、条件渲染本身无断言，三处合并使本 task 在 adoption 前不可信。

verdict: FAIL

## Round 2 (2026-07-22 04:30 UTC+8)

### 前轮 finding 复核

- **t041_test_f001（已修）**：新建 `tests/unit/renderer/components/account_row.test.tsx` 四条用例覆盖 `on_toggle_upcoming` 提供时按钮存在、未提供时不渲染、`upcoming_reset_off=true` → `aria-pressed="false"`、点击触发回调；`aria-pressed`/`title`/`aria-label` 三属性均被精确断言（与 `AccountRow.tsx:104-106` 实现一致）。另新建 `vendor_card.test.tsx` 两条断言透传 `instance_id` + `can_toggle_upcoming=false` 隐藏 bell；`cpa_card.test.tsx` 新增一条断言透传 `{provider, account_id}`。三层透传链（AccountRow → VendorCard/CpaCard）均有组件层断言，非恒真。
- **t041_test_f002（已修）**：`settings_view.test.tsx` 新增 describe 含 4 条用例，分别覆盖初始 null → input 显示空、`"15"` → `save` 以 `15` 调用、`""` → `save` 以 `null` 调用、`"150"` → `save` 未以 `150` 调用；与 `SettingsView.tsx:1330-1353` 实现的空串/整数 0-100/越界三分支对应。断言精确（`objectContaining` + 数值/null），非恒真。
- **t041_test_f003（已修）**：`popup_view.test.tsx` 新增 `threshold null → UpcomingResetBanner/Rail not rendered` 用例，mock `upcomingResetThresholdPercent: null` + 未来 resetAt 账号，断言 `.upcoming-banner`、`.upcoming-rail` 节点数均为 0 且 `queryByText(/即将重置/)` 为 null。三条独立断言直接覆盖 PopupView 条件渲染本身，非仅过滤层间接覆盖。

### 本轮新发现

本轮新发现：0 条。

危险模式扫描结果（均无命中）：

- 恒真/弱化/注释 expect/`.skip`/`.only`/`@ts-ignore`：无。
- `upcoming_resets.test.ts` 删除旧 it 块：因 `collect_upcoming_resets` API 由 `(groups, horizon, now)` 改为 `(groups, options)`，旧 it 被新 describe（threshold gate + filtering）等价替代，且补了 `cycleDurationMs` 字段与 cycle-edge case；合法删除。
- mock 边界：`popup_view.test.tsx`/`settings_view.test.tsx` 仅 mock `window.usageboard.config.get` / `save` 等系统边界，未 mock 被测组件内部逻辑。
- `cpa_card.test.tsx` 用 `document.querySelector + if (!bell) throw` 是显式失败而非静默通过。
- `settings_view.test.tsx` "150" case 未 `await waitFor`：实现 onChange 同步过滤越界值（`SettingsView.tsx:1346-1351`），save 不进异步队列，同步断言成立；其他三个 case 均 `await waitFor`。无 race。
- 既有两条 popup 测试注入 `threshold=100` 维持 Banner 可见，是维持原测试语义的最小改动，非掩盖。

### 总体判断

f001-f003 三条 finding 均已修复，断言精确、覆盖 AC，未引入新危险模式。

verdict: PASS

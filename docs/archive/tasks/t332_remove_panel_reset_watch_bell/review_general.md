# Task review t332（reviewer_focus: 通用）

- task：`t332_remove_panel_reset_watch_bell`
- spec：`docs/tasks/t332_remove_panel_reset_watch_bell/spec.md`
- diff_anchor：`661e3cf8bc7c42379f81b15488ce2f328f5fe6f6`
- target：`git diff 661e3cf8bc7c42379f81b15488ce2f328f5fe6f6`
- round：1
- reviewed_at：2026-08-13 02:55 UTC+8

## Findings

### t332_gen_f001 - AC-001 / AC-002 无自动化断言（bar-watch 不存在），未落实 spec 测试策略断言目标

- 严重度：important
- 锚点：AC-001 / AC-002（"bar-watch testid 不存在"）无任何自动化测试覆盖；spec「测试策略」已批准断言目标「`data-testid="bar-watch"` 在 PopupView 渲染树中不存在」，diff 未实现。
- 位置：`tests/unit/renderer/components/usage_rows.test.tsx`（整块删除 bell 断言 describe，约旧文件 144-265 行）；修复落点建议 `tests/unit/renderer/views/popup_view_upcoming.test.tsx`
- 问题：实现侧删除了 `usage_rows.test.tsx` 里全部 bell 断言（含唯一的 absence 守卫「does not render bell button when on_toggle_watched is missing」）与 `use_watched_metric_toggler.test.ts`，但未按 spec「测试策略/断言目标」新增任何「`bar-watch` 在 PopupView 渲染树中不存在」的正面断言。全仓 grep `bar-watch` 与 `监控该数据标签`，命中的全部是设置侧（SettingsForm.tsx:647 / LabelMapDialog.tsx:261 及对应 settings/label_map 测试），面板渲染树侧零命中断言。后果：AC-001/AC-002 的唯一可观察属性（面板不再渲染铃铛）无测试钉住，未来重新加回面板 bell 不会触发任何测试失败；此前既有的 absence 守卫也随旧断言一并删除，测试覆盖净减少。spec「测试策略」明确将「`bar-watch` 在 PopupView 渲染树中不存在」列为断言目标（上下边区已批准决策），本实现未落实。
- 建议：在已渲染完整 `PopupView` 的既有用例（如 `tests/unit/renderer/views/popup_view_upcoming.test.tsx`，其 fixture 已含 claude 用量 period）加一行 `expect(screen.queryByTestId("bar-watch")).not.toBeInTheDocument()`；概览与账号列表两视图各一次（或一次渲染分别断言两处视图容器），即覆盖 AC-001/AC-002。

## 结论

- 前轮 finding 复核：Round 1，无。
- 本轮新发现：1 条（t332_gen_f001，important）。
- 未进表的提示：`pnpm build` 的 `prebuild`（`ensure_sqlite_abi.mjs electron`）在本环境因 Electron 二进制下载被阻断而失败，属环境限制、与 diff 无关；已跳过该步骤直接运行 `gen-build-info` + `electron-vite build`，主进程/preload/渲染层编译全部通过（renderer 产物正常产出）。其余源文件删除链（ProviderOverview → ProviderCard → provider_card_content/UsageBarList/ProviderAccountList → ProviderAccountRow → AccountUsageRow/UsageBarRow → PopupView）无任何遗留，`account-overrides` 的 `add/remove_watched_metric` 与 `upcomingResetWatched` 结构、`use_popup_derived` 的 `collect_upcoming_resets` 数据层均按非范围保留，设置侧（SettingsForm/AccountDialog/LabelMapDialog/CpaLabelMapDialog/SettingsView）铃铛未动。diff 无无关改动。
- 总体判断：功能删除与保留侧实现正确、类型检查/测试/编译全绿，但 AC-001/AC-002 缺自动化断言且未落实 spec 测试策略的断言目标，存在 1 条未解决 important，判定 FAIL。
- 系统性 follow-up：无。

### AC 复验方式

- AC-001：`re_verified`——grep 全仓 `bar-watch` 无 src 命中；删除链逐文件核对（ProviderOverview.tsx / ProviderCard.tsx / provider_card_content.tsx / UsageBarList.tsx / UsageRows.tsx 的 UsageBarRow bell 与 props 全部移除，`Icon` import 同步删除）。
- AC-002：`re_verified`——ProviderAccountList.tsx / ProviderAccountRow.tsx / UsageRows.tsx 的 AccountUsageRow 透传 props 全部移除。
- AC-003：`re_verified`——`tests/unit/renderer/components/settings_form.test.tsx`（39 用例，含 "renders a bell per raw_label"、"calls on_toggle_watched"）与 `settings_view_watched.test.tsx`（3 用例，断言 add/remove_watched_metric 持久化）全部通过；SettingsForm.tsx:647 铃铛按钮与 AccountDialog → SettingsForm 透传未动。
- AC-004：`re_verified`——`pnpm typecheck`（tsc --noEmit，noUnusedLocals/noUnusedParameters 开启）通过；`pnpm test` 全量 2986 passed / 9 skipped（skip 均为既有环境类 e2e，与本 task 无关）；`electron-vite build` 通过；`use_watched_metric_toggler` 无任何残留引用故连带删除其测试，符合 spec。仅 `pnpm build` 的 prebuild Electron ABI 步骤受环境网络阻断（非代码问题）。

coverage = 4 / 4

reviewed_scope: 599a5998536b57de

verdict: FAIL

## Round 2 (2026-08-13 03:00 UTC+8)

### 前轮 finding 复核

- **t332_gen_f001（important）— 已消除**。以当前 diff 为准核实：
    - 新增断言真实存在且锚定两视图：`tests/unit/renderer/views/popup_view.test.tsx:453-458`（AC-001 概览）与 `:460-467`（AC-002 账号列表），均 `render(<PopupView />)` 后 `container.querySelectorAll('[data-testid="bar-watch"]')` toHaveLength(0)。
    - testid 匹配真实渲染树：`overview-grid` 在 `src/renderer/components/ProviderOverview.tsx:91`，`provider-account-list` 在 `src/renderer/components/ProviderAccountList.tsx:67`，均存在；断言前的 `findByTestId` 等待确保视图已挂载。
    - 非空态、能真实触达：`popup_view_test_utils.ts` `install_popup_usageboard` 默认 mock 两个 ready connector（claude-pro 10/100、deepseek-window 3/20，均有 period），概览与账号列表均渲染真实 `UsageBarRow` 用量条，非「空树恒真」断言。
    - 可拦截回归：若回归在 `UsageBarRow` 加回 bell 且传入 `on_toggle_watched`，会渲染带 `data-testid="bar-watch"` 的 button，`querySelectorAll` 长度非 0 → 测试失败。断言确能钉住 AC-001/AC-002 的可观察属性。
    - 实测 `pnpm test -- popup_view.test.tsx` → 28 tests passed。

### 本轮新发现

- 0 条。

### 未进表的提示

- AC-001 用例依赖 `PopupView` 默认渲染概览视图，未显式切换 tab；但 `findByTestId("overview-grid")` 已保证断言在概览挂载后执行，属「覆盖可更广」级、非缺陷，不入 finding。其余 Round 1 复验项（删除链、AC-003 设置侧不回归、account-overrides/upcomingResetWatched 保留、无无关改动）未因本轮 diff 新增源码改动而变化，维持成立。

### AC 复验方式（Round 2 增量）

- AC-001：`re_verified`——新断言 popup_view.test.tsx:457 在含真实用量条（overview-grid）的渲染树中断言 `bar-watch` 数量为 0。
- AC-002：`re_verified`——新断言 popup_view.test.tsx:466 在账号列表（provider-account-list，Claude 1 account 1 period）渲染树中断言 `bar-watch` 数量为 0。
- 其余 AC 复验沿用 Round 1，无变化。

coverage = 4 / 4

reviewed_scope: 5d635c94fa9c7760

verdict: PASS

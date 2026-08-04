# Task review t203（reviewer_focus: 代码）

- task：`t203_e2e_account_form_baseline`
- spec：`docs/tasks/t203_e2e_account_form_baseline/spec.md`
- diff_anchor：`b1b89b9614ae25646973cd2e290ed12b1b3c8ae3`
- target：`git diff b1b89b9614ae25646973cd2e290ed12b1b3c8ae3`
- round：1
- reviewed_at：2026-08-04 16:15 UTC+8

## Findings

### t203_code_f001 - settings_view label map 测试名声称 "saves" 但无保存动作

- 严重度：minor
- 锚点：spec 依赖约束「修复不降低既有测试断言强度」方向上的覆盖降级；测试行为未验证保存路径
- 位置：`tests/e2e/electron/settings_view.spec.ts:37`
- 问题：测试名 "per-provider label map dialog opens and saves from CPA settings" 声称验证「打开并保存」，但测试体只打开 LabelMapDialog、断言标题与空态文案（"该服务暂无可映射的数据标签"）、点「关闭」并断言隐藏，全程无任何保存动作。旧测试（被删除的 "usage label map can be edited and saved"）实际验证了标签映射编辑后的持久化（`toHaveValue("glm-long=GLM Short")`）。重写后标签映射的保存/持久化路径在 e2e 层不再被覆盖。
- 建议：测试名去掉 "saves"（如 "per-provider label map dialog opens with empty state from CPA settings"）；若环境可行（mock 或预置 CPA snapshot 数据）补一条保存后重启再读回断言的用例。

### t203_code_f002 - 触碰的测试文件中残留过时注释

- 严重度：minor
- 锚点：注释与当前实现不符，误导后续维护者
- 位置：
    - `tests/e2e/electron/settings_view.spec.ts:8-9`
    - `tests/e2e/electron/auto_seed.spec.ts:100`
- 问题：
    - `settings_view.spec.ts` 头部注释仍称依赖 `.acct-row` DOM（渲染层已改为 `.acc-row`/`.acc-card`）并列举「appearance 用量标签映射字段」，该全局字段已于 24ae7d78 删除、改为连接设置内的 per-provider 对话框。
    - `auto_seed.spec.ts:100` 注释「Total plugin count should be >= 7 (1 existing + 6 auto-seeded)」已过时：`discover_connector_definitions` 现发现 `connectors/` 下 16 个连接器并全部 auto-seed，`count >= BUNDLED_PLUGIN_NAMES.length`（7）被平凡满足，注释表述与实际种子数量不符。
- 建议：同步更新两处注释为当前行为描述。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：本轮为首轮，无前轮。
- 本轮新发现：2 条（均 minor）。
- 未进表的提示：
    - 文件过大：无。审查范围内文件均远低于阈值（`CollapsibleCard.tsx` 74 行、`ProviderCard.tsx` 331 行；`collapsible_card.test.tsx` 132 行、`provider_card_states.test.tsx`、各 e2e spec 均 <600 行）。
    - 复杂度：无。新增分支最复杂处为 `openAccountForm`（~25 行、一层 if），未达阈值。
    - 范围外观察（不进 finding 表）：
        1. 本次为 ProviderCard 建立的 `collapsible` prop 模式，`UpcomingResetCard.tsx:76`（`onToggle={onToggleExpand ?? (() => undefined)}`）、`ProviderAccountRow.tsx:203-209`（`can_collapse` 为 false 时仍渲染死箭头）、`PopupView.tsx:764-780`（token 面板非 live 时 `onToggle` 为 no-op）仍存在同款「aria-expanded=true 的空操作死按钮」问题。均在 diff 范围外，非本 task 引入，未造成当前 e2e 失败（live popup 中 UpcomingResetCard 的 onToggleExpand 恒有值）。
        2. `tests/e2e/electron/plugin_config.spec.ts:65` "settings form can be filled and saved" 的 `[role="dialog"]` toBeHidden 断言对 CPA 内联表单而言恒真（CPA 详情从不弹 dialog），未验证保存实际完成；该断言为 pre-existing、本次未改动。CPA 持久化测试（同文件 98-101 行）已改为等详情视图关闭 + `.acc-card` 复现，方向正确。
        3. `auto_seed.spec.ts` 的 `BUNDLED_PLUGIN_NAMES`（7 条历史名）已与 `connectors/` 实际 16 个连接器脱节；断言用 `>=` 仍通过，语义上只验证「种子未清空既有配置」，靠前面的 `.acc-row` "My Claude" 可见性断言兜底。
- 总体判断：生产修复（CollapsibleCard `collapsible` prop + ProviderCard 传 `can_collapse`）最小且正确，默认 `true` 保持其余调用方（ProviderAccountRow / UpcomingResetCard / token 面板）行为不变；测试选择器统一到 `.acc-row`/`.acc-card`、CPA 内联分支先判 `ds-row` 再点击、fixture 补 instanceId/displayName 与有效 executablePath、tray 测试改 enableTray + 轮询，均与渲染层与启动条件吻合。无未解决 critical / important，仅 2 条 minor。
- 系统性 follow-up：建议新建 task 把 `collapsible` prop 模式扩展到 `UpcomingResetCard` / `ProviderAccountRow` / PopupView token 面板，消除同类死箭头（aria-expanded=true 空操作）。建议标题：dead collapse chevron 复用 collapsible prop；slug：`collapse_chevron_siblings`。

verdict: PASS

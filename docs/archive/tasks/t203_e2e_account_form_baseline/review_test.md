# Task review t203（reviewer_focus: 测试）

- task：`t203_e2e_account_form_baseline`
- spec：`docs/tasks/t203_e2e_account_form_baseline/spec.md`
- diff_anchor：`b1b89b9614ae25646973cd2e290ed12b1b3c8ae3`
- target：`git diff b1b89b9614ae25646973cd2e290ed12b1b3c8ae3`
- round：1
- reviewed_at：2026-08-04 10:30 UTC+8

## Findings

### t203_test_f001 - plugin_config「settings form can be filled and saved」保存断言对 CPA 内联表单为空断言

- 严重度：minor
- 锚点：行为缺陷——测试通过但未验证保存完成
- 位置：`tests/e2e/electron/plugin_config.spec.ts:65`（`expect(sPage.locator('[role="dialog"]')).toBeHidden()`）
- 问题：`openAccountForm(sPage, "CPA")`（本次 diff 重写）对 CPA 返回内联表单 `data-testid="cpa-connector-settings"`（`CpaConnectorSettings.tsx:258`，`<form className="cpa-detail" ...>`，非 `role="dialog"`）。因此 `[role="dialog"]` 恒不存在，`toBeHidden()` 恒真，点击 submit 后即使保存未完成、内联表单仍在，该断言也通过。此断言为存量写法（本 diff 未改该行），但本 diff 的 helper 重写使该测试恢复绿，测试的可信度依赖此断言成立。同文件 persist 测试已用正确可观测（等待 `cpa-connector-settings` 隐藏 + `.acc-card` 可见）证明保存落盘（`plugin_config.spec.ts:98-101`）。
- 建议：该测试改为断言 `cpa-connector-settings` 隐藏（带 timeout），与 persist 测试一致；或并入 persist 测试，避免重复的弱断言路径。

### t203_test_f002 - settings_view label map 测试名声称「saves」但未执行保存

- 严重度：minor
- 锚点：行为缺陷——测试名与断言内容不符
- 位置：`tests/e2e/electron/settings_view.spec.ts:37`（`test("per-provider label map dialog opens and saves from CPA settings", ...)`）
- 问题：该测试仅打开 LabelMapDialog、断言空态文案「该服务暂无可映射的数据标签」、点关闭并断言隐藏，没有任何编辑或保存动作，也未断言任何持久化效果。测试名中的「saves」与实际断言不符，易误导后续维护者以为 e2e 覆盖了标签映射保存路径。
- 说明：保存/编辑路径另有覆盖——`cpa_label_map_watch.spec.ts`（e2e，seeded snapshot + `expect.poll` 直读 config.json 断言持久化）与 `label_map_dialog.test.tsx` 单测（断言 `on_save` 调用、重置、铃铛切换等）。本 e2e 降级为空态渲染检查不构成覆盖丢失，且旧测试所依赖的全局外观字段已在 24ae7d78 移除（spec 漂移，非迁就实现）。
- 建议：测试名改为「renders empty label-map dialog from CPA settings」或补一个真实保存断言；不阻断。

### t203_test_f003 - ProviderCard 不可折叠单测的触发分支与 popup 真实触发条件不一致

- 严重度：minor
- 锚点：覆盖可更广——真实回归触发分支未在单测层锁定
- 位置：`tests/unit/renderer/components/provider_card_states.test.tsx:137-144`
- 问题：新单测「non-collapsible card renders no collapse chevron」渲染 ProviderCard 时**不传** `onToggleExpand`，使 `can_collapse=false` 走的是「无折叠回调」分支。而 e2e 真实失败场景中，PopupView 在 live 模式下恒传 `onToggleExpandProvider`（`PopupView.tsx:683-685`），死箭头来自「有回调但无账号/无失败数据」分支（`can_collapse = onToggleExpand !== undefined && (hasAccounts || isFailed) && !(isFailed && is_auth)`）。该单测在修复前会失败（`connectorError` 使 `collapse_children` 非空、`has_details=true`、旧代码渲染 `aria-label="折叠"` 箭头），作为组件层回归测试有效；真实触发分支由 e2e `popup_window_constraints.spec.ts:36-47`（本次未改但已恢复绿）端到端覆盖，因此不阻断。
- 建议：补一条 `onToggleExpand={vi.fn()}` + `makeGroup({ accounts: [], accountCount: 0, periods: [] })`（无 connectorError）的用例，在单测层钉住 popup 的真实回归分支。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无（首轮）
- 改测方向复核：无「迁就实现」改测。全部改测均有归因且方向正确：
    - 选择器同步（`.acct-row`/`.acct-group`/`.ao-item` → `.acc-row`/`.acc-card`/`.ds-row`）：渲染层 b8abaaea 重构（2026-06-14）为既定设计，同期 add_account.spec.ts 已更新，其余测试属历史欠同步——修测试与既定实现对齐，合法。
    - settings_view label map 重写：全局字段 24ae7d78 已删，功能迁至连接设置内 per-provider 对话框——spec 漂移驱动的测试更新，合法；保存路径由 `cpa_label_map_watch` e2e 与单测承接，覆盖未丢。
    - auto_seed fixture（executablePath 指向已删 `resources/plugins/` 路径、补 instanceId/displayName）：fixture 缺陷，非产品缺陷；`is_plugin_healthy` 需 executablePath 下存在含合法 provider 的 manifest.json（`config-store.ts:158-168`），新路径 `connectors/claude` 已验证含 manifest。
    - tray quit：默认 fixture 不开 tray（`E2E_WITH_TRAY` 门控，`main/index.ts:713`），enableTray 修正 fixture，合法。
    - 唯一生产修复（CollapsibleCard `collapsible` prop + ProviderCard 传 `collapsible={can_collapse}`）由用户确认，TDD 单测前置，合法。
- 本轮新发现：3 条（均 minor）
- 未进表的提示：
    - 全部 11 失败中 1 个为真实生产缺陷（死折叠箭头），其余 10 个为测试选择器/fixture 漂移；AC1 复现证据在 task.md，AC2-AC4 由全量 e2e 35 passed / 4 skipped / 0 failed + 单测 786 passed 覆盖。
    - `tray_menu_actions` 整文件启用 enableTray（4 个测试均受影响），非 quit 测试原本不需要 tray；属环境放宽，无正确性风险，可后续考虑按测试隔离 enableTray。
    - `plugin_config` persist 测试新增「等待保存落盘再重启」是本次 diff 中最有价值的异步时序修复，方向正确。
    - 危险模式扫描无命中：无 `.skip`/`.only`/`@ts-ignore`/eslint-disable、无注释掉断言、无删除 expect、无削弱断言（settings_view label map 测试的「削弱」由 spec 漂移正当化）。
- 总体判断：生产修复有单测 + e2e 双重回归覆盖，改测全部归因正当，无未解决 critical / important；3 条 minor 供采纳处置。

- 系统性 follow-up：无

verdict: PASS

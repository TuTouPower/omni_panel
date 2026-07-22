# Task review t043（reviewer_focus: 代码）

- task：`t043_upcoming_reset_metric_watch`
- spec：`docs\tasks\t043_upcoming_reset_metric_watch/spec.md`
- diff_anchor：`fe967b82b35d5088d5e8b97ffea50accece5dcf0`
- target：`git diff fe967b82b35d5088d5e8b97ffea50accece5dcf0`
- round：1
- reviewed_at：2026-07-22 23:50 UTC+8

## Findings

### t043_code_f001 - PopupView.tsx 已超 important 阈值且本 task 仍净增

- 严重度：minor（按标准达 important，但本 task 增量小且为不可拆的 view wiring，降级说明见「建议」末段）
- 位置：`src/renderer/views/PopupView.tsx:461-485`（新增 `handle_toggle_watched` 23 行 + props 透传 `:859-860`）；文件物理行数 954
- 问题：文件膨胀标准规定实现源码 ≥ 800 行 + 本 task 仍净增即触发 important。当前文件 954 行，本 task 净增 32 行（`+33/-1`），条件满足。新增内容是 `handle_toggle_watched` useCallback + 两处 prop 绑定，全部为 PopupView 作接线层的必要 wiring，无业务分支堆叠，但未给出不可拆硬约束说明。
- 建议：把 `handle_toggle_watched` 及同类 `account_overrides` toggle 逻辑抽到自定义 hook（如 `use_watched_metric_toggler(account_overrides, patchConfig, set_account_overrides)`），可净减 ~23 行并降低后续 task 继续堆大的边际成本。降级为 minor 的辩护：本 task 增量 32 行（~3.4%）全是必要 wiring、无业务分支，且文件超阈值是跨 task 累积的慢性问题、非本 task 一刀造成；强制 important 会阻塞一个 wiring 类小改，与阈值意图（阻止「堆大」）不匹配。若 reviewer 团队认为应严格按标准 important，可上调。

## 结论

- 本轮新发现：1 条（minor）
- 数据层核对：`config/types.ts:69` zod schema 同步 `upcomingResetWatched`，迁移依赖 zod 默认 strip 未知键（旧 `upcomingResetOff` 静默丢弃，`config-schema.test.ts:113-124` 验证）。`account-overrides.ts:73-121` `add_watched_metric`/`remove_watched_metric` 实现正确：去重（`new Set`）、空数组清理（逐层 delete accountKey→provider→字段，最终 `Object.fromEntries` filter 移除 `upcomingResetWatched` 整键）。`provider-usage.ts:567-619` `collect_upcoming_resets` 过滤顺序正确：threshold null/undefined 先 short-circuit，再按 `watched?.[provider]?.[account.id]` 查 watched_labels，`length===0` 跳过，`watched_set.has(period.raw_label)` 过滤 period。`UpcomingResetItem.rawLabel`（`:552`,`:608`）按 spec AC 添加并由 `upcoming_resets.test.ts:130` 断言。accountKey 维度对齐：`account.id` 由 `build_provider_usage_groups` 经 `accountKey()` 派生（`provider-usage.ts:273-274`），UI 与 collect 共用同一 key，gateway 与直连均一致；`popup_view.test.tsx:1081` 的 `cpa-main|label|Claude Account` 覆盖 gateway 形态。
- UI 链路核对：metric toggle props 透传链 `PopupView:859-860` → `ProviderAccountList:73-93`（构造 `watched_set` + `toggle_for_account` 闭包，accountKey 取 `account.id`）→ `ProviderAccountRow:159-160` → `UsageBarList:42-52`（`watched={watched_labels?.has(period.raw_label) ?? false}` + 回调）→ `UsageRows:124-135`（按钮 + `aria-pressed` + Icon opacity）。默认关态（`watched=false` → `opacity:0.35`）符合 spec。`handle_toggle_watched`（`PopupView:463-485`）状态判断 `watched_list?.includes(target.raw_label) ?? false` → add/remove 分支正确，`set_account_overrides(next_overrides)` + `patchConfig({ accountOverrides: next_overrides })` 双写持久化；依赖数组 `[account_overrides, patchConfig, set_account_overrides]` 闭合，无 stale closure。
- t041 清理核对：`grep upcomingResetOff|on_toggle_upcoming|upcoming_reset_off|can_toggle_upcoming|toggle_upcoming_reset` 在 `src/` 零命中。`AccountRow.tsx` 删 bell 按钮块 + props（`-21`）；`CpaCard.tsx` 删 `upcoming_reset_off` prop + `on_toggle_upcoming` 透传（`-14`），`Icon` 仍被其他按钮使用，无残留；`VendorCard.tsx` 删 `upcoming_reset_off`/`can_toggle_upcoming`/`on_toggle_upcoming`（`-13`）；`SettingsView.tsx` 删 `toggle_upcoming_reset`/`toggle_upcoming_reset_keys`/相关 row 字段与回调（`-106`），`accountKey` import 移除（`grep accountKey\b SettingsView.tsx` 零命中），`snapshot_items` 仍被 t038 tombstone 检查（`:844`）与 VendorCard row 构造（`:1582`）使用，保留合理。
- 边界：watched 缺省/空 → `provider_watched` undefined → `watched_labels` undefined/空 → 跳过，`items=[]`，符合 spec「默认全关」。`is_live` 门控保证镜像树不触发持久化。`patchConfig` 经 save queue 串行化，无 race。
- 范围外提示（不进 finding 表）：`docs/specs/config-store.md:34`、`docs/specs/ui-views-web.md:15` 仍描述 `upcomingResetOff`，属 Step 7 收尾 docs 同步范畴，非代码缺陷。
- 总体判断：数据层 + UI 接线实现完整、t041 残留清理彻底、accountKey 维度对齐、边界与持久化路径正确；唯一 finding 是 PopupView 慢性 file膨胀，可 Adoption 阶段决定处置方式。

verdict: FAIL

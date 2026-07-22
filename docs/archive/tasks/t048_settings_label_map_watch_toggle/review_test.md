# Task review t048（reviewer_focus: 测试）

- task：`t048_settings_label_map_watch_toggle`
- spec：`docs\tasks\t048_settings_label_map_watch_toggle/spec.md`
- diff_anchor：`16ee8348343ab0bc78b9945cf89965679a5a416d`
- target：`git diff 16ee8348343ab0bc78b9945cf89965679a5a416d`
- round：1
- reviewed_at：2026-07-23 05:25 UTC+8

## Findings

### t048_test_f001 - SettingsView 层 on_toggle_watched 聚合 + 持久化分支无测试覆盖

- 严重度：important
- 位置：`src/renderer/views/SettingsView.tsx:2200-2230`（未对应任何测试）；现有覆盖仅 `tests/unit/renderer/components/settings_form.test.tsx:576-598`
- 问题：spec AC 明确列了两条:
    - 「点击 bell 持久化 `upcomingResetWatched`（provider+accountKey+raw_label），刷新后状态保留」
    - 「多 account instance：bell 对该 raw_label 的所有 accountKey 一起 toggle」
    - 「SettingsForm 组件测：bell 渲染 + watched 状态 + 点击触发回调（add/remove 分支）」

    组件测（settings_form.test.tsx）只断言 `on_toggle_watched` 被以 `raw_label` 调用（576-598），add/remove 分支与多 accountKey 聚合、save_config 持久化的真正实现都在 SettingsView 的闭包回调里（SettingsView.tsx:2200-2230：filter matching items → dedupe accountKeys → all_watched 判断 → 循环 `add_watched_metric`/`remove_watched_metric` → `save_config`），该路径无任何单元/集成测试。`tests/unit/renderer/views/settings_view.test.tsx` 现有 50+ it 块无一条触及 `on_toggle_watched`、`add_watched_metric`、`remove_watched_metric` 或 `snapshot_items`+accountKey 聚合。

    失败场景：若 SettingsView 的 `all_watched` 判断写反、`keys` dedupe 漏掉、`add_watched_metric` 与 `remove_watched_metric` 分支互换、或忘记 `save_config`，现有测试全部 PASS 但 AC 两条失效。

- 建议：在 `tests/unit/renderer/views/settings_view.test.tsx` 补一组测试，渲染 SettingsView → 展开某 instance 的「数据标签映射」→ 点击 bell → 断言 `save_config` 被以含 `add_watched_metric(...)` 或 `remove_watched_metric(...)` 结果的 `accountOverrides` 调用。至少两条用例：(a) 全未 watched → 点击 → 对所有 accountKey 调 add；(b) 全 watched → 点击 → 对所有 accountKey 调 remove。多 accountKey 场景（raw_label 跨 2+ accountKey）必须覆盖。

### t048_test_f002 - aria-pressed「部分 watched」边界未覆盖

- 严重度：minor
- 位置：`tests/unit/renderer/components/settings_form.test.tsx:569-574`
- 问题：测试只覆盖两种状态——`five_hour` 两 accountKey 全 watched → aria-pressed="true"；`seven_day` 全未 watched → aria-pressed="false"。spec 的 watched 判定是「该 raw_label 在当前 instance 的 accountKey(s) 是否**全部** watched」（`r.account_keys.every(...)`），边界「N-1 个 accountKey watched + 1 个未 watched → 结果应为 false」未测。该 every 边界是 t048「全 watched 才视为 watched」语义的关键点。
- 建议：补一条用例：某 raw_label 有两个 accountKey，仅其中一个在 watchedMetrics 里，断言 aria-pressed="false" 且点击触发回调（与全 watched 分支区分）。

## 结论

- 前轮 finding 复核：N/A（Round 1）。
- 本轮新发现：2 条（1 important + 1 minor）。
- 总体判断：组件测覆盖了 bell 渲染、不渲染、aria-pressed 语义、点击触发回调；label-map-util 测覆盖了 account_keys 合并与去重；但 SettingsView 层 add/remove 持久化聚合分支完全无测，AC「持久化」「多 accountKey 一起 toggle」「add/remove 分支」实际未验证。

verdict: FAIL

## Round 2

- round：2
- reviewed_at：2026-07-23 05:45 UTC+8
- 复核范围：`git diff 16ee834 -- tests/unit/renderer/views/settings_view.test.tsx tests/unit/renderer/components/settings_form.test.tsx`（仅测试增量），`pnpm vitest run -t "t048"` 8 PASS / 0 FAIL。

### 前轮 finding 复核

- **t048_test_f001（important）— 已修**：`settings_view.test.tsx` 新 describe `upcoming-reset watch bell aggregation and persistence (t048)` 三用例：
    - `(a) unwatched → click`：`current_config = base_config`（无 `upcomingResetWatched`），点击 bell 后 `waitFor` 断言最后一次 `save` 调用的 `accountOverrides.upcomingResetWatched.deepseek` 形如 `{"deepseek-1|acc-a": ["five_hour"], "deepseek-1|acc-b": ["five_hour"]}`——覆盖「全未 watched → 所有 accountKey add」+ 持久化。
    - `(b) all-watched → click`：起点 `acc-a`/`acc-b` 均含 `five_hour`，点击后断言 `saved.accountOverrides.upcomingResetWatched` 为 `undefined`（被 prune）——覆盖「全 watched → 所有 accountKey remove」+ 持久化。
    - `(c) 3 accountKey 部分起点`：起点仅 `acc-a` watched，点击后断言 3 个 key 全部出现在 watched——覆盖「部分起点单次点击聚合所有 accountKey」。
    - 三用例均用 `save.mock.calls[save.mock.calls.length - 1]` 拿最后一次 save，配合 `waitFor` 等待 fire-and-forget 的 `void save_config(...)`。`toEqual`/`toBeUndefined` 锁住结构，add/remove 写反、漏 key、忘记 save 均会 FAIL。AC「持久化」「多 accountKey 一起 toggle」「add/remove 分支」全部被有效断言。
- **t048_test_f002（minor）— 已修**：`settings_form.test.tsx` 新增 `marks aria-pressed=false when only some account_keys are watched (t048 review test f002)`，watchedMetrics 仅含 `inst-1|acc-a`（不含 `acc-b`），断言 `five_hour` 行 bell 的 `aria-pressed="false"`——精准覆盖 `r.account_keys.every(...)` 在 N-1 watched 时的 every 边界。

### 本轮新发现

无。新增测试结构清晰、断言锁期望行为、无 flaky（mock 在 `beforeEach` 重置、async 用 `findBy*`/`waitFor`）。

verdict: PASS

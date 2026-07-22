# Task review t044（reviewer_focus: 测试）

- task：`t044_split_popup_view`
- spec：`docs\tasks\t044_split_popup_view\spec.md`
- diff_anchor：`6d4f7e0`
- target：`git diff 6d4f7e0`
- round：1
- reviewed_at：2026-07-22 16:35 UTC+8

## 扫描与验证摘要

- diff 范围：PopupView.tsx（947→781 行）+ 4 新 hook（`use_dnd_handlers` / `use_popup_derived` / `use_tab_navigation` / `use_watched_metric_toggler`）+ 2 新 hook 单测。
- 运行 `pnpm vitest run tests/unit/renderer/hooks/`：23/23 PASS。
- 运行 `pnpm vitest run tests/unit/renderer/views/popup_view.test.tsx`：28/28 PASS（既有回归网零回归）。
- 危险模式扫描：未发现 `.skip` / `.only` / `@ts-ignore` / `expect(true).toBe(true)` / 删 expect / 反转断言 / 注释掉断言 / 弱化断言 / 阈值掩盖 / 条件跳过。`vi.mock("../../../../src/renderer/lib/provider-usage", …)` 在 `use_popup_derived.test.ts` 属模块边界 mock（仅覆盖 `build_provider_usage_groups`，其余函数走真实实现），合法。
- 断言锁死历史错误行为扫描：未发现。`use_popup_derived.test.ts:101` 的 `toBe(result.current.activeGroup)` 是同引用比较，对应实现 `use_popup_derived.ts:111` 的早返路径，语义正确。
- 既有回归网（`popup_view.test.tsx`）对 hook 抽离的兜底强度评估：见下文 finding 之外的覆盖评估。

## Findings

### t044_test_f001 - `handle_drag_over`（provider 卡片方向感知中点重排）零覆盖

- 严重度：important
- 位置：`src/renderer/hooks/use_dnd_handlers.ts:78-110`（实现）；`src/renderer/views/PopupView.tsx:631`（接入 `onDragOver`）；`src/renderer/components/ProviderCard.tsx:345-354` 与 `ProviderOverview.tsx:85`（真实 DOM 触发点）
- 问题：`use_dnd_handlers` 单测覆盖了 drag 状态切换与 `handle_account_drag_enter`（account 级重排），但**完全未覆盖 `handle_drag_over`**——即 provider 卡片的真实重排路径。该函数包含本 hook 最复杂的分支：
    - 同行判定 `Math.abs(drag_rect.top - rect.top) < rect.height / 2` → 轴 `"x" | "y"`；
    - 委托 `compute_drag_reorder` 做方向感知中点守卫；
    - `drag_rect` 来自 `handle_drag_start` 闭包，存在 stale-closure 风险面。
    既有集成网 `popup_view.test.tsx:996-998` 仅触发 `fireEvent.dragStart / dragEnter / dragEnd` 于账号卡（走 `handle_account_drag_enter`），**未触发 `fireEvent.dragOver`**；账号行 `ProviderAccountRow.tsx:133` 的 `onDragOver` 是 `e.preventDefault()` 空转，不会进 provider 重排。因此该路径在 unit 与 integration 两层均无证据。
- 失败场景：重构若把 `same_row` 阈值改成 `>`、把 axis 默认值写反、或在 `useCallback` 依赖中漏掉 `drag_rect`（产生 stale closure），所有现有测试仍 PASS，但真实拖拽场景下 provider 卡片不再换位或换错位——属静默回归。
- AC 关联：spec.md L24「抽出的 hook/组件有单测（若可独立测）」——`handle_drag_over` 是本 hook 内**最可独立测且最易回归**的一段；缺测使该 AC 仅部分满足。
- 建议（最小修复方向）：在 `use_dnd_handlers.test.ts` 加 2 个用例——(a) `handle_drag_start("claude", same_row_rect)` → `handle_drag_over("codex", x, y, same_row_rect)`，断言 `provider_order` 变为 `["codex", "claude"]`（x 轴路径）；(b) 用 `different_row_rect` 触发 y 轴路径，断言中点反向时不换位（覆盖 `next ?? prev` 的 null 分支）。可直接复用现有 `render_dnd` 工厂。

### t044_test_f002 - `use_tab_navigation` wheel 节流 + 环绕切换无单测

- 严重度：minor
- 位置：`src/renderer/hooks/use_tab_navigation.ts:32-59`
- 问题：hook 内 wheel 监听有真实分支逻辑：`deltaY vs deltaX` 取向、`200ms` 节流、`(((i + dir) % n) + n) % n` 环绕、`n === 0` 守卫、`passive: false` 与 `removeEventListener` 清理。无任何单测；`tests/` 全仓搜索 `deltaY` / `WheelEvent` / `wheel` 零命中，集成层也未驱动。
- 风险评估：纯重构逐字搬迁，行为一致性高；但「节流 + 环绕 + 取向选择」是本 hook 独有的非平凡分支，未来修改（如调阈值、改方向）无回归网。
- 建议：`renderHook` 渲染一个挂载 `tabsRef` 的 test 组件，`fireEvent.wheel` 触发，断言 `setActiveTab` 收到正确下一 tab；并测一次节流命中（200ms 内的第二次 wheel 被忽略）。

### t044_test_f003 - `use_watched_metric_toggler` 无单测

- 严重度：minor
- 位置：`src/renderer/hooks/use_watched_metric_toggler.ts`
- 问题：hook 是 `add_watched_metric` / `remove_watched_metric`（两 helper 已在 `tests/unit/renderer/account-overrides.test.ts` 测过）之上的薄 wrapper：读 `is_watched` 分支 → 调其中一个 helper → `set_account_overrides` + `patchConfig`。hook 本身无单测，UI 接线（`PopupView.tsx:686-687` → `on_toggle_watched`）在 `popup_view.test.tsx` 也未被点击驱动。
- 风险评估：四 hook 中风险最低——逻辑简单，底层 helper 已覆盖，纯重构搬迁。但「`patchConfig({ accountOverrides })` 是否被正确调用」这条 wiring 没有任何测试锁住；若未来把 `patchConfig` 漏写，所有现有测试仍 PASS。
- 建议：`renderHook` + mock `set_account_overrides` / `patchConfig`，对同一 target 连续调用两次（加 → 移），断言两次都触发 `patchConfig` 且传入的 `accountOverrides` 不同；一次 `account_overrides === undefined` 初始态覆盖 `add_watched_metric` 分支即可。

## 既有回归网（popup_view.test.tsx）兜底强度评估

- 28 用例覆盖：tab 渲染、`tb-time` 更新、单/全刷新及失败日志、collapse 持久化、CONFIG_CHANGED 双向同步（含 `providerOrder` 不回写防乒乓）、`accountOrders` 加载与保存、即将重置行点击回顶、`threshold null` Banner/Rail 不挂载、空状态、mirror 树不重复 floating 关闭按钮。
- 对**四 hook 抽离**的兜底：`use_popup_derived` 的输出（visibleProviders / orderedActiveGroup / upcomingItems）被「provider tab 渲染」「account 顺序」「Banner/Rail 挂载」间接覆盖；`use_dnd_handlers` 仅覆盖 account 重排（provider 重排见 f001）；`use_watched_metric_toggler` 与 `use_tab_navigation` 的可观察行为在回归网中无对应用例。
- 结论：回归网对「行为零回归」主轴提供有效证据，但不足以替代四 hook 的独立单测——spec AC「抽出的 hook 有单测」要求独立验证 hook 契约，而非仅靠上游 UI 端到端。f001/f002/f003 即对应缺口。

## 结论

- 本轮新发现：3 条（1 important + 2 minor）。
- 总体判断：纯重构行为零回归已被 28 条回归网证实，`pnpm test` 全绿；但 AC「抽出的 hook 有单测」对四 hook 中三 hook 的关键路径（provider drag_over、tab wheel、watched toggle wiring）存在覆盖空洞，其中 `handle_drag_over` 是静默回归风险最高的路径，应在 adoption 阶段补测或显式遗留。

verdict: FAIL

## Round 2

- round：2
- reviewed_at：2026-07-22 17:10 UTC+8
- 复核范围：Round 1 三条 finding（f001/f002/f003）的修复测试，不涉源码。

### 逐条复核

- **t044_test_f001（important，已修）**：`use_dnd_handlers.test.ts:110-139` 新增 2 用例。
    - x 轴：same-row（`|0-10|=10 < height/2=50`）→ axis x，pointer_x=80 ≥ middle_x（`rect.left 0 + width 100/2 = 50`）→ 换位 `["claude","codex"] → ["codex","claude"]`。手算 `compute_drag_reorder`（drag-reorder.ts:37-43）：from<to 且 pointer_x≥middle_x 不返 null，splice(0,1)+splice(1,0) 得 `["codex","claude"]`，断言锁正确行为而非历史错误。
    - y 轴：different-row（`|0-200|=200 ≥ 50`）→ axis y，middle_y（`top 200 + height 100/2 = 250`），pointer_y=210 < 250 且 from<to → 返 null → `next ?? prev` 不换位，覆盖空回退分支。
    - 合力覆盖 `same_row` 判定、轴选择、中点守卫、`next ?? prev` 空回退四段。x 轴断言隐式锁住 `drag_rect` 闭包依赖（无 drag_rect 则 same_row 恒假 → 永不换位 → 测试转红）。无 flaky。

- **t044_test_f002（minor，已修）**：新建 `use_tab_navigation.test.tsx`，4 用例。
    - deltaY=100 overview→claude（dir=1 前进）；deltaY=-100 overview→codex（环绕 `((-1 % 3)+3) % 3 = 2`）；200ms 节流（fake timer，第 2 次 advanceTimersByTime(100) 后 `now-wheel_at=100<200` 被忽略）；deltaX=120 驱动（`|0|<|120|` → d=deltaX）。覆盖方向选择、环绕、节流、取向四关键分支。fake timer 对 `Date.now()` 确定性 mock，首帧 `now` 为真实大时间戳，`now-0 ≫ 200`，首帧无误节流，无 flaky。

- **t044_test_f003（minor，已修）**：新建 `use_watched_metric_toggler.test.ts`，1 用例双断言。
    - 初始 undefined → is_watched=false → add 分支，断言 `added.upcomingResetWatched.claude.acct1 = ["5小时"]` 且 `patchConfig({ accountOverrides: added })` 被调；rerender(added) → is_watched=true → remove 分支，断言 `removed.upcomingResetWatched` undefined 且 patchConfig 二次调用。锁住两分支 + `patchConfig` wiring（f003 核心缺口）。mock 契约 `set_account_overrides: (ov)=>void` 与 hook 入参类型一致。

### 新发现

无。

### 观察记录（非 finding，standards/流程范畴）

`use_tab_navigation.test.tsx` 与 `use_watched_metric_toggler.test.ts` 当前为 git untracked（`??`），未 `git add -N`，故 `git diff 6d4f7e0` 仅显 2 文件、不显这两个。测试内容本身无缺陷，但 Step 8 提交前需显式 `git add` 这两个文件，否则修复丢失。不计入 test 轴 finding。

verdict: PASS

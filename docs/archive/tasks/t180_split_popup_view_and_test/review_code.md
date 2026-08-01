# Task review t180（reviewer_focus: 代码）

- task：`t180_split_popup_view_and_test`
- spec：`docs/tasks/t180_split_popup_view_and_test/spec.md`
- diff_anchor：`1e15d1637019532b0889e9d75698b074ce347593`
- target：`git diff 1e15d1637019532b0889e9d75698b074ce347593`
- round：1
- reviewed_at：2026-08-01 13:55 UTC+8

## Findings

### t180_code_f001 - UpcomingResetCard 的 key 从列表元素移到失效位置

- 严重度：minor
- 锚点：行为缺陷——React 列表元素缺 key 警告回归 + 列表 key 语义丢失
- 位置：`src/renderer/views/PopupView.tsx:540`；`src/renderer/views/popup-view/UpcomingResetCardSlot.tsx:38`
- 问题：拆分前 `renderExtraCard` 直接返回 `<UpcomingResetCard key={UPCOMING_RESET_CARD_ID} ... />`，该元素是 `ProviderOverview.tsx:97` `card_order.map()` 数组的直接成员，key 承担列表项标识。拆分后 `renderExtraCard` 返回 `<UpcomingResetCardSlot ... />`（`PopupView.tsx:540`，无 key），而 key 被留在 slot 内部 `<UpcomingResetCard key={UPCOMING_RESET_CARD_ID} />`（`UpcomingResetCardSlot.tsx:38`）——该元素是 slot 的唯一子元素，不在任何数组里，key 完全失效。结果：列表中的 slot 元素缺 key，React 在 dev 模式触发 "Each child in a list should have a unique key prop" 警告（原代码无此警告）；当前只有一个 extra card（`__upcoming_reset__`），且 `UpcomingResetCard`/`CollapsibleCard` 均为受控组件，按 index 对位不会产生功能错乱，故渲染结果一致。但对「行为零变化」的纯移动拆分，这是引入的新 dev 警告与列表 key 语义丢失。
- 建议：`PopupView.tsx:540` 改为 `<UpcomingResetCardSlot key={UPCOMING_RESET_CARD_ID} ... />`，并删除 `UpcomingResetCardSlot.tsx:38` 的失效 key。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：1 条（t180_code_f001，minor）
- 未进表的提示：
    - 文件过大：无文件触发阈值门。`PopupView.tsx` 718 行（876→718，净减少，不触发净增条件）；`popup-view/` 子组件 19–84 行、`lib.ts` 57 行；测试文件全部 < 600 行（config 552 为最大），拆分后各测试文件均净减少或小文件新建。
    - 圈复杂度：`PopupView.render_body` 分支点较多（约 30+，镜相/实时双渲染 + 多个 `is_live ? x : undefined` 三元），但为拆分前既有结构，本次拆分反而把 titlebar/empty/net-banner/skeleton/upcoming 的分支迁入子组件，复杂度未增加；不触发「本 task 仍增加分支」条件。
    - 范围外观察：`lib.ts` 把原 module-local 的 `MODULE`/`log`/`should_log_raw`/`token_panel_enabled` 提升为导出（模块边界所需），属表面扩大，无调用方误用。
- 总体判断：拆分语义保持正确——import 无循环、导出无遗漏（`record_bool_equal` 经 re-export 保持原导入路径 `PopupView` 可解析）、`UpcomingResetCardSlot` 的 `is_live`/`force_collapse` 收敛与 `expanded`/drag 各 prop 逐项与原 JSX 等价（含镜相 `is_live=false` 分支）；`tsc --noEmit` 与 eslint（--max-warnings=0）对变更源码均通过。仅 1 条 minor（key 位置漂移），无未解决 critical / important。
- 系统性 follow-up：无

verdict: PASS

## Round 2 (2026-08-01 14:35 UTC+8)

### t180_code_f001 复核 - UpcomingResetCard 列表 key 位置漂移

- 结论：已修（以 diff 为准）
- 证据：`git diff 1e15d163` 中 `src/renderer/views/PopupView.tsx` `renderExtraCard` 现返回 `<UpcomingResetCardSlot key={UPCOMING_RESET_CARD_ID} ... />`（`PopupView.tsx:541`）；`src/renderer/views/popup-view/UpcomingResetCardSlot.tsx:37-72` 内部 `<UpcomingResetCard>` 已无 key。`ProviderOverview.tsx:97` `card_order.map()` 直接返回 `renderExtraCard?.(card_id) ?? null`，slot 是数组直接成员，key 承担列表项标识，语义与拆分前 `<UpcomingResetCard key=...>` 等价。`popup-view/` 目录 `grep key=` 无命中；React 对自定义组件剥离 key 不进 props，无 prop 注入；`UPCOMING_RESET_CARD_ID` 在两文件仍被引用，无失效 import。`render_body` 的三处调用（live + content/collapsed 两 mirror）复用同一 `renderExtraCard`，每棵树 key 均为有效列表成员，dev 警告已消除。
- 修复过程新问题：无。修复为纯属性搬移，未引入新行为。

## 结论

- 前轮 finding 复核：t180_code_f001（minor）已修，无遗留。
- 本轮新发现：0 条
- 未进表的提示：无
- 总体判断：唯一前轮 minor 已在 diff 中真修，无未解决 critical / important。
- 系统性 follow-up：无

verdict: PASS

# p270 用量面板刷新按钮蓝色框复发（点击残留+其余面板未覆盖）

- 现象：用量面板右上「刷新全部」按钮有时外圈出现蓝色框（`focus-visible:ring-2` accent 环）。p261 修过首次打开常驻蓝框（`49ffb7d5`），但点击刷新后、窗口再次唤起、或键鼠混合操作后仍会复现。
- 影响：视觉干扰，按钮被误识别为选中态；键盘 Enter/Space 可能误触发刷新。已确认同类位点并集：五面板标题栏全部刷新/导航按钮（Usage 已部分修，其余四面板零覆盖）+ 卡片级刷新按钮点击残留。
- 根因：产品缺陷，可验证机制三段（`.scratch/refresh_focus_ring/repro.py` 已跑通）：
    1. 样式源：`ui/Button.tsx:28-31` 基类常驻 `focus-visible:ring-2 ring-[var(--color-accent)]`（不透明亮蓝），`icon-link.ts:6-10` 同款。
    2. p261 只修一种时序：`PopupView.tsx:362-378` 仅挂载 + `window focus` 时把焦点拉回 `live_root_ref`（`tabIndex=-1 + outline-none` 容器）。`handleRefreshAll:514-532` 无 `blur`/重置，点击后焦点永久留在按钮上；窗口内点击不产生 `window focus` 事件，无重置触发；hide/show 不 remount，Chromium 顺序焦点恢复可能跑在 listener 之后形成竞态——对应“有时候”。
    3. `:focus-visible` 启发式：鼠标点击聚焦不亮环，但焦点残留后任意键盘模态/失焦再获焦都会将其翻为可见环，故点击后延迟出现。
        已确认同类位点：`TokenStatsView.tsx:846`（Agent）、`SessionShell.tsx:154`（Session）、`SettingsView.tsx:460/477/504`、`DevPanelView.tsx:167` 四处 `PanelTitleBar` 宿主均无焦点重置；`ProviderCard.tsx:211-227` 及 `provider_card_states.tsx:101-176` 卡片级刷新 `onClick` 同样无 `blur`。
        吃不准单列：`main-panel-controller.ts:380-445` showInactive 后紧接 `focus()` 是否每次都产生可监听的 DOM focus 事件（showInactive 本意不获焦），需真机验证，不算已确认。
- 测试缺口：`tests/e2e/web/popup_view.spec.ts` p261 用例只断言初始渲染 `matches(':focus-visible')===false`，未覆盖点击后残留、窗口 blur/refocus 后、其余四面板；`popup_view.test.tsx` jsdom 无 `:focus-visible` 启发式与原生激活语义，只能断 `activeElement`，对本缺陷假绿。应补：web e2e 层对 Usage 点击刷新后 + 窗口重聚焦后刷新按钮仍非 `:focus-visible`，并对 Agent/Session/Settings/Dev 首按钮同断言；jsdom 层不补（无意义）。
- 线索：`.scratch/refresh_focus_ring/repro.py`（Button 基类行、PopupView 重置范围、handleRefreshAll 无 blur、四宿主零覆盖静态断言）。
- 处理：t538

# surface_token_unify

全窗口背景色回归 DESIGN 两级体系：窗口/侧栏/主区 = `surface-window`，内容卡片 = `surface-card`，`surface-raised` 仅作交互态。

## 规则

- 窗口外壳、侧栏、主区大背景：`bg-[var(--color-surface-window)]`。
- 内容卡片（会话 pane、会话库网格卡/列表行、用量卡片等）：`bg-[var(--color-surface-card)]`。
- `surface-raised` 仅用于 hover 铺底、分段控件选中块/轨道、徽章灰底、进度条槽、代码 chip 等交互或小型控件底，**不作面板/卡片整面背景**。
- 禁止面板级无 token 依据的 `color-mix(in srgb, surface-window 70%, surface 8%)` 侧栏/底色字面量。
- token 数值本身（DESIGN front matter / `@theme`）不在此改动。

## 已落地位点（t406）

| 容器 | 修正 |
|---|---|
| `SessionPane` `.conversation-pane` | `surface-raised` → `surface-card` |
| `SessionRail` 容器 | color-mix → `surface-window` |
| `SessionShell` rail-toggle 行/按钮底 | color-mix → `surface-window`（hover 仍 raised） |
| `SettingsView` 侧栏 | color-mix → `surface-window` |
| `SessionCard` | 去掉 `Card raised`，默认 `surface-card` |
| `SessionRow` | 整面 `surface-card`，hover `surface-raised` |

## 审计结论（AC-003）

- 面板级 `color-mix(window 70%, surface 8%)`：零残留。
- 保留的 `surface-window` color-mix：toast/dock 半透明浮层（非面板整面）。
- 保留的 `surface-raised`：Segmented 轨道、Switch 关态、Progress 槽、Badge/chip、表格 thead、代码 chip、hover/选中块等（AC-004）。

## 验证

- 单测：SessionPane/Rail/Shell、WorkspaceView、SessionLibrary、SettingsView 类名断言。
- e2e web：会话壳/工作台/会话库 computed 背景两色可辨（pane 与 library-card 同色，异于 shell）。
- 暗色目检标 [deploy]（AC-005）。

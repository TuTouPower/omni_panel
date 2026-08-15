# d040 面板背景两级：window/card，raised 仅交互态

- 来源：t406
- 结论：DESIGN Colors 规定暗色窗口 `#181b22`、卡片 `#1f232c` 仅亮一档；`surface-raised`（#262b34）不作面板/卡片整面。实现侧统一：壳/侧栏/主区 `surface-window`，内容卡 `surface-card`；禁止 `color-mix(window 70%, surface 8%)` 面板底。
- 证据：t406 grep 清零面板级混色；SessionPane/SessionCard/SessionRow/SessionRail/Settings 侧栏单测 + e2e computed 两色可辨。
- 影响：后续视觉 task 不得把 raised 当卡片底；交互态 hover/分段/徽章可继续用 raised。
- 现状：有效

# d047 Card/StatusDot 必须对齐 DESIGN 完整形态并禁止业务手拼

- 来源：t423
- 结论：`ui/Card` 完整形态 = `rounded-lg`（14px）+ outline 描边 + `surface-card` + **`shadow-card`** + `spacing-card-padding`；`ui/StatusDot` = **7px** 圆点 + 同色 **16% ring 光晕**（tone 五档）。业务侧禁止再手拼卡片外壳（`radius-lg|14px + border-0.5px + surface-card + shadow-card`）或状态点（6/7/8px 分裂 / `style.background` inline 色）。
- 证据：DESIGN.md「卡片」「徽章与状态」；t423 收拢 5 处 Card 手拼 + 5 文件 StatusDot 手拼；`tests/unit/renderer/components/ui/ui.test.tsx` 组件断言 + 业务侧配方 grep。
- 影响：后续 UI 任务新增卡片/状态点必须 import `ui/Card` / `ui/StatusDot`；Card 补 shadow 会改全部既有 Card 使用点观感（合规对齐）。
- 现状：有效

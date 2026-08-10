# p081 面板窗口未设 minWidth，保存尺寸提升致重开放大

- 来源：t251 review f003（minor）
- 内容：`window-bounds.ts` 保存把尺寸提升到 PANEL_MIN（480x360），但 agent/history 窗口未设 `minWidth`/`minHeight`，用户可缩到更小尺寸，重开时被放大回最小。与设置窗口先例一致（设置窗口也未设 minWidth）。（2026-08-08 核实：仍在，agent/history/setting 三处窗口均无 min 尺寸限制。）
- 处理：t262

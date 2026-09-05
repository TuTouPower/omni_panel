# p219 自定义态下拉 click 重开面板的打扰与键盘路径缺口

- 来源：t451 遗留（reviewer finding t451_gen_f003，minor，现状可接受）
- 内容：custom 生效且面板关闭时，时间范围下拉任意 click 即重开面板（`TokenStatsView.tsx` 时间 Select `onClick`）。副作用：用户本想切预设/按 Esc 取消选择时面板多余弹出；反向缺口：键盘聚焦+方向键回车重选同值 custom 不一定产生 click，打不开面板。优化方向：收窄为真实选中 custom 才打开（或无 change 收场时回关），并补键盘路径测试。注意与 AC-002 约束共存：原生 select 同值不发 change。
- 处理：t453

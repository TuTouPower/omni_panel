# d032 tailwind-merge 误判自定义字号 token 为颜色类

- 来源：t283（2026-08-10 随 commit `b99fbdb0`「ui 组件明暗主题对比度抽查与 DESIGN 对照修复」入库；实测复现见「验证」节）
- 影响：t283 已按「规避」修复受影响组件（e2e 对比度断言 3.13:1）；后续 t298（Button 字号）与 t302（组件库批量清理自定义字号类）为同类修复。凡未按规避写法的 `cn()` 组合（自定义字号 + 颜色类）仍会静默丢颜色，新组件须遵守该约束。
- 现状：有效

## 事实

- `tailwind-merge` 的 `text-*` 冲突组同时承载 font-size 与 text-color 两个子组；对**不在其内置 scale 中的自定义字号 token**（如 `text-label-md`、`text-body-md`，来自 `--text-*` 主题变量），twMerge 会把它归入 text-color 子组，与同组的 `text-[var(--color-on-*)]` 颜色任意值冲突合并，后者被丢弃。
- 后果：`cn("text-[var(--color-on-primary)] text-label-md")` 只保留 `text-label-md`，颜色回退继承值——sm 主按钮文字在暗色下回退 `on-surface-dark`（#e9ecf3），白字对比从 3.13 跌至 2.65（t283 实测复现并修复）。
- 规避：自定义字号一律用显式任意值 `text-[length:var(--text-*)]`，明确归入 font-size 子组，不与颜色冲突。

## 验证

- t283 实测：修复前 `twMerge("bg-primary text-on-primary hover:...", "text-label-md")` 输出无 `text-on-primary`；改 `text-[length:var(--text-label-md)]` 后两者共存；e2e computedStyle 断言白字 on #5b8dff = 3.13:1。
- 适用：本项目所有 `cn()`（clsx + twMerge）组合自定义字号 token 的组件。

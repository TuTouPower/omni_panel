# d032 tailwind-merge 误判自定义字号 token 为颜色类

## 事实

- `tailwind-merge` 的 `text-*` 冲突组同时承载 font-size 与 text-color 两个子组；对**不在其内置 scale 中的自定义字号 token**（如 `text-label-md`、`text-body-md`，来自 `--text-*` 主题变量），twMerge 会把它归入 text-color 子组，与同组的 `text-[var(--color-on-*)]` 颜色任意值冲突合并，后者被丢弃。
- 后果：`cn("text-[var(--color-on-primary)] text-label-md")` 只保留 `text-label-md`，颜色回退继承值——sm 主按钮文字在暗色下回退 `on-surface-dark`（#e9ecf3），白字对比从 3.13 跌至 2.65（t283 实测复现并修复）。
- 规避：自定义字号一律用显式任意值 `text-[length:var(--text-*)]`，明确归入 font-size 子组，不与颜色冲突。

## 验证

- t283 实测：修复前 `twMerge("bg-primary text-on-primary hover:...", "text-label-md")` 输出无 `text-on-primary`；改 `text-[length:var(--text-label-md)]` 后两者共存；e2e computedStyle 断言白字 on #5b8dff = 3.13:1。
- 适用：本项目所有 `cn()`（clsx + twMerge）组合自定义字号 token 的组件。

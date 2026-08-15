# ui 组件库（token 取值规范）

## 行为

- `src/renderer/components/ui/` 统一组件库，组件只消费 DESIGN.md front matter 的语义 token（颜色/字号/圆角/间距/阴影经 `globals.css` 导出），不写散落字面量；复合模式沉淀为 `@utility`（`glass-menu`/`logo-drop-shadow`/`shimmer`/`metric-num`/`transition-feedback`/`scrollbar-token`）。阴影明暗由变量层翻转（见 `elevation_layering_unify`），组件不写 `dark:shadow-*`。
- 组件形态全集与各形态 token 取值以 DESIGN.md `components` 节为真相源。取值规范（t301 六项对齐结果）：
    - **Switch**：轨道 38×22 pill（`switch-track`），开态 success 绿、关态 `surface-raised`；圆钮 18px `surface-window`，关态留白 2px 起步，开态对称到右缘。
    - **Badge count**：`badge-count` 12% 浅底（`primary-container`）+ primary 字 + full 圆角；label 形态保持 `badge-tag` 灰底 + 分类色点。
    - **Progress**：细线 `progress-track` 6px、胶囊 `progress-capsule` 22px，共用风险阶梯填充色。
    - **Button**：标准档字重 600（DESIGN 按钮节正文权威，独立于 body-md 通用 450）；变体配色取 `button-*` token。
    - **Menu**：菜单项 hover `menu-item-hover` primary 底 + on-primary 字；danger 项 hover error 底 + on-primary 字。
    - **Dialog**：卡片入场 `@keyframes dialogIn`（160ms 上浮淡入，`animate-[dialogIn_160ms_var(--motion-easing)]`），`motion-reduce:animate-none`。
- 自定义字号类须用显式 `text-[length:var(--text-*)]`（d032 机制），避免 tailwind-merge 吞颜色类。
- 字号档收敛九级（`@theme` 定义：display-num/title-lg/md/sm/body-md/sm/label-md/caps/code-md），不新增第九级以外字号档；未定义档（如 `text-label-sm`）属失效类，按语境归级到现有档（t303）。

## 验证

- 门禁：`pnpm designmd:check`（drift，DESIGN.md 与 globals.css 导出区一致）。
- 单元：`tests/unit/renderer/components/ui/ui.test.tsx` 组件类名与 token 断言。
- 对比度与主题：`ui-component-theme-contrast` spec（明暗两态 WCAG 断言）。
- 构建产物：`pnpm build` 后 `out/renderer/assets/index-*.css` 含组件消费的工具类与 `@keyframes dialogIn`。

# ui 组件库（token 取值规范）

## 行为

- `src/renderer/components/ui/` 统一组件库，组件只消费 DESIGN.md front matter 的语义 token（颜色/字号/圆角/间距/阴影经 `globals.css` 导出），不写散落字面量；复合模式沉淀为 `@utility`（`glass-menu`/`logo-drop-shadow`/`shimmer`/`metric-num`/`transition-feedback`/`scrollbar-token`）。阴影明暗由变量层翻转（见 `elevation_layering_unify`），组件不写 `dark:shadow-*`。
- 组件形态全集与各形态 token 取值以 DESIGN.md `components` 节为真相源。取值规范（t301 六项对齐结果）：
    - **Switch**：轨道 38×22 pill（`switch-track`），开态 success 绿、关态 `surface-raised`；圆钮 18px `surface-window`，关态留白 2px 起步，开态对称到右缘。
    - **Badge**：`count`（`badge-count` 12% 浅底 primary-container + primary 字 + full 圆角）；`label`（`badge-tag` 灰底 + 分类色点）；t422 增 `accent`（卡片头计数，accent 12% 浅底 + `rounded-[7px]` + accent 字）与 `recommend`（推荐徽章，primary-container 底 + accent 字）。业务侧禁止手拼同配方徽章。
    - **Progress**：细线 `progress-track` 6px、胶囊 `progress-capsule` 22px，共用风险阶梯填充色。
    - **Button**：标准档字重 600（DESIGN 按钮节正文权威，独立于 body-md 通用 450）；变体配色取 `button-*` token。variant 全集：`primary` / `secondary` / `danger` / `ghost` / `icon` / `text`（t420：`text` = accent 行内文字动作钮）。size 全集：`standard` / `sm` / `inline`（行内无固定高）/ `icon`（32）/ `icon-md`（28）/ `icon-sm`（26）/ `icon-xs`（22）。`as="a"` 渲染原生 `<a>`（透传 href/target/rel，附 `no-underline`），web 中键/Ctrl+Click 新开标签页走此路径；业务侧禁止第三处复制同配方 class 串，手拼按钮收进本组件。
    - **Menu**：菜单项 hover `menu-item-hover` primary 底 + on-primary 字；danger 项 hover error 底 + on-primary 字。`Menu` 可透传 `data-testid` / `role` / `aria-label`；`MenuItem` 可透传 `aria-pressed` / `aria-checked` / `role`（t421）。业务侧禁止手拼 `glass-menu` 容器 + 非 primary hover 菜单项。
    - **Checkbox**：默认 `native`（16px 原生 input + accent-color）。t421 扩展 `select`（20px/22px 方块 + ✓，`accent`=`agent`|`primary`）与 `order`（序号态装饰 span，选中加 `on` class）；默认 native 渲染不变。会话库/最近会话选择框走组件，禁止第三处自绘同配方。
    - **Segmented**：容器 `surface-raised` + 选中块 `surface-window`/`on-surface`/`shadow-card`。t421：option 支持 `title` / `aria-label` / `data-testid`；会话库视图、Provider 概览/明细、趋势窗口分段统一消费本组件，档外圆角（`rounded-[7px]`/`[9px]` 分段）收敛。
    - **Dialog**：卡片入场 `@keyframes dialogIn`（160ms 上浮淡入，`animate-[dialogIn_160ms_var(--motion-easing)]`），`motion-reduce:animate-none`。
    - **Alert**（t422）：error/warning/success 三语义 12% color-mix 浅底容器；业务告警条走本组件。
    - **CodeChip**（t422）：只读 code 值 chip（surface-raised + code-md）。
    - **Toast**（t422）：底部居中浮层唯一实现。
- 自定义字号类须用显式 `text-[length:var(--text-*)]`（d032 机制），避免 tailwind-merge 吞颜色类。
- 字号档收敛九级（`@theme` 定义：display-num/title-lg/md/sm/body-md/sm/label-md/caps/code-md），不新增第九级以外字号档；未定义档（如 `text-label-sm`）属失效类，按语境归级到现有档（t303）。

## 验证

- 门禁：`pnpm designmd:check`（drift，DESIGN.md 与 globals.css 导出区一致）。
- 单元：`tests/unit/renderer/components/ui/ui.test.tsx` 组件类名与 token 断言。
- 对比度与主题：`ui-component-theme-contrast` spec（明暗两态 WCAG 断言）。
- 构建产物：`pnpm build` 后 `out/renderer/assets/index-*.css` 含组件消费的工具类与 `@keyframes dialogIn`。

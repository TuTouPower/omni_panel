# p135 provider logo 亮暗双图同显（light 下 dark 版也显示）

- 现象：opencode/grok/exa 的 logo 图标把亮色暗色两张一起显示。light 主题下实测：exa_dark（class `hidden dark:block`）computed display=block、exa_light（class `dark:hidden`）display=block，两张重叠显示。
- 影响：所有用 theme_logo 双图分支的 provider（exa/grok/opencode_go）在 web 面板的 vendor mark 处双图叠加。
- 根因：`src/renderer/components/Icon.tsx:264-268` VendorMark 用 `dark:hidden` / `hidden dark:block` 按主题切单图。CSS 产物（out/web、out/renderer）的 `.dark\:block:where([data-theme=dark],...)` 规则存在且形式正确，但 light 下 `dark:block` 仍匹配生效（异常：DOM 祖先无 data-theme=dark 也无 .dark 类）。疑 web 构建 dark 变体或 Tailwind v4 `:where` 处理问题；待修复 task 用纯函数/单测定位。已扫，无其他双图位点。
- 测试缺口：无测试断言 logo 按主题显隐；应补断言 light 下 dark 图隐藏（computed display none）。
- 线索：.scratch/bug_t304_evidence.md
- 处理：未开

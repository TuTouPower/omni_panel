# p135 provider logo 亮暗双图同显（light 与 dark 下双图均叠加）

- 现象：opencode/grok/exa 的 logo 图标把亮色暗色两张一起显示。light 主题实测：exa_dark（class `hidden dark:block`）computed display=block、exa_light（class `dark:hidden`）display=block，两张重叠；dark 主题同样双图叠加（light 图无法隐藏，最小复验证实）。
- 影响：web 与 renderer 双端一致（产物规则完全相同，无 web 特有差异）；所有用 theme_logo 双图分支的 provider（exa/grok/opencode_go）在 vendor mark 处双图叠加（ProviderNav tab、卡片头部 vendor mark）。
- 根因：`src/renderer/components/Icon.tsx:260` wrapper 的 `[&_img]:block` 编译为 `.\[&_img\]:block img`（特异性 (0,1,1)），层叠优先级高于 img 自身状态类 `.hidden`/`.dark\:hidden`/`.dark\:block`（(0,1,0)），使 Icon.tsx:266-267 的显隐全部失效。Tailwind v4 `@custom-variant`（globals.css:8）生成与 `:where` 处理正常（复验中完整选择器按主题正确匹配），原「疑 web 构建 dark 变体或 Tailwind v4 :where 处理问题」不成立；「light 下 dark:block 仍匹配」为误判（实际 dark:block 未匹配，生效的是 `[&_img]:block img`）。已确认同类位点：仅 Icon.tsx:260+266-267（三组双图共享同一 wrapper，一个修复面）。已扫无其他同类：`[&::-webkit-scrollbar]:hidden`（ProviderNav.tsx:74 / PopupView.tsx:745）为滚动条伪元素样式，无状态类显隐冲突，不同因。
- 测试缺口：无任何测试断言 logo 按主题显隐；补测须在 e2e（真实浏览器+真实产物 CSS）断言 vendor-mark 内两张 img 的 computed display 按主题互斥（light: block/none，dark: none/block），覆盖 exa/grok/opencode_go 三组；修复回归须 light/dark 双主题转绿。
- 线索：.scratch/p135/evidence.md、.scratch/p135/verify.mjs（最小复验，含 A/B/C/D 四场景）
- 处理：t316

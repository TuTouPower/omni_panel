# Task spec

## 背景

当前 usage 窗口 `window-manager.ts` 设 `maxWidth: 780`，`PopupView` 内部 `.scroll-inner` 固定纵向 flex（`globals.css:338-342`），从 472px 拉到 780px 只是留白变大，布局不变；浏览器 web 版（`vite.web.config.ts`）在宽屏下同样是单列流，浪费空间。对标 demo `data/OmniUsage-横竖屏响应式界面-spec.md` 的核心思路：用 CSS 容器查询让一份渲染层随**容器宽度**自适应，覆盖桌面窄窗 / 桌面宽窗 / 浏览器横屏三种场景。

## 参考来源与设计取舍

- **参考来源**：`data/OmniUsage-横竖屏响应式界面-spec.md` §2.2（容器查询）、§2.3（断点表）、§6（全局布局）；`data/index.html` 的 `@container` 规则与 `#app{container-type:inline-size}` 实现。该原型由不了解本项目的 agent 产出，仅作设计参照，不照抄。
- **采纳**：CSS 容器查询（`container-type: inline-size` + `@container`）而非 `@media`——按容器宽度响应，使 Electron 窗口拖宽、浏览器 web 版宽屏、未来内嵌模拟框共用一套布局逻辑；断点阈值沿用 demo 的 1024 / 640。
- **作用域收窄**：本 task 的 `@container` 断点**只控制 `ProviderOverview` 卡片网格列数**。demo 断点还含侧栏 ↔ 顶部 tab 条切换、预警栏位置切换——前者本项目 `ProviderNav` 已是顶部横向 tab（竖屏体验已成立，不引入侧栏），后者由 T005 承担，不在 T004 范围。
- **不采纳 demo 的「两个 BrowserWindow 共用一份渲染层」与「新增 Electron 1440×900 横屏主窗」**：本项目 route 机制（`usage/setting/tray/agent`）已区分 view，web 构建版（`vite.web.config.ts` → `out/web/`）已承担浏览器横屏载体；再开 Electron 横屏窗与 web 版职能重叠。放开 usage 窗 `maxWidth` + 容器查询即可覆盖桌面横屏，改动最小，且 web 版自动复用同一套断点。
- **不采纳 demo 的「横屏 / 竖屏模拟切换浮层」「设计要点面板」**：demo 自承是演示用具，非产品功能。

## 范围

- 放开 usage 窗 `maxWidth` 上限至 **1400**（不取消——取消则 4K 屏拉到极宽，auto-fill 成 10+ 列 UX 恶化），保留 `minWidth: 472`；覆盖 1080p/1440p 单屏横屏，留出 rail 264px + overview 多列空间。
- 在 `PopupView` 的滚动正文容器（`.scroll-inner`）上设 `container-type: inline-size`，建立容器查询上下文。
- **声明 `.scroll-inner`（container）→ `.overview-row`（外层两列 grid）→ `.overview-grid`（卡片 auto-fill，`:first-child`）+ `.upcoming-rail`（sticky 264px，第二列）的三层拓扑协议（T004 + T005 共享）**：`@container (min-width:1024px)` 下 `.overview-row { grid-template-columns: minmax(0,1fr) 264px; gap:12px }`，`<1024px` 退化为单列 block。本 task 仅实施 `.overview-grid` 网格化与 container 基础设施；`.overview-row` 外层包装与 rail 由 T005 实施。
- `globals.css` 新增 `@container` 断点 `≥1024px` / `640–1023px` / `<640px`，作用于 `.overview-grid` 卡片网格列数（多列 / 双列 / 单列，公式见 plan 步骤 4）。
- `ProviderOverview.tsx` 外层包 `.overview-grid`（替换现 `<>{map}</>` fragment），使 `@container` 可调节列数；卡片内部结构不变。
- 验证 `use_popup_height_report` 的 `.popup-mirror`（`PopupView.tsx:793-828`，`.popup-mirror` 类、`width:100%`）不被 container 污染——靠 `.popup-mirror .scroll-inner { container-type: normal; }` 显式隔离。
- **拖拽多列适配（D2=B）**：`ProviderOverview.tsx:22-24` 的 `onDragOver` 补 `clientX` 列判定，重写 hit-testing，使横屏多列下 ProviderCard 拖拽视觉与语义一致；单列行为不回归。

## 非范围

- 不改其他交互模型（折叠、tab 切换、备注、脱敏一律不动）；**仅拖拽排序需补 clientX 多列 hit-testing（D2=B 决策）**。
- 不加「即将重置」预警栏（T005）、趋势 sparkline（T006）。
- 不引入新 design token、不改主题切换机制。
- 不新开 Electron 横屏主窗（横屏载体由放开 maxWidth 的 usage 窗 + web 版共同承担）。
- 不做总览列表/表格视图、账号选择器 4 模式（demo 设想但本项目交互已定型，不照搬）。

## 验收标准

- [ ] usage 窗可拖宽至 1400px（`maxWidth` 上调，不再卡 780），`minWidth: 472` 保留。
- [ ] 窗宽 ≥1024px 时 `.overview-grid` 呈 `minmax(320px,1fr)` 多列网格；640–1023px 呈双列；<640px 维持现有单列。
- [ ] 拖动窗口跨越 1024 / 640 两个断点时列数实时切换，无横向滚动条。
- [ ] web 版（`pnpm build:web`）在浏览器宽屏下命中同一套 `@container` 断点。
- [ ] `use_popup_height_report` 上报的内容高度在窗宽变化时仍准确（`.popup-mirror` 已隔离，popup 自动高度不被破坏）。
- [ ] 横屏多列下 ProviderCard 拖拽补 `clientX` hit-testing 后视觉与语义一致；单列拖拽行为不回归。
- [ ] `pnpm test` 通过；PopupView 相关视觉/快照测试无回归。

## 依赖与约束

- 约束：容器查询不能作用于容器自身——`container-type` 设在 `.scroll-inner`，断点样式只能写在其后代元素上（`.overview-row` / `.overview-grid` 等），不写 `.scroll-inner { @container … }`。
- 约束：`.scroll-inner` 设 `container-type` 会**同时命中** live 视图与 `.popup-mirror` 内同名元素——是**类选择器重复匹配**（非 CSS 继承）。mirror 实为 `.popup-mirror` 类、`popup_mirror_style.width="100%"` 继承视口宽（不是「固定宽度」，也无 `.content-mirror`/`.collapsed-mirror` 类——那两个只是 ref 名）。隔离方式：`.popup-mirror .scroll-inner { container-type: normal; }` 显式覆盖；否则 mirror 内 `.overview-grid` 多列后 `offsetHeight` 变小，向主进程上报错误 `content_height`，popup 高度异常。
- 兼容性：CSS Container Queries（Chromium 105+），Electron 42 满足；不写 `@media` 回退。

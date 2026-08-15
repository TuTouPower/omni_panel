# Task spec

## 背景

DESIGN.md 合规审计（2026-08-16，四路并行扫描 src/renderer + src/web）发现浮层分层体系（阴影/z-index/毛玻璃/明暗切换）多处违反 DESIGN.md「Elevation & Depth」与「主题分支只存在于变量定义一处」：

- `dark:shadow-*-dark` 明暗切换写进组件 8 处 5 文件（`SettingsView.tsx:392/403/420`、`PopupView.tsx:920/936`、`CollapsibleCard.tsx:40`、`SkeletonCard.tsx:6`、`TokenPanel.tsx:17`）。
- 自造 z-index `z-20` 三处（`RangePicker.tsx:96`、`SelectionDock.tsx:25`、`SessionPane.tsx:321`），不在 10/60/90/100/120 五层；裸 `z-10` 三处（`SessionPane.tsx:134/314`、`ui/Dialog.tsx:47`）未用工具类名。
- 内联阴影字面量：`SessionPane.tsx:321` 手写 rgba 阴影、`ProviderCard.tsx:169/184` 手写 card 阴影、Tailwind 内置 `shadow-lg`/`shadow-sm`（`RangePicker.tsx:96`、`SessionLibrary.tsx:450/465`、`Segmented.tsx:45`）、logo 投影 `drop-shadow-[...]` 两处（`TrayMenu.tsx:200`、`PanelTitleBar.tsx:162`）。
- 非菜单浮层用毛玻璃：`SelectionDock.tsx:25` backdrop-blur（规范：毛玻璃只给菜单类浮层）。

## 契约区

### 范围

- 阴影明暗切换下沉：`--shadow-window`/`--shadow-card` 的 `-dark` 成对值改由 token 变量翻转解析，组件只写 `shadow-window`/`shadow-card`，8 处 `dark:shadow-*-dark` 清零。
- z-index 全部对号五层工具类（`z-sticky`/`z-menu`/`z-scrim`/`z-context`/`z-modal` 或 `z-[var(--z-*)]` 引用），`z-20`/`z-10` 裸数字清零；层级语义实施期按 front matter `z-index` 定义对号。
- 阴影只取 `--shadow-*` token：手写 `shadow-[...]` 与 Tailwind 内置 `shadow-lg`/`shadow-sm` 清零；logo 投影两处沉淀为 token 或 `@utility`（属品牌视觉，允许新增 token）。
- `SelectionDock` 去除毛玻璃，改实底/压暗等合规分层。

### 非范围

- 不改阴影 token 的数值定义本身；不改 z-index 五层的数值。
- 不动毛玻璃菜单（托盘/右键/卡片菜单）与对话框遮罩的既有合规用法。
- 不改组件结构与交互行为，纯样式归位。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。

<!-- /规范 -->

- [ ] AC-001：组件代码（src/renderer、src/web）中不再存在 `dark:shadow-` 变体；明暗主题下窗口/卡片投影分别解析为对应的 `-dark` 成对值。
- [ ] AC-002：组件代码中不再存在 `z-10`/`z-20` 等五层外的裸数字 z-index；全部浮层使用五层工具类或 `--z-*` 变量引用。
- [ ] AC-003：组件代码中不再存在 `shadow-[...]` 字面量与 `shadow-sm`/`shadow-lg` 等 Tailwind 内置阴影类；logo 投影经新沉淀的 token/`@utility` 表达。
- [ ] AC-004：`backdrop-blur` 仅存在于菜单类浮层与对话框遮罩；`SelectionDock` 不再含 backdrop-blur。
- [ ] AC-005：[deploy] 暗色主题下人工目检：窗口/卡片投影、弹层遮挡顺序、SelectionDock 观感无退化。
- [ ] AC-006：现有测试套件不红。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- AC-001~004：grep/类名断言可自动测试。
- AC-005：观感需真实渲染，标 `[deploy]` 人工目检。

## 上下文区

- 来源：DESIGN.md 合规审计（2026-08-16）；规范条款：DESIGN.md 427（z-index 五层）、430-436（Elevation）、368/497（主题分支单点）、436/502（毛玻璃边界）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 各浮层明暗两主题逐一截图：由 AC-005 目检覆盖，不写快照。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- grep 断言四组模式清零；globals.css 断点：阴影 token 翻转在变量层生效（构建产物或变量解析测试）。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

无

### 风险与回退

- 风险：z-index 对号错误会导致浮层遮挡顺序变化——每个点位按「下拉=menu、抽屉=context、遮罩=scrim」语义逐一核对，AC-005 目检兜底。
- 回退：git 还原即可，无数据迁移。

### 依赖与约束

- 建议在 t406（背景色）之后实施；与 t411/t413 同触会话窗口文件，顺序由 task-schedule 排。

### Finalization 时更新的 blueprint

- 无（规范已存在于 DESIGN.md，本 task 是实现对齐）。

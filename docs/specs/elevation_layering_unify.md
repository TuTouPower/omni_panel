# elevation_layering_unify

阴影与浮层层级回归 DESIGN token 体系：明暗投影变量翻转、z-index 五层、禁止内联/内置阴影类、毛玻璃边界。

## 规则

- **阴影明暗**：`--shadow-window` / `--shadow-card` 在 `.dark, [data-theme="dark"]` 变量层翻转为 `-dark` 成对值；组件只写 `shadow-window` / `shadow-card`，禁止 `dark:shadow-*`。
- **z-index 五层**：仅 `z-[var(--z-*)]`（`--z-sticky` 10 / `--z-menu` 60 / `--z-scrim` 90 / `--z-context` 100 / `--z-modal` 120）；禁止裸 `z-10`/`z-20` 等。注意：Tailwind v4 不由 `--z-*` 生成裸 `z-sticky`/`z-menu` 等工具类（t452 实测构建产物零规则），裸层级名单独写等于无 `z-index`，一律用任意值形态。
- **阴影来源**：只用 `--shadow-*` 工具类（`shadow-window` / `shadow-card` / `shadow-menu` 等）；禁止 `shadow-[...]` 字面量与 Tailwind 内置 `shadow-sm`/`shadow-lg`/`shadow-md`。
- **logo 投影**：`@utility logo-drop-shadow`（品牌 filter），禁止 `drop-shadow-[...]`。
- **毛玻璃**：`backdrop-blur` 仅菜单类浮层与对话框遮罩；SelectionDock 等非菜单浮层用实底，禁止 blur。

## 已落地位点（t415）

|项|修正|
|---|---|
|`globals.css` `.dark`|翻转 `--shadow-window` / `--shadow-card`；新增 `@utility logo-drop-shadow`|
|SettingsView / PopupView / CollapsibleCard / SkeletonCard / TokenPanel|去掉 `dark:shadow-*-dark`|
|RangePicker|`z-20`+`shadow-lg` → `z-menu`+`shadow-menu`|
|SelectionDock|`z-20`+blur → `z-sticky`+`surface-window` 实底|
|SessionPane 回底钮 / 大纲抽屉|`z-sticky`+`shadow-menu` / `z-context`+`shadow-menu`|
|Dialog / Segmented / SessionLibrary / ProviderCard 等|阴影与 z 归 token 工具类|
|TrayMenu / PanelTitleBar logo|`logo-drop-shadow`|
|状态点光晕（UpcomingResetRow / UsageRows / CpaConnectorSettings）|`shadow-[0_0_0_3px_…]` → `ring-[3px] ring-[…]`|

## 验证

- 单测：`tests/unit/renderer/styles/elevation_layering.test.ts` 源码扫描 + 变量翻转断言。
- 门禁：`pnpm designmd:check`（本 task 未改 `@theme` 导出数值）；`pnpm test`。
- 暗色目检标 [deploy]。

## 补充落位（t452）

- 三同类位点裸类换任意值（数值不变）：`SessionPane` 回底钮 `z-sticky`→`z-[var(--z-sticky)]`、大纲抽屉 `z-context`→`z-[var(--z-context)]`、`SelectionDock` `z-sticky`→`z-[var(--z-sticky)]`；RangePicker 本体行归 t451。
- DESIGN.md 层级节与本 spec 规则节同步修正裸类表述；长期约束记 `docs/blueprint/decisions.md` 024。
- 正向门禁：`tests/unit/renderer/styles/layer_class_gate.test.ts`（源码字符串扫裸类 + 四位点 pin + token 存在 + 检测器自检，含反引号模板）。

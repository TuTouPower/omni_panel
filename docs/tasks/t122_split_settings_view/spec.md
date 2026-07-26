# Task spec

## 背景

`src/renderer/views/SettingsView.tsx` 已 2352 行，是仓库最大单文件（t121 code_f005 遗留）。它混合了：通用 UI 子组件（Toggle/SetRow/Select/BarSchemeField）、AccountDialog/CpaAddDialog 两个对话框、工具函数（label/value 转换、snapshot/status 推导）、SettingsView 主体（config state、catalog、onAddAccount、各 save_config 入口）。每次改动推高审查成本，多个独立子领域纠缠。

t121 在其中新增 catalog state + onAddAccount 改写时触达该文件，reviewer 标 important（超 800 行阈值）。

## 范围

把 SettingsView.tsx 按已存在的子领域边界**纯机械搬迁**到独立文件，行为零变化：

- 抽通用 UI 子组件 `Toggle` / `SetRow` / `Select` / `BarSchemeField` → `src/renderer/components/settings/`（或就近既有组件目录）。
- 抽 `AccountDialog` → `src/renderer/components/AccountDialog.tsx`（含其 props 类型）。
- 抽 `CpaAddDialog` → 同目录。
- 抽工具函数（`trigger_background_refresh` / `main_panel_mode_*` / `floating_height_mode_*` / `log_level_*` / `bar_style_*` / `snapshot_items` / `connection_status` / `map_status`）→ `src/renderer/views/settings-view/lib.ts`（或按子领域分文件）。
- 抽 catalog 加载 + onAddAccount 流程 → `src/renderer/hooks/use-connector-catalog.ts`（reviewer f005 建议）。
- SettingsView.tsx 仅保留主体组合 + 顶层 state。

## 非范围

- 不改任何组件行为、props 形状、样式、交互逻辑。
- 不重构 onAddAccount / savePluginSettings 的业务语义（t121 已固化）。
- 不拆 main 进程或主面板（PopupView/TrayView）相关代码。
- 不调整目录约定之外的新目录结构（沿用既有 `src/renderer/components/` `src/renderer/hooks/`）。

## 验收标准

- [ ] `SettingsView.tsx` 行数降至 800 行以下（important 阈值）。
- [ ] 抽出的子组件/工具函数/hook 在新位置被 SettingsView 正确 import，无重复定义。
- [ ] `pnpm typecheck` 通过。
- [ ] `pnpm test` 全绿（既有 `settings_view.test.tsx` / `add_account_dialog.test.tsx` / smoke 不改预期，仅 import 路径调整）。
- [ ] 行为零变化：人工对照 diff，确认仅文件移动 + import 调整 + 必要的 props 类型导出，无逻辑改动。

## 依赖与约束

- 纯重构；行为不变是硬约束，reviewer 会重点比对 diff。
- 抽出文件须保持既有命名风格（`PascalCase` 组件、`snake_case` 函数/变量，见 `docs/blueprint/conventions.md`）。
- 若抽出过程中发现死代码或明显 bug，单独记 finding，不顺手改（避免污染重构 diff）。

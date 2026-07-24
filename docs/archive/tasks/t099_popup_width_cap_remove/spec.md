# Task spec

## 背景

用量面板（popup / floating）宽度被硬编码 clamp 在 472–780px（`src/main/core/main-panel/main-panel-controller.ts:20-21` 的 `MIN_PANEL_WIDTH` / `MAX_PANEL_WIDTH`），且 `src/main/window/window-manager.ts:38-39` `WINDOW_CONFIGS.usage` 又叠加 `minWidth: 472, maxWidth: 1400`。用户无法把面板拉到任意宽度，1:3 高宽比永远达不到。

历史：`d723d3d fix: resize usage panel for demo layout` (2026-06-06) 只是把上限 460 拉到 780 给 demo 腾空间，从未支持任意宽度。当前 780 是当时的临时取值，已无合理依据。

## 范围

- 移除或放宽 `MAX_PANEL_WIDTH`（`main-panel-controller.ts`）。
- 同步调整 `WINDOW_CONFIGS.usage.maxWidth`（`window-manager.ts`）到合理值或移除。
- `save_floating_bounds` 不再 clamp 到 MAX_PANEL_WIDTH。
- 补单元测试覆盖用户手动 resize 后 `save_floating_bounds` 的宽度保留行为。

## 非范围

- 不改 `MIN_PANEL_WIDTH=472`（避免面板过窄布局崩坏）。
- 不改高度控制逻辑（`popup-height-controller.ts` / floating height mode）。
- 不引入 Electron `setAspectRatio`（默认 0 不限制，无需主动设）。
- 不改 CSS 布局（`.window` / overview-grid 自适应已存在）。

## 验收标准

- [ ] floating 模式下用户拖宽度可超过 780px，重启后 floatingBounds 保留用户设置的宽度。
- [ ] popup 模式下用户拖宽度可超过 780px（仅 minWidth=472 限制）。
- [ ] `WINDOW_CONFIGS.usage.maxWidth` 不再限制用户 resize（移除或调整为合理上限）。
- [ ] `main_panel_controller.test.ts` 新增用例：模拟用户 resize 到 1200px，`save_floating_bounds` 持久化的 width 为 1200，不被 clamp。
- [ ] `pnpm test` 全量通过。

## 依赖与约束

- 决策点：`maxWidth` 是完全移除还是改为工作区宽度（`display.workArea.width`）？推荐改为工作区宽度，避免极端情况下面板超出屏幕。见 plan.md。

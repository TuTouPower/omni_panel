# Task plan

## 关键设计决策

**maxWidth 取值**：

- 方案 A：完全移除 `MAX_PANEL_WIDTH` / `WINDOW_CONFIGS.usage.maxWidth`，让 Electron 默认不限制 → 用户可拉到任意宽度包括超过屏幕。
- 方案 B（推荐）：改为工作区宽度（`display.workArea.width`）→ 允许任意拉伸但不超出当前屏幕物理上限，避免"拉到屏幕外找不到"的边角问题。
- 方案 C：提到一个更大固定值（如 2000）→ 仍是拍脑袋。

**采用方案 B**：floating 模式下 clamp 上界取 `display.workArea.width`；popup 模式 `maxWidth` 移除（popup 模式宽度随用户拖，且 popup 高度本来就限到工作区高度）。`WINDOW_CONFIGS.usage.maxWidth` 改为 `undefined` 让 Electron 默认（Electron `BrowserWindow` 不传 maxWidth 即不限制），由 main-panel-controller 在 floating 分支自行 clamp 到工作区宽度。

## 步骤与验证

1. 移除 `MAX_PANEL_WIDTH` 常量；`clamp(bounds.width, MIN_PANEL_WIDTH, MAX_PANEL_WIDTH)` 改为 `clamp(bounds.width, MIN_PANEL_WIDTH, work_area_width)`，工作区宽度从 `deps.get_display_for_bounds(bounds).workArea.width` 取 → 验证：`main_panel_controller.test.ts` 新增用例断言 1200px 宽度被保留（工作区宽度 1920 mock）。
2. `window-manager.ts` `WINDOW_CONFIGS.usage.maxWidth` 移除 → 验证：lint/tsc 通过。
3. 手工黑盒：floating 模式下拖到 1200px、1920px 验证；popup 模式下同样验证 → 验证：界面目视。
4. `pnpm test` 全量。

## 风险与回退

- 风险：用户拖到极宽后布局崩坏（overview-grid 拉跨）。
    - 缓解：CSS 已有 container query / grid auto-fit；超宽时改为单列即可，不阻断本 task。
- 风险：popup 模式下拖宽后下次打开位置错位（position_popup 用 `current.width` 居中）。
    - 缓解：`position_popup` 已实现 `clamp(x, work.x, work.x + work.width - current.width)`，保留现状。
- 回退：revert commit。

## Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：补充主面板宽度策略说明（如已有相关条目则更新）。

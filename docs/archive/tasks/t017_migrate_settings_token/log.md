# Task log

## 2026-07-21 T017 实施

### 改动

- **settings_view case 拆迁**：
    - `tests/e2e/web/settings_view.spec.ts`（新）：4 case（sidebar / plugin nav / 颜色方案 / 样式按钮），用 test_web + `SettingsPage.open_via_hash`。
    - `tests/e2e/electron/settings_view.spec.ts`（重写）：留 2 case（accounts config forms 依赖 `.acct-row` DOM / 用量标签映射字段），web SPA 无对应 UI。
- **删 `tests/e2e/electron/popup_theme.spec.ts`**：web/popup_theme（T010 示范）已有 + 多 app-title case，electron 版重复删除。
- **popup_token_panel 留 electron**：spec 顶层 `test.skip(!VITE_ENABLE_TOKEN_PANEL)`，迁 web 需 build:web 时设 env，但会让所有 web spec 的 SPA 含 TokenPanel（改变 popup_view 等断言的 DOM），副作用大。留 electron，env 触发时跑。

### 验证

- `pnpm test:e2e:web`：41 passed（T011 21 + T016 16 + T017 4 settings_view）
- typecheck 过；lint 全绿

### T016 遗留 flaky 顺手修

- `popup_drag_handle` "dragging applies drag state" 偶现 flaky（HTML5 dragstart headless 时序）：`mouse.move` steps 8→15 + 距离 20→25 + `toHaveClass(/dragging/, {timeout:5000})` 显式等。重跑 3 passed + 全量 41 passed 稳定。

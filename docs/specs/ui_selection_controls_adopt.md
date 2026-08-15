# 选择框与分段控件统一走 ui 组件

## 行为

- 会话库 `SessionRow` / `SessionCard` 与最近会话 `RecentSessionsModal` 的选择指示统一消费 `ui/Checkbox` 扩展形态：
    - `select`：agent accent 方块 + ✓（Row 20px、Card 22px），交互 `aria-pressed` + `onClick`。
    - `order`：primary 序号态装饰（选中 class `on`），父行承载点击。
- 三段手拼分段控件统一消费 `ui/Segmented`：
    - 会话库网格/列表视图；
    - ProviderCard「概览 / N账号」；
    - ProviderAccountRow 趋势窗口 1/7/30 天（`data-testid="trend-window-btn"` 保留）。
- `WorkspaceToolbar` 视图菜单走 `ui/Menu` + `MenuItem`；整行 hover 为 primary 底 + on-primary 字（不再 `surface-raised`）。

## 非范围

- 不改选择/多选/分段切换业务数据流；PaneMessageRow 原生 Checkbox + shift 多选路径不动。

## 验证

- 单元：`tests/unit/renderer/components/ui/ui.test.tsx`（select/order/Segmented 透传）；`WorkspaceToolbar.test.tsx`（Menu hover）；既有 SessionCard / SessionLibrary / provider_card_overview / provider_account_row / WorkspaceView recent 用例。
- 门禁：`pnpm test` / `pnpm typecheck`。

# Task plan

## 步骤与验证

1. 定位 overview-grid 容器与 grid item 卡片根类名 -> 验证：读 `PopupView`/`ProviderOverview`/`CollapsibleCard` + 对应 CSS，列出当前 align/height 规则
2. 写失败测试（视觉/布局）：构造同行卡片内容行数 2 vs 3，断言同行等高（可选：playwright snapshot 或 DOM getBoundingClientRect 高度断言） -> 验证：测试红
3. 改 CSS：grid `align-items: stretch`；卡片根 `height:100%` + `display:flex;flex-direction:column`；内容区 `flex:1`；背景填满 -> 验证：测试绿
4. 桌面 + web 双路构建验证 -> 验证：`pnpm start:test` 看 popup；`pnpm build:web` + playwright 看 web
5. 三断点（<640 / 640-1023 / >=1024）回归 -> 验证：无布局错位

## 风险与回退

- 风险：卡片根已有 `height:auto` 或被 `align-self` 覆盖；或父级 grid 非 stretch
- 回退：仅改最小选择器，不动 grid template；若牵动多处，缩小到 overview-grid 一处
- 风险：web 构建漏 build:web
- 回退：Step 4 显式跑 `pnpm build:web`

## Finalization 时更新的 blueprint

- `docs/blueprint/ui-views-web.md`：overview-grid 同行等高约定（若该文档记 grid 规则）

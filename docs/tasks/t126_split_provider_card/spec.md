# Task spec

## 背景

t100 code_f001/f002。

- `src/renderer/components/ProviderCard.tsx` 436 行，超实现源码 400 行 minor 阈值。
- `tests/unit/renderer/components/provider_card.test.tsx` 925 行，超测试源码 600 行 minor 阈值。

源码侧单一 `ProviderCard` 组件（memo）承载多职责：状态判定（loading/failed/empty/ready）、错误态渲染（auth/网络错误/过期 banner）、header（拖拽 grip、VendorMark、L2 分段控件）、tools、概览渲染（`UsageBarList`）、账号明细渲染（`AccountUsageRow`）、拖拽 rootProps 组装。

测试侧单文件 `describe("ProviderCard")` 混合 30 个 `it`，横跨多个功能域：基础渲染/相对时间/计数徽标、L2 分段与折叠重置、概览聚合与配额权重、颜色方案（risk-current/risk-projected/nine-cycle）、错误态（auth/网络/过期 banner）、label map（account/vendor 优先级）、折叠与菜单、拖拽。

## 范围

- 源码侧：按职责从 `ProviderCard.tsx` 抽离独立单元，使主文件 < 400 行。候选边界：
    - 错误态渲染（`render_state` 的 auth/网络错误 + `render_error_banner`）→ 独立组件文件（如 `provider_card_states.tsx`）。
    - 概览/账号明细内容渲染（`render_overview` / `render_account_detail`）→ 可抽为子组件。
    - `is_auth_error` 判定 → 可移入独立小工具。
    - 拆分须保持 `ProviderCard` 对外 props 接口与 memo 行为不变。
- 测试侧：按功能域拆 `provider_card.test.tsx` 为多个测试文件（snake_case，如 `provider_card_overview.test.tsx`、`provider_card_colors.test.tsx`、`provider_card_states.test.tsx`、`provider_card_label_map.test.tsx` 等），共享 fixture（`makeGroup`、`makePeriod`、`hex_to_rgb`、`useTheme` mock）提取到公共 helper 文件，各测试文件 < 600 行。

## 非范围

- 不改 `ProviderCard` 的任何对外行为、props、渲染结果。
- 不删/不改测试断言语义；只做移动与 fixture 归并。
- 不动 `provider-usage.ts`、`UsageBarList`、`AccountUsageRow` 等被依赖模块。
- 不重构与本 task 无关的其他组件。

## 验收标准

- [ ] `src/renderer/components/ProviderCard.tsx` 行数 < 400。
- [ ] 拆分出的源码新文件（若有）行数亦在阈值内，命名遵循 PascalCase 组件 / snake_case 文件约定。
- [ ] `provider_card.test.tsx` 拆分后各测试文件行数 < 600，共享 fixture 集中在公共 helper，无重复定义。
- [ ] 所有原 `it` 用例保留且归属清晰，无遗漏（拆分前后 `it` 数量一致）。
- [ ] typecheck 通过。
- [ ] `pnpm test` 全绿。
- [ ] 行为零变化（UI 渲染、交互、颜色、错误态、label map 优先级不变）。

## 依赖与约束

- 无前置 task 依赖；与 t124/t125 改动文件不同，可独立进行。
- 拆分为结构性搬运，不改逻辑。

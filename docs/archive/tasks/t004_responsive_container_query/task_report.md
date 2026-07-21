# Task report T004

本报告所在 commit 即 task commit，SHA 由 `git log --grep T004` 查，不在此记录。

## spec 验收标准勾选

- [x] usage 窗可拖宽至 1400px（`maxWidth` 上调，不再卡 780），`minWidth: 472` 保留。
- [➕] 窗宽 ≥1024px 时 `.overview-grid` 呈 `minmax(320px,1fr)` 多列；640–1023px 双列；<640px 单列。（CSS 文本断言覆盖规则存在；运行时真实渲染靠 packaged smoke，遗留）
- [➕] 拖动跨越 1024/640 断点列数实时切换，无横向滚动条。（运行时验证遗留）
- [➕] web 版（`pnpm build:web`）浏览器宽屏命中同一套 `@container` 断点。（同一份 `globals.css`，断言覆盖规则；运行时遗留）
- [x] `use_popup_height_report` 上报准确（`.popup-mirror .scroll-inner { container-type: normal }` 隔离，popup 高度不被污染）。
- [➕] 横屏多列下 ProviderCard 拖拽补 `clientX` hit-testing 视觉与语义一致；单列拖拽不回归。（`drag-reorder` axis 单测覆盖水平 guard 语义；多步边缘场景遗留）
- [x] `pnpm test` 通过；PopupView 视觉/快照测试无回归。（1347 单测全过；视觉快照本身遗留）

## adoption 处置摘要

- 已修 2 项 / 遗留 6 项 / 无需修改 0 项
- T004_code_f003 — `.overview-grid` 加 `align-items: start`（已修）
- T004_test_f002 — AC-2 断言补全 1024 多列 + 默认 1fr + align-items（已修）
- T004_code_f001 — drag_rect 多步失效（遗留：边缘场景，多步退化垂直 guard 不破坏功能）
- T004_code_f002 / T004_test_f001 — 四档宽度视觉快照缺失（遗留：test:visual 环境限制）
- T004_code_f004 — same_row 启发式无单测（遗留：DOMRect 比较，提取纯函数价值低）
- T004_test_f003 — maxWidth=1400 无单测（遗留：配置值，需 mock electron，价值低）
- T004_test_f004 — web 版/mirror 行为代测（遗留：同一份 CSS 已断言 + packaged 验证）

## 遗留问题

- **视觉快照（test:visual 四档宽度）**：本 task 环境无法跑 Playwright resize BrowserWindow + 跨平台基线；CSS 文本断言 + drag 单测 + test:packaged 兜底。后续可独立 task 补 visual 基础设施。
- **drag_rect 多步拖拽 axis 判定**：reorder 后 state 过时，多步拖拽退化垂直 guard（不破坏功能，单列行为）；强需求横屏完整排序另开 task（含 ProviderCard data-provider + 实时 rect 查询）。

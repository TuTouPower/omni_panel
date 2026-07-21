# Task review T004

- task：`T004_responsive_container_query`
- spec：`spec.md`（同目录，随归档移动仍有效）
- target：本 task 未提交改动（working tree）
- reviewer_focus：测试
- reviewed_at：2026-07-20 07:20 UTC+8

流程（两 agent 并行、续写规则、权限）见 AGENTS.md step 6。两 agent 各自从本模板复制，按 reviewer_focus 改文件名和 finding 前缀：`文档+代码` → `review_code.md` / 前缀 `code`；`测试` → `review_test.md` / 前缀 `test`。

## Findings

### T004_test_f001 — plan step 5 要求的四档视觉快照未补

- 严重度：high
- 位置：`tests/user_e2e/visual/popup_states.spec.ts`（无新增）；`docs/tasks/T004_responsive_container_query/plan.md:13`
- 问题：plan step 5 明确要求“补充视觉快照（Playwright `test:visual`）覆盖四档宽度——既有快照在 472 基线宽度重测，新增 640/1024/1440 三档独立快照，旧基线不删除”。当前 working tree 仅新增两条单测（`globals_css.test.ts`、`drag-reorder.test.ts`），`tests/user_e2e/visual/` 下未新增 640/1024/1440 三档快照用例，既有 `popup_states.spec.ts` 也未设置 viewport 宽度。spec AC-3 “拖动窗口跨越 1024/640 两个断点时列数实时切换，无横向滚动条”本质是视觉/布局行为，CSS 文本断言（见 `globals_css.test.ts:72-75`）只能证明规则存在，不能证明布局实际按断点切换、不产生横向滚动条。`package.json` 已配置 `test:visual` 脚本，工具链就绪。
- 建议：在 `tests/user_e2e/visual/popup_states.spec.ts`（或新建 `overview_grid.spec.ts`）以 `page.setViewportSize({width,...})` 分别在 472/640/1024/1440 四档对 `.overview-grid` 截图，`toMatchSnapshot`；并断言 `document.documentElement.scrollWidth <= window.innerWidth` 以覆盖“无横向滚动条”。`pnpm test:visual:update` 首跑基线。

### T004_test_f002 — AC-2 三档断点只断言到选择器存在，未断言网格列数

- 严重度：medium
- 位置：`tests/unit/renderer/globals_css.test.ts:72-75`、`tests/unit/renderer/globals_css.test.ts:68-70`
- 问题：AC-2 要求 ≥1024px 呈 `minmax(320px,1fr)` 多列、640–1023px 双列、<640px 单列。现有测试：
    - `defines @container breakpoints at 1024px (wide) and 640–1023px (mid)` 仅 `toMatch` 选择器文本，未断言 1024 块内 `repeat(auto-fill, minmax(320px,1fr))`。
    - `introduces .overview-grid for responsive provider card layout` 只断言 `.overview-grid {` 字符串存在（纯存在性断言），未断言默认 `grid-template-columns: 1fr`（<640px 单列契约）。
    - `forces two columns in the mid breakpoint to satisfy spec acceptance` 抓取整块并 `toMatch(/repeat\(\s*2\s*,\s*minmax\(0,\s*1fr\)\s*\)/)`，是完整断言，可作模板。
- 建议：补 `minmax(320px, 1fr)` 断言（同 `forces two columns` 模式抓取 1024 块），并补一条默认 `1fr` 断言。

### T004_test_f003 — AC-1 `maxWidth=1400` 无任何自动化覆盖

- 严重度：low
- 位置：`src/main/window/window-manager.ts:39`（`maxWidth: 1400`）；`tests/` 全量未触及
- 问题：AC-1 列“usage 窗可拖宽至 1400px（`maxWidth` 上调，不再卡 780），`minWidth: 472` 保留”。当前无单测断言 `WINDOW_CONFIGS.usage.maxWidth === 1400` 且 `minWidth === 472`，也无 e2e 拖宽验证。window-manager 是配置对象，单测廉价。
- 建议：在 `tests/unit/main/`（或对应 window-manager 单测目录）新增一条对象快照断言 `WINDOW_CONFIGS.usage` 关键字段。若 window-manager 已有测试目录就追加，避免单测碎片化。

### T004_test_f004 — AC-4 web 版同一套断点、AC-5 mirror 隔离的行为侧无代测

- 严重度：low
- 位置：spec AC-4 / AC-5
- 问题：
    - AC-4 “web 版（`pnpm build:web`）在浏览器宽屏下命中同一套 `@container` 断点”无法在 Electron 单测验证，需要 web 构建产物 + 浏览器视觉，未覆盖。
    - AC-5 “`use_popup_height_report` 上报的内容高度在窗宽变化时仍准确”只通过 `globals_css.test.ts:64-66` 断言 `.popup-mirror .scroll-inner { container-type: normal }` 文本，但 mirror 上报高度真实值未在任何 hook 集成测试中验证。
- 建议：AC-4 若不补 web e2e，至少在最终手工验证记录里留证据；AC-5 可考虑 `use_popup_height_report` 已有 hook 测试（如 `tests/unit/renderer/hooks/`）加一条“当 scroll-inner 子节点多列（模拟宽容器）时，mirror offsetHeight 等于单列参考值”的 jsdom 用例——jsdom 不支持容器查询布局，需用 stub offsetHeight，价值有限，建议优先用 packaged smoke 的人工验收证据替代。

## AC 覆盖核对

| AC                                                                                | 测试覆盖                                                                                       | 状态        |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------- |
| AC-1 maxWidth=1400，minWidth=472 保留                                             | 无                                                                                             | 缺失 (low)  |
| AC-2 ≥1024 多列 `minmax(320px,1fr)` / 640–1023 双列 / <640 单列                   | 仅选择器存在 + 双列内容；多列与默认 1fr 未断言（`globals_css.test.ts:59-83`）                  | 部分 (med)  |
| AC-3 跨 1024/640 实时切换，无横向滚动条                                           | 无（CSS 文本断言无法代测）                                                                     | 缺失 (high) |
| AC-4 web 版命中同一套 @container 断点                                             | 无                                                                                             | 缺失 (low)  |
| AC-5 `use_popup_height_report` 内容高度在窗宽变化时准确（`.popup-mirror` 已隔离） | 仅断言 CSS 文本（`globals_css.test.ts:64-66`）；行为无 e2e                                     | 部分 (low)  |
| AC-6 横屏多列拖拽补 `clientX` hit-testing 后视觉语义一致；单列不回归              | `drag-reorder.test.ts:65-109` 四条 x 轴/向后兼容用例；集成侧无 e2e（acceptable，单测代测合理） | 充分        |
| AC-7 `pnpm test` 通过；PopupView 视觉/快照无回归                                  | 未运行；视觉快照基线无新增（见 f001）                                                          | 未验证      |

## 危险模式扫描

- 删 / 反转 expect：无。
- 断言弱化（toBe→toContain）：无（新增用 `toContain` / `toMatch` 均为 CSS 文本断言合理用法）。
- timeout 增大：无。
- `.skip` / `.only`：无。
- 删测试块：无。
- `eslint-disable`：无。
- 恒假断言：无。
- 条件跳过：无。
- 纯存在性断言：`introduces .overview-grid`（`globals_css.test.ts:68-70`）仅 `toMatch(/\.overview-grid\s*\{/)`，命中（归入 f002）。
- 红灯归因：测试为 TDD 新增（x 轴、容器查询、隔离规则），实现同步落地，归因清晰；未运行 `pnpm test`，无法验证当前红/绿。

## 结论

测试新增覆盖了 AC-6（拖拽多列 hit-testing）和 AC-2 的部分断言；AC-1/AC-4/AC-5 因布局行为限制单测代测合理，但 AC-3 在 plan step 5 明确要求补视觉快照，当前未实施，是 plan 直接偏离。AC-2 多列与默认单列断言不完整，存纯存在性断言。未发现危险模式。未运行 `pnpm test` / `pnpm test:visual`，无法判红/绿。

verdict: FAIL

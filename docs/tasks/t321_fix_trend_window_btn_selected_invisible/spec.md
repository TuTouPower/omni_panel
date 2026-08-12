# Task spec

## 背景

用量面板账号卡片「趋势窗口」切换按钮（1天/7天/30天）选中态文字隐形（p144）：选中态 className 同时含基础态 `bg-transparent` 与选中态 `bg-[var(--color-accent)]`，构建 CSS 中 `.bg-transparent` 定义在 `.bg-[var(--color-accent)]` 之后层叠胜出，选中背景被强制透明；选中态文字 `text-[var(--color-surface-card)]` 把「背景色 token」当文字色，dark 下 `surface-card=#1f232c` 与透明露出的卡片深底同色，深字深底完全隐形（截图 `PixPin_2026-08-12_14-08-02.png` 即此态，仅剩 accent 边框）。light 下 `surface-card=#fff` 白字白底亦隐形。

## 契约区

### 范围

- 修复 `src/renderer/components/ProviderAccountRow.tsx` 趋势窗口切换按钮（1天/7天/30天）选中态的视觉样式：选中态背景须为 accent 蓝实底、文字高对比可见；未选中态维持现状（浅灰字透明底）。
- 补测试：将 WCAG 对比度抽样门禁（复用 `tests/e2e/web/ui_component_theme.spec.ts` 的 `sample_contrast` 思路）覆盖 usage 面板趋势按钮选中态，light/dark 两主题均断言。

### 非范围

- 不改未选中态按钮样式（浅灰字透明底）。
- 不动 Segmented / ProviderCard / Button 等其他组件的选中态样式（已扫无同类位点）。
- 不改趋势数据查询、窗口切换逻辑、aria-pressed 语义。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。

<!-- /规范 -->

- [ ] AC-001：趋势窗口选中按钮背景为实色（非透明），渲染背景色即 `--color-accent` 值。
- [ ] AC-002：趋势窗口选中按钮文字色与按钮最终背景（accent 实底）的 WCAG 对比度 ≥ 4.5（dark 与 light 两主题）。
- [ ] AC-003：趋势窗口选中按钮文字可见（computed `color` 不等于其所在卡片背景色，且与最终背景非同色）。
- [ ] AC-004：未选中按钮样式与修复前一致（浅灰文字 + 透明底 + outline 边框），回归不受影响。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- AC-001：可自动测试，e2e 读取选中按钮 computed background-color 断言非透明且等于 `--color-accent`。
- AC-002：可自动测试，e2e 抽样 fg/bg 计算 WCAG 对比度 ≥ 4.5。
- AC-003：可自动测试，e2e 断言选中按钮 computed color 与卡片背景色不同。
- AC-004：可自动测试，e2e 采样未选中按钮 computed 样式与修复前快照一致。

## 上下文区

- 来源：p144（2026-08-12 核实，`.scratch/` 复现脚本实测 light 选中按钮 bg 为卡片白、dark 全隐形）。根因与同类扫描详见 `docs/pending/todo/p144_trend_window_btn_selected_invisible.md`。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- e2e（`tests/e2e/web/`，`MOCK_FIXTURE=synthetic`，fixture `tests/e2e/fixtures/synthetic.json`）：驱动 web SPA，`/v1/config/reset` 复位后进 `/#usage`，点入含账号的 provider tab（如 Claude），对 `[data-testid="trend-window-btn"]` 的选中按钮（`aria-pressed="true"`）做 light/dark 两主题下的 computed fg/bg WCAG 对比度抽样，复用 `ui_component_theme.spec.ts` 的 `sample_contrast` / `page_background_luminance` 辅助函数（如需可从该 spec 导出复用）。
- 断言目标：选中按钮背景非透明（=accent）、文字与最终背景对比度 ≥ 4.5、文字与卡片背景非同色；未选中按钮样式回归不动。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：Tailwind 构建 CSS 层叠顺序随类集合变化而变，若修复后仍依赖特定顺序则脆；选中态改 `text-on-primary` 后若 accent 色在某主题下与 on-primary 对比不足。
- 回退：改动限于 `ProviderAccountRow.tsx` 单文件 className；git revert 即可。构建产物由 CI/打包重新生成，不手工维护。

### 依赖与约束

- 无。

### Finalization 时更新的 blueprint

- `docs/blueprint/conventions.md`：若确立「选中/强调态背景色须配 `--color-*-on` 文字色 token、禁止把 `--color-surface-*` 当文字色」的规则，则补记该约定；否则写「无」。

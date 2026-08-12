# Task spec

## 背景

用量面板采集失败提示（ProviderCardState err 分支与 ProviderCardErrorBanner）之前显示红色 `--color-error`，现在显示灰色。根因：`STATE_BASE` 含 `text-[var(--color-on-surface-variant)]`（t274 引入），失败分支裸拼接追加 `text-[var(--color-error)]`，同元素双 color 类在 Tailwind CSS 源顺序下灰色类后声明胜出，覆盖红色。见 p143。

## 契约区

### 范围

- 修 `src/renderer/components/provider_card_states.tsx` 两处失败提示（`:72` ProviderCardState err 分支、`:125` ProviderCardErrorBanner）的最终颜色为 `--color-error`（红），不再被 STATE_BASE 灰色类覆盖。
- 补两处失败分支的颜色断言，防「灰覆盖红」回归。

### 非范围

- 不改 `muted + hover:error` 位点（SelectionTray/SessionRail 等 hover 伪类正常生效，非同类）。
- 不改 `--color-error` token 值、不改其他失败提示样式。

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

- [ ] AC-001：渲染 ProviderCardState err 分支（`data-testid="card-state" data-variant="err"`）时，元素最终生效的文本颜色为 `--color-error`（红 #ef4444），非 `--color-on-surface-variant`（灰）。
- [ ] AC-002：渲染 ProviderCardErrorBanner（`data-testid="card-state" data-variant="err"`，含「采集失败：」文案）时，元素最终生效的文本颜色为 `--color-error`（红 #ef4444）。
- [ ] AC-003：`provider_card_states.test.tsx` 新增两处颜色断言（覆盖 AC-001/002 对应组件渲染），断言失败提示最终色类为 error 且不含覆盖冲突的灰色类；全量 `pnpm test` 通过。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：组件单测断言失败分支元素 className 的最终色类（error 生效、灰类被消除或用 cn()/twMerge 合并后 error 保留）。

## 上下文区

- 来源：p143（2026-08-12 task-bug 分析：`.scratch/bug-color/repro.html` 构建 CSS 实测同挂两色类 computed = rgb(104,112,133) 灰、单独 error = rgb(239,68,68) 红；回归源 t274 afd34807 给 STATE_BASE 加灰色类）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 组件单测（`provider_card_states.test.tsx`）：渲染 ProviderCardState err 分支与 ProviderCardErrorBanner，断言元素 className 含 `text-[var(--color-error)]` 且不含与其冲突的灰色类（或经 cn()/twMerge 合并后 error 保留）。需能挡住「STATE_BASE 灰类覆盖 error」回归。
- 修复方式可为：两处失败分支改用 `cn(STATE_BASE, "text-[var(--color-error)]")`（twMerge 保留后者），或从 STATE_BASE 去除灰色类改由各分支自带——以最小改动与不破坏 auth/off 分支为准。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无（纯内部 CSS 类冲突，机制已由 p143 复现确认）

### 风险与回退

- 风险：改 STATE_BASE 影响 auth/off 分支（若从 STATE_BASE 去除灰色类）；cn()/twMerge 引入需确认不破坏其它拼接。
- 回退：样式类级改动可逐处回退；补测守护回归。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无

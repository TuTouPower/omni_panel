# Task spec

## 背景

当前代码库中 `PopupView.tsx` 存在 Upcoming 卡片首次点击无法展开的缺陷，原因是 Upcoming 卡默认折叠（`false`）却与默认展开（`?? true`）的 Provider 卡共用了 `!(expanded_providers[x] ?? true)` 翻转逻辑，导致首击写回 `false`。该缺陷已导致 `pnpm test` 出现 5 个用例失败。此外，`pnpm check` 门禁脚本缺少 `pnpm test`，单测失败无法被快速拦截；部分状态判断与格式化工具函数在遇到 NaN/脏数据时缺乏防御。

## 契约区

### 范围

- 修复 `PopupView.tsx` 中 Upcoming 卡片展开/折叠翻转逻辑，使首次点击正常展开，同时保持 Provider 卡默认展开语义不变。
- 修复 `popup_view_height.test.tsx` 与 `popup_view_upcoming.test.tsx` 中的 5 个失败断言，使全仓单测恢复全绿。
- 修改 `package.json` 中的 `check` 脚本，补齐 `pnpm test` 执行链。
- 修复 `status_for_pct` 对非有限数值（NaN/Infinity）的处理，统一返回 `unknown`。
- 修复 `provider-usage.ts` 失败占位观测的时间字段语义，使用规范的时间戳或空语义。
- 修复 `utils.ts` 日期格式化函数，遇到无效输入时返回 `--` 而非渲染 `NaN`。

### 非范围

- 不重构 PopupView 整体测量与高度调和链路（由 t519 负责）。
- 不调整其他视图组件的卡片布局。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：Upcoming 卡片在初次点击时立即展开，再次点击折叠，状态翻转与当前显示状态一致。
- [ ] AC-002：全仓单测全部通过（包含此前失败的 5 个 popup 测试），零 failure 且零 error。
- [ ] AC-003：运行 `pnpm check` 会依次执行类型检查、代码规范、架构检查与单元测试，单元测试失败时返回非零退出码。
- [ ] AC-004：调用 `status_for_pct(NaN)` 和 `status_for_pct(Infinity)` 均返回 `unknown` 状态。
- [ ] AC-005：日期格式化函数传入非合法日期或 NaN 时返回 `--`，界面无任何 NaN 字符渲染。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

全部 AC 可自动测试

## 上下文区

- 来源：`docs/reviews/review_20260925_085413/adoption_decision.md`（采纳项 A1, A2, A58, A59, A60）

### 有意不测

- 无

### 测试策略

- 针对 Upcoming 展开交互编写组件单元测试，验证首次点击与连续点击状态。
- 补充 `status_for_pct` 与 `format` 工具函数在 NaN、负数、Infinity 等极端边界下的单元测试。
- 执行 `pnpm test` 和 `pnpm check` 验证完整门禁。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

无

### 风险与回退

- 风险：修复 Upcoming 状态翻转时若误改了 Provider 展开逻辑，可能导致 Provider 默认折叠。
- 回退：严格比对测试断言，确保 Provider 默认展开相关用例原样通过；若有异常通过 git 恢复。

### 依赖与约束

- 必须保持 Provider 卡默认展开的行为不变。

### Finalization 时更新的 blueprint

- `docs/blueprint/conventions.md`：更新预检门禁说明

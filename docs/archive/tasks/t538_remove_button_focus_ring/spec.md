# Task spec

## 背景

用量面板「刷新全部」按钮外圈不定期出现不透明蓝色框（`Button` 基类 `focus-visible:ring-2`），p261 只修了首次挂载一种时序，点击残留 + 窗口重显 + 其余面板持续复现（p270）。用户决策：按钮类不透明焦点环在任何场景都不需要，彻底移除。

## 契约区

### 范围

- 移除 A 类不透明焦点环：`ui/Button.tsx` 基类 `focus-visible:ring-2 ring-[var(--color-accent)]` 与 `ui/icon-link.ts` 同款环（含 web 端面板互跳 `<a>`）。
- 移除 p261 引入的 `PopupView.tsx` 焦点重置（`live_root_ref` + `window focus` 监听 + `tabIndex={-1}` 容器属性），环已不存在时该逻辑无意义。
- B 类（Input/Textarea/Select/SecretInput/AliasEditor/Checkbox/Switch/Segmented/Menu/ListRow/ProviderNav/会话弹窗行等半透明 `accent-ring` + 边框变色）保持不动。

### 非范围

- B 类表单控件焦点指示不改。
- 不引入新的焦点替代样式；按钮保留 hover/active 背景反馈。
- ECharts `emphasis.focus`（图表高亮，非 DOM 蓝框）不动。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：用量面板「刷新全部」按钮在初始显示、鼠标点击刷新后、窗口失焦再获焦后，均不显示蓝色外框（`matches(':focus-visible')` 为 false 且无 ring box-shadow）。
- [ ] AC-002：标题栏其余图标按钮（五面板切换、窗口控制）与卡片级刷新按钮同样永不显示不透明焦点环；web 端面板互跳链接亦无。
- [ ] AC-003：B 类不受影响——设置通用页输入框聚焦仍边框变蓝，开关 Tab 到仍有淡环（防过度删除守卫）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试（web e2e 真 Chromium `:focus-visible` 断言）。

## 上下文区

- 来源：p270（2026-09-30 核实：Button 基类实心环为样式源，p261 仅覆盖挂载+window focus 时序；其余见 `docs/pending/todo/p270_refresh_button_focus_ring_recur.md`）

### 有意不测

- jsdom 单元层 `:focus-visible` 断言：jsdom 无该启发式，必假绿，不补；类名存在性断言只钉实现不钉行为，p261 旧单测（`popup_view.test.tsx` 焦点归属）随重置逻辑删除而删除。
- Electron 真窗重显时序：CI 无真窗，用 web e2e 点击+重聚焦路径等价覆盖。

### 测试策略

- web e2e（`tests/e2e/web/popup_view.spec.ts` 续写）：刷新按钮初始/点击后/重聚焦后三态 `matches(':focus-visible')===false`；标题栏导航按钮抽样同断言；设置页输入框聚焦仍有边框指示（AC-003 守卫）。
- `pnpm test` 全量无回归；`typecheck`/`lint` 门禁过。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：纯键盘用户失去按钮位置指示（用户已明确接受）；`tailwind-merge` 类合并后残留 `ring-2` 片段需复查。
- 回退：revert 单个执行 commit。

### 依赖与约束

- 无前置依赖；约束：B 类一律不动，改动限 `Button.tsx`、`icon-link.ts`、`PopupView.tsx` p261 段及测试。

### Finalization 时更新的 blueprint

- `docs/blueprint/decisions.md`：按钮类去不透明焦点环产品决策（B 类保留）一句。

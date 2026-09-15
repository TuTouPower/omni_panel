# Task spec

## 背景

会话库（`SessionLibrary.tsx`）的时间筛选器（`TimeRangeFilter.tsx`）在预设模式下点击日历图标（`time-custom-button`）或在自定义胶囊模式下点击重选日历图标（`time-custom-reselect`）时，自定义日期弹层无法正常打开或瞬间闪退。根本原因是内部使用的 `RangePicker` 注册了全局 `document.addEventListener("click")` 判定外部点击以关闭面板，但在 `TimeRangeFilter` 中未向 `RangePicker` 传入包裹触发按钮的 `zoneRef`（也没有拦截 click 冒泡），导致打开面板的原生 click 事件冒泡至 document 时被 `RangePicker` 误判为「点击在区域外部」，立即触发 `on_close` 将弹层重新关闭。此外，`TimeRangeFilter` 缺乏完整的组件交互单元测试。

## 契约区

### 范围

- 修改 `src/renderer/components/session-library/TimeRangeFilter.tsx`：
    - 为预设模式下的日历触发按钮和自定义胶囊模式下的重选日历按钮提供容器 `ref` 并传递给 `RangePicker` 的 `zoneRef`（或通过受控触发容器包裹阻断外部判定），确保点击日历按钮打开后稳定展示日期输入弹层。
- 新增单元测试 `tests/unit/renderer/components/session-library/TimeRangeFilter.test.tsx`：
    - 测试预设状态下点击日历按钮稳定展示 `RangePicker`。
    - 测试自定义状态下点击重选按钮稳定展示 `RangePicker`。
    - 测试点击弹层外部区域时正常关闭弹层。
    - 测试在弹层内选择日期范围并点击「应用」时，正确触发外部传入的 `on_change` 回调。

### 非范围

- 不修改 `RangePicker.tsx` 的通用内部实现与现有的 `zoneRef` 契约（对齐 `TokenStatsView` 的既有规范用法）。
- 不更改会话历史后端的查询语义与过滤接口。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：在预设模式下点击日历按钮，自定义时间范围选择弹层（`RangePicker`）保持打开状态，展示开始/结束时间输入框及「应用」按钮。
- [ ] AC-002：在自定义胶囊模式（`preset="custom"`）下点击重选日历按钮，自定义时间范围选择弹层保持打开状态。
- [ ] AC-003：在时间范围选择弹层打开状态下，点击弹层及触发按钮外部的区域，弹层正常关闭。
- [ ] AC-004：在时间范围选择弹层内输入有效时间范围并点击「应用」，`TimeRangeFilter` 正确触发 `on_change` 并将模式切换为 custom。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

全部 AC 可自动测试。

## 上下文区

- 来源：`p230`（2026-09-15 核实，通过 `.scratch/reproduce_calendar_button.test.tsx` 复现冒泡关闭）

### 有意不测

无

### 测试策略

- 在 `tests/unit/renderer/components/session-library/TimeRangeFilter.test.tsx` 中使用 `@testing-library/react` 挂载 `TimeRangeFilter`，通过 `fireEvent.click` 模拟用户点击交互，断言 DOM 中弹层存在性与回调参数。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

无

### 风险与回退

- 风险：若 `zoneRef` 范围过大可能导致点击相邻元素时弹层无法自动关闭。
- 回退：严格将 `zoneRef` 约束在日历按钮本身及其直接包裹容器。

### 依赖与约束

无

### Finalization 时更新的 blueprint

- 无

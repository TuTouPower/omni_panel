# p230 会话面板时间筛选器日历按钮点击无反应

- 现象：在会话历史面板（SessionLibrary）点击时间筛选右侧的「📅」（自定义时间范围）按钮时，日期选择弹层闪现即关或完全不弹出，用户无法输入自定义日期范围。
- 影响：会话历史面板无法使用自定义起止时间进行精确检索，只能使用「全部/24h/7d/30d」快捷预设。
- 根因：
    1. `src/renderer/components/session-library/TimeRangeFilter.tsx` 中渲染 `RangePicker` 时未传递 `zoneRef`，且 `button` 位于 `RangePicker` 的 DOM 外侧。
    2. 当用户点击 `button` 时，触发 `setPickerOpen(true)`，React 18 重新渲染并挂载 `RangePicker` 的 `useEffect`：`document.addEventListener("click", handler)`。
    3. 原生 DOM click 事件继续冒泡至 `document`，新注册的 `handler` 立即在同一轮事件流中捕获该点击。
    4. 由于无 `zoneRef` 且 `button` 不在 `wrapRef` 内，`handler` 误判为「点击弹层外部」，立刻调用 `onOpenChange(false)` 关闭弹层。
- 测试缺口：`TimeRangeFilter` 缺乏交互单元测试，未模拟真实浏览器中的 React 事件冒泡与 document 外部点击侦听生命周期。
- 线索：`.scratch/reproduce_calendar_button.test.tsx`，对齐 `TokenStatsView.tsx` 中通过 `range_zone_ref` 包裹触发源并传给 `zoneRef` 的正确用法。
- 处理：t486

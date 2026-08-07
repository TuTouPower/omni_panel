# Spike report

## 问题

spec t257 两项 UNVERIFIED-SPIKE：(1)「最后一条消息的精确时间」数据来源；(2) VirtualMessageList 对动态行高（折叠/展开）的支持方式。

## 成功判据

- 确认会话 pane 内可获取最后一条消息的时间戳，无需扩展后端。
- 确认虚拟列表测量行高（非固定），折叠/展开不破坏渲染。

## 尝试

代码核查 `src/renderer/components/workspace/` 与 `src/shared/types/ipc.ts`：

- **SPIKE 1**：`HistoryMessageLike`（ipc.ts:403-407）含 `timestamp: number | null`；SessionPane 内 messages 数组即 pane 已加载消息，`messages.at(-1)?.timestamp` 可得最后一条消息时间。会话库/会话列表的 openedAt 仍可用作标题侧日期，但 pane 元信息日期改最后消息时间。
- **SPIKE 2**：`VirtualMessageList.tsx` 用 ResizeObserver 测量每行高度存 `heights: Map<string, number>`；`compute_message_offsets`（pane.ts）按 heights Map 计算偏移，未知行用 `estimate_height`。折叠/展开改变行高会被 ResizeObserver 重新测量，天然支持动态行高。

## 证据

- `HistoryMessageLike.timestamp` 存在；SessionPane 渲染消息行时用 `m.timestamp` + `format_time_short`。
- `VirtualMessageList` `heights` state + `ResizeObserver` on_change 更新；`compute_visible_window` 每行独立高度。

## 结论

- **SPIKE 1（时间来源充足）**：pane 内 `messages.at(-1)?.timestamp` 即为最后一条消息精确时间（毫秒），前端格式化含年月日时分秒即可。无需穿透 store/IPC 扩展字段。
- **SPIKE 2（动态行高受支持）**：虚拟列表测量行高，折叠/展开行高变化经 ResizeObserver 重测，不会渲染错乱；AC11 的滚动位置由 compute_message_offsets + prepend 补偿保证。

## 是否采纳

- 决定：是
- 理由：两项契约均现有数据/机制可支撑，改动面限定前端渲染，无需后端扩展。
- 后续 task：t257

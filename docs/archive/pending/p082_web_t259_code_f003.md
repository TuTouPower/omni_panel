# p082 web 跨面板「打开会话」丢失目标会话（t259 code f003）

- 来源：t259 code review f003（minor）
- 内容：`usageboard-web.ts` 的 `sessionHistory.open(source,env,id)` 先同步分发 onFocus 再设 hash。从用量面板会话表（TokenStatsView onOpenSession）触发时 SessionShell 未挂载 → 无 onFocus 订阅 → loc 丢失；`initial_loc()` 只读 URL `?loc`（未设置）。桌面 open_or_focus 带 route_query 能定位目标，web 有差异。面板内互跳入口（空 loc）不受影响。（2026-08-08 核实：仍在，`usageboard-web.ts:372-379` 分发先于设 hash 且不携带 loc。）
- 处理：t263

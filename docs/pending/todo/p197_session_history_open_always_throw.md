# p197 preload sessionHistory.open 用 IpcResult 包装非 IpcResult 通道，每次调用必抛 "Invalid IPC response"

- 现象：preload `sessionHistory.open` 用 IpcResult 包装非 IpcResult 通道（main handler 无 return），每次调用必抛 "Invalid IPC response"；所有调用点 `void ...open(...)` → 每次点击会话入口产生 unhandled promise rejection（桌面渲染器 console 报错）。
- 影响：所有调用点（TrayMenu.tsx:79、PopupView.tsx:711、TokenStatsView.tsx:1060/1070、panel-navigation.ts:19、SessionLibrary.tsx:353/553）每次调用产生 unhandled rejection；窗口打开靠 handler 副作用生效，功能勉强可用但 API 契约（`UsageboardApi.sessionHistory.open` 承诺 IpcResult 包裹）确定破坏。
- 根因（产品缺陷）：main/index.ts:522-528 注册的 SESSION_HISTORY_OPEN handler 无 return（箭头函数块体，`open_or_focus(loc)` 后隐式返回 undefined）；preload `session_history_full_methods.open` / `session_history_open_only_methods.open`（index.ts:201/307）走 `invoke<undefined>()`，其 `is_ipc_result(undefined)` 判定 `typeof undefined !== "object"` 失败直接 throw。修复：main handler 返回 `ok(undefined)`，或 preload 该通道改用裸 `ipcRenderer.invoke`（不校验响应信封）。
- 测试缺口：review 建议在 `is_ipc_result` 上留测试覆盖；当前无覆盖该通道响应信封形状的用例。
- 线索：docs/reviews/review_20260813_114911/review_intensive.md 第 13 行
- 来源：review_20260813_114911/review_intensive
- 处理：未开

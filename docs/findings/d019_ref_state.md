# d019 槽位模型 ref/state 双维护与订阅生命周期坑（2026-08-06）

- 来源：t224
- 结论：
    1. React 19 批处理下，批量打开循环内读 render-fresh ref 会 stale（t211 超 6 模态同款坑）：`onFocus` 连续装入多个会话时，`slots_ref` 在同批内不刷新，重复打开/超位判定失真。解法是「state + 同步 ref」双维护——所有槽位写操作先 `ref.current = next` 再 `setState`，批内连续调用读到最新。任何绕过 ref 直写 state 的路径（如异步 meta 刷新）都会造成 ref/state 分叉，后续基于 ref 的操作把已刷新的 meta 回退。
    2. 同一 loc 装入两个槽位是坏状态：columns 按 loc_key 键控（第二槽覆盖同一列数据），订阅以 webContents id 为 subscriber（同 loc 幂等共享 watcher），关闭任一槽 `unsubscribe(loc)` 整体移除订阅 + 删列 → 另一槽永久「加载中」。装入前必须 `find_slot_by_loc` 查重。
    3. 最近会话「清空替换全部槽位」若不先逐个 unsubscribe，被替换会话的 watcher 继续存活到窗口销毁（反复替换累积）。替换前必须退订旧槽位。
- 证据：t224 reviewer 基于 `session-history-ipc.ts:67`（subscriber 键控）与 `subscription-service.ts:241-243`（2s 轮询）分析；`WorkspaceView.tsx` 实现与测试。
- 影响：槽位类 UI（工作台/后续会话库/摘选）沿用「ref 双维护 + loc 查重 + 替换前退订」三不变量；异步槽位 meta 刷新必须走 ref 同步路径。
- 现状：有效

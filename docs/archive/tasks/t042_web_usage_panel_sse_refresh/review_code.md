# Task review t042（reviewer_focus: 代码）

- task：`t042_web_usage_panel_sse_refresh`
- spec：`docs\tasks\t042_web_usage_panel_sse_refresh\spec.md`
- diff_anchor：`b7d438b7a37bfa44b3f1dc9c38c3ca87d13a3f70`
- target：`git diff b7d438b7a37bfa44b3f1dc9c38c3ca87d13a3f70`
- round：1
- reviewed_at：2026-07-22 20:30 UTC+8

## Findings

无。

## AC 覆盖核对（不进 finding 表，仅作为审查证据）

- **AC1（web 端面板自动刷新）**：`usageboard-web.ts:95-101` 的 `onStateChange` 现在调用 `ensure_events()` 建立 `EventSource("/v1/events")`，并把回调加入 `state_change_cbs`。SSE message 事件在 `usageboard-web.ts:46-58` 解析 `{ instanceId, state }` 后转发给每个 cb。与 preload (`src/preload/index.ts:196-197`) 桌面端 `onStateChange` 契约一致 → 通过。
- **AC2（SSE headers + data 帧）**：`server.ts:432-437` 写入 `Content-Type: text/event-stream` / `Cache-Control: no-cache` / `Connection: keep-alive` 并 `flushHeaders()`。状态变化在 `server.ts:441-442` 以 `data: ${JSON.stringify({ instanceId, state: dto })}\n\n` 帧发送，`\n\n` 帧分隔符与 SSE 规范一致；`JSON.stringify` 默认转义字符串字面量中的 `\n`，不会破坏帧边界 → 通过。
- **AC3（断开正确 unsub，无泄漏）**：`server.ts:445-449` 的 `cleanup` 监听 `req.on("close")` 与 `res.on("close")`。Node HTTP 客户端断开时两者都会触发，`cleanup` 被多次调用；`unsub` 等价于 `listeners.delete(...)`（`runtime-store.ts:58-63` 使用 `Set.delete`，幂等），重复调用安全。req/res 随连接关闭被 GC，监听器随之释放 → 通过。
- **AC4（集成测试覆盖）**：`tests/integration/local-api/server.test.ts` 新增 `local-api SSE events` describe：① 验证 200 + `text/event-stream` + 帧内容包含 `data:` 与 `instanceId`；② 断开后 `updateState` 不抛错。`tests/unit/web/usageboard-web.test.ts` 新增 `onStateChange relays /v1/events SSE messages`：stub `EventSource`，验证消息经 `usageboard-web` 转发到订阅者 → 通过。
- **AC5（桌面端回归）**：本 task 未改 `src/main/ipc/event-ipc.ts` / `src/preload/index.ts`。新 SSE handler 与桌面 `registerEventIpc` 都通过 `runtimeStore.subscribe({ onStateChange })` 共用同一事件源，互不干扰 → 通过。
- **AC6（pnpm test 全绿）**：不在 code reviewer 职责内，留给 test reviewer / 黑盒验证。

## 实现正确性 / 资源管理审查证据

- **生命周期**：`handle_sse` 在 `check_auth` 之前（`server.ts:250-253`）——符合 `docs/specs/web-panel.md` 局域网免认证决策。handler 同步执行，`store.subscribe` 在 `flushHeaders` 之后注册，连接立即进入流式状态。
- **背压**：`server.ts:440` 检查 `res.destroyed || res.writableEnded`；`writableEnded` 对 SSE 永远 false（流不会主动 end），`res.destroyed` 拦截已断开连接。connector 状态变化频率低、帧体小（KB 级），`res.write` 背压场景可忽略，未处理返回值不构成缺陷。
- **race condition**：`flushHeaders` 与 `subscribe` 之间存在固有订阅 race（subscribe 之前的 updateState 会丢失），但这是订阅模式的固有特性，客户端首次通过 `connector.list` 拉取全量快照，最终一致性得到保证。spec 未要求 SSE 推送初始状态。
- **EventSource 单例**：`usageboard-web.ts:42-59` 的 `events_source` 为模块级单例，所有 subscriber 退订后仍保持连接（空转）。但 `use_plugins` 与页面生命周期一致，实际不会出现全部退订；资源开销可忽略（一个空闲 TCP）。spec 未要求空载关闭，YAGNI。
- **错误处理**：`server.ts:427-430` store 不存在时 503。`usageboard-web.ts:55-57` `JSON.parse` 失败时 catch 吞掉（malformed frame），不影响其他帧。EventSource 浏览器原生自动重连，与 spec 约束一致。
- **一致性**：桌面端 `event-ipc.ts:25` 使用 `state_to_snapshot_dto(state)` 转换后广播 `[instanceId, dto]`；web 端 `server.ts:441-442` 使用同一 `state_to_snapshot_dto` 后发 `{ instanceId, state: dto }`，客户端 `usageboard-web.ts:52-53` 以 `(instanceId, state)` 调用 cb。语义等价。
- **安全**：SSE handler 只写不读，`instanceId` / `state` 来自受信 runtimeStore，无客户端输入注入面。无新增安全问题。
- **命名 / 风格**：`handle_sse` / `ensure_events` / `state_change_cbs` / `events_source` 均为 `snake_case`，符合项目约定。
- **文件膨胀**：`server.ts` 516 行达到 400 minor 阈值，本 task 净增 33 行，但所有 `handle_*` 函数共享 `create_local_api_server` 闭包（访问 `connector_deps` / `token` / `observation_store` / `token_stats_store` / `web_root` 等私有状态），拆分需大规模参数化或转 class ——构成「不可拆硬约束」（共享闭包），按规范不出 finding。
- **圈复杂度**：`handle_sse` CC≈3（含两个 if），`ensure_events` CC≈2，`onStateChange` 回调 CC≈2，均远低于 minor 阈值 10。

## 结论

- 前轮 finding 复核：N/A（Round 1）。
- 本轮新发现：0 条。
- 总体判断：SSE handler 实现正确、生命周期管理幂等安全、与桌面端 IPC 推送语义一致，spec 全部 AC 在实现层得到覆盖，无规格偏离或 YAGNI 违反。

verdict: PASS

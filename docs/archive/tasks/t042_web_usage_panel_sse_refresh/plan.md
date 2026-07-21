# Task plan

## 步骤与验证

1. 红测试（server 侧）：集成测试起 local-api server，连 `GET /v1/events`，触发 `runtimeStore.updateState`，断言收到对应 SSE `data:` 帧。 → 验证：测试失败（端点不存在）。
2. 红测试（web 侧）：`tests/unit/web/usageboard-web.test.ts` 扩展，断言 `onStateChange` 注册的回调被 EventSource 消息触发（mock EventSource）。 → 验证：测试失败。
3. server.ts 加 `GET /v1/events` handler：`Content-Type: text/event-stream`，`Cache-Control: no-cache`，`Connection: keep-alive`；`connector_deps.runtimeStore.subscribe({ onStateChange(id, st) { res.write(\`data:${JSON.stringify({id, st})}\\n\\n\`) } })`；`req.on("close", unsub)`。 → 验证：步骤 1 测试通过。
4. `usageboard-web.ts`：模块级单例 `EventSource("/v1/events")`，`onStateChange(cb)` 注册 cb 到 Set 并解析消息分发给所有 cb，返回 unsub。 → 验证：步骤 2 测试通过。
5. 集成/e2e：web 面板自动刷新验证（refreshAll 后 DOM 更新）。 → 验证：`pnpm test` 对应用例通过。
6. 黑盒：`pnpm test`（含 web smoke / packaged）。 → 验证：通过。
7. 双审 + 收尾。

## 风险与回退

- 风险：SSE 长连接句柄泄漏 → 必须在 `req.close` / `res.close` 时 unsub；测试覆盖「断开后再触发 updateState 不再写已关闭连接」。
- 风险：res.write 到已关闭连接抛错 → 包 try/catch 或检查 `res.writableEnded`/`destroyed`。
- 风险：多客户端高频 updateState 导致大量写 → 沿用 runtime-store 现有防抖节奏；SSE 不额外聚合。
- 风险：EventSource 在 Vitest jsdom 环境不存在 → mock；web e2e 走真实浏览器。
- 回退：revert `server.ts` SSE handler 与 `usageboard-web.ts` onStateChange 改动，回到 no-op（即当前 bug 状态）。

## Finalization 时更新的 blueprint

- `docs/specs/web-panel.md` §5「数据新鲜度」：补充 `GET /v1/events` SSE 推送通道（connector 状态），与桌面端 IPC 推送对齐。
- `docs/blueprint/architecture.md` §4「数据流」：补充 web 端推送通道说明。
- `docs/specs/platform-services-api.md`：端点表补 `GET /v1/events`。

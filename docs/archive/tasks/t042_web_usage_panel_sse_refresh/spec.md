# Task spec

## 背景

web 端（浏览器访问 LocalAPI 面板）用量主面板数据不实时刷新，桌面端正常。

根因：

- `src/web/usageboard-web.ts` 的 `event.onStateChange` 是 `return_noop`（永不回调）。
- 用量主面板数据 hook `use_plugins()`（`src/renderer/hooks/use-plugins.ts:54`）完全依赖 `onStateChange` 推送更新 connector 快照，自身无任何轮询。
- web 端只有 `tokenStats.onUpdated` 有 10s 轮询（`usageboard-web.ts:32-35`），connector/用量面板无任何刷新机制 → 首次加载后数据冻结。
- 桌面端正常：preload 的 `onStateChange` 订阅 `EVENT_STATE_CHANGE` IPC，runtime-store 每次状态变化广播，实时推送。

`docs/specs/web-panel.md` §5 仅记录 tokenStats 轮询，遗漏用量面板刷新通道——设计缺口。

## 范围

- LocalAPI 加 `GET /v1/events` SSE 端点：连接期间通过 `runtimeStore.subscribe({ onStateChange })` 推送 connector 状态变化，与桌面端 `registerEventIpc` 共用同一事件源。
- `usageboard-web.ts` 的 `event.onStateChange` 改用 `EventSource("/v1/events")` 订阅并转回调。
- 补充 web 端用量面板数据刷新的回归测试。

## 非范围

- 不改桌面端 IPC 推送（已正常）。
- 不改 tokenStats 刷新（已有轮询）。
- 不引入 WebSocket；不做认证增强（沿 web-panel.md 局域网免认证决策）。
- 不重新设计 runtime-store / 观测存储。

## 验收标准

- [ ] web 端打开用量面板后，触发任意 connector 刷新，面板数据自动更新（无需手动 reload 页面）。
- [ ] `GET /v1/events` 返回 `text/event-stream`，连接期间 runtimeStore 状态变化被实时推送为 SSE `data:` 帧。
- [ ] SSE 连接关闭（客户端断开）时正确 unsub，无订阅/句柄泄漏。
- [ ] 有集成或 e2e 测试证明 web 用量面板数据自动刷新。
- [ ] 桌面端用量面板行为不受影响（回归通过）。
- [ ] `pnpm test` 全绿。

## 依赖与约束

- runtimeStore 已经作为 `connector_deps.runtimeStore` 注入 local-api server（`src/main/index.ts:358`），SSE handler 可直接复用。
- web 端免认证（`docs/specs/web-panel.md` §2），SSE 端点同样免认证。
- 绑 `0.0.0.0`，需考虑多客户端同时订阅；SSE 长连接关闭必须 unsub。
- EventSource 断线由浏览器原生自动重连。

# d042 web 页级 SSE 须用跨 tab 唯一 connectionId

- 来源：t414
- 结论：LocalAPI `sse_connections` 以 `connectionId` 字符串为键映射 `ServerResponse`；web 桥每页一条共享 EventSource 时，`connectionId` 必须跨浏览器 tab 唯一（如 `web-conn-${crypto.randomUUID()}`）。若多页共用同一 id（例如固定 `web-conn-1`），后开页覆盖映射，订阅 POST 与 `messagesUpdated` 会推到错误连接。
- 证据：t414 实现与 AC-006 集成（两 connectionId 互不影响）；单测「两页 bridge 实例 connectionId 互不相同」。
- 影响：web 桥 SSE、local-api 会话订阅；后续若改连接身份模型须保持跨页唯一。
- 现状：有效

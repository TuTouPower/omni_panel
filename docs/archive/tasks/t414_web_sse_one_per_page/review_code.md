# Task review t414（reviewer_focus: 代码）

- task：`t414_web_sse_one_per_page`
- spec：`docs/tasks/t414_web_sse_one_per_page/spec.md`
- diff_anchor：`aa683cba50381d2737012dc116deffabdc795ce4`
- target：`git diff aa683cba50381d2737012dc116deffabdc795ce4`
- round：1
- reviewed_at：2026-08-16 05:12 UTC+8

## Findings

本轮无 finding。

## 结论

- 前轮 finding 复核：Round 1，无。
- 规格合规：
  - AC-001～007 实现闭合：`usageboard-web.ts` 每页一条 `EventSource(?connectionId=)`；`subscribe` 不再 `new EventSource`；state/config/theme/`messagesUpdated` 同连接；`unsubscribe` 不关共享流；`open` 重挂仍打开会话；服务端 `sse_connections` + 一连接多 `subscriber_id`，关连接只清本 res 上订阅。
  - 范围：仅 web 桥 + local-api SSE 订阅模型；未动桌面 IPC、HTTP/2、renderer `subscribe` 签名。
  - 非自由发挥：保留 `POST subscribe|unsubscribe` 与旧 `?subscriberId=` 兼容路径，符合回退与混跑说明。
- 实现正确性：
  - `page_connection_id = web-conn-${crypto.randomUUID()}` 跨 tab 唯一，避免 `sse_connections` 键冲突导致推送串页（AC-006）。
  - cleanup 遍历本 res 全部 sub，并用 `sse_cleanup_should_unsubscribe` 防重连竞态误删（t279 f005 延续）。
  - 初始登记失败只删本 loc 条目、不关共享 ES；重连重挂失败靠 renderer 轮询兜底，与 t279 语义一致。
  - 客户端 `messagesUpdated` 按 `web_session_subs` 过滤，补强 unsubscribe 后不再投递。
- 代码质量：无吞错导致状态永久不一致（失败路径有明确清理/兜底）；无死代码。
- 文件过大（结论段，不进表）：`server.ts` ~1812 行、`usageboard-web.ts` ~821 行，均已超实现源码建议阈值；本 task 净增有限，未新堆不可维护分叉；拆分不在本 task 范围。
- 未进表的提示：
  - 旧客户端若仍带 `?subscriberId=` 开专属流，与共享流混跑时连接数仍可能上升（spec 风险已写，非本修复契约）。
  - `sse_client_sub_ids` 在显式 unsubscribe 后仍保留映射至连接关闭，属既有设计，便于同 id 再挂。
- 总体判断：契约 AC 在实现层闭合；关键跨页 id 唯一性已落实；无 critical / important。

### AC 实现对照

| AC | 实现锚点 |
|---|---|
| AC-001 | `ensure_events` 单例 + `subscribe` 仅入表不新建 ES |
| AC-002 | 单 ES 释放 HTTP/1.1 池；同源 `getSessions` 可发 |
| AC-003 | 服务端按 sub 写 `messagesUpdated` 含正确 loc；客户端 fan-out |
| AC-004 | `unsubscribe_loc` 不 close ES；客户端过滤 + 服务端卸 watcher |
| AC-005 | 共享 ES `open` → 对仍打开会话 `post_session_subscribe` |
| AC-006 | 每页独立 `connectionId`（UUID）；服务端按 res 隔离 cleanup |
| AC-007 | 同一 `events_source` 注册 message/config/theme |

verdict: PASS
reviewed_scope: e7b8fc8f5316e52f

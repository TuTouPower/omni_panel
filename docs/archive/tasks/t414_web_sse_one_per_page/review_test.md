# Task review t414（reviewer_focus: 测试）

- task：`t414_web_sse_one_per_page`
- spec：`docs/tasks/t414_web_sse_one_per_page/spec.md`
- diff_anchor：`aa683cba50381d2737012dc116deffabdc795ce4`
- target：`git diff aa683cba50381d2737012dc116deffabdc795ce4`
- round：1
- reviewed_at：2026-08-16 05:08 UTC+8

## Findings

本轮无 finding。

## 结论

- 前轮 finding 复核：Round 1，无。
- 改测方向复核：无迁就实现。
  - t279 桥层旧用例（专属 `?subscriberId=`、失败 close 专属流、unsubscribe close 专属流）整段删除，文件内注释写明理由；新用例用 t414 名称覆盖「共享一条 + open 后登记/重挂」，符合测试策略，禁止就地改预期却沿用旧名。
  - `onStateChange relays /v1/events SSE messages` 将「全部 listener 当 message handler」改为按 type 取 `message`，并去掉 `message_handlers.toHaveLength(1)`。`ensure_events` 现同时注册 `message` / `messagesUpdated` / `open`，旧 length=1 不再成立；继电器断言（`received` 等于 state）未改，属适配多事件类型，不是把预期改成当前输出。
  - POST body 从精确 `JSON.stringify` 改为 `toMatchObject` + `connection_id` 正则：`connection_id` 为 `web-conn-*` 动态值，且补了旧断言没有的 `connection_id` 字段，理由成立。
  - 服务端既有 t279 `?subscriberId=` 集成用例未改预期，兼容旧客户端路径。
- 本轮新发现：0 条
- 未进表的提示：
  - 桥层 `8 会话已订阅后 getSessions 经同源 fetch 返回`（`usageboard-web.test.ts:806`）stub 了 `fetch`，`Date.now() < 5000` 在 mock 下恒真，不能单独当 AC-002 饿死证据。有效证据是集成用例 `8 会话挂在同一 connectionId 后 GET /v1/sessions 5s 内 200`（真实 `createServer` + 真实 `fetch` + AbortController 5s）。符合测试策略「不要只 mock 掉 fetch」；Chrome 6 连接上限本身在「有意不测」。
  - AC-005 桥层用例断言重连 `open` 自动再 POST，未再注入 `messagesUpdated`；服务端用例在重 POST 后断言收到帧。组合覆盖 AC；若要加强，可在第二次 `simulate_open` 后注入帧并断言收到。
  - AC-004 集成用例未在 unsubscribe 后再触发 A 的 `on_update`（mock service 本来也不会停调）；页级「A 不再投递」由桥层用例注入 A/B 帧并断言 `received === ["sess-b"]` 覆盖。
  - 卸掉最后一个会话后、state/config/theme 监听仍在时共享 EventSource 不关：AC-004（B 仍在）与 AC-007（未 unsubscribe）未组合成该序列。生产 `unsubscribe_loc` 从不 `close` 共享连接。属可选边角，非 AC 缺口。
- 总体判断：7 条 AC 均有触达生产实现的测试；桥层 stub 仅系统边界 `EventSource`（策略允许）；服务端用真实 HTTP；危险模式扫描无降低覆盖或假绿。无 critical / important。
- 系统性 follow-up：无

### AC 复验方式

- AC-001 `re_verified`：读 `subscribe 8 会话 + state/config/theme 后仅 1 条 EventSource`（`usageboard-web.test.ts:786-804`），断言 `FakeEventSource.instances` 长度为 1、URL 含 `connectionId` 且不含 `subscriberId`；跑测通过。覆盖 `ensure_events` 与 `subscribe` 两处旧构造点。
- AC-002 `re_verified`：读集成用例（`server.test.ts:2870-2940`）——1 条 SSE + 8 次 subscribe 后真实 `GET /v1/sessions`，5s abort、HTTP 200、`Array.isArray(body)`；跑测 17ms 通过。桥层同名用例只作接线补充。
- AC-003 `re_verified`：桥层注入 A/B 帧并断言各投递一次且 `session_id` 不串（`usageboard-web.test.ts:865-903`）；集成解析 SSE 帧并断言 `sess-1/from-a`、`sess-2/from-b`（`server.test.ts:2514-2608`）。跑测通过。
- AC-004 `re_verified`：桥层 unsubscribe A 后 ES 未 close、实例数 1、只收到 `sess-b`（`usageboard-web.test.ts:905-955`）；集成断言 `service.unsubscribe` 只卸 A 且 B 帧仍写出（`server.test.ts:2610-2689`）。跑测通过。
- AC-005 `re_verified`：桥层同一 FakeEventSource 两次 `simulate_open`，无第二次 `api.sessionHistory.subscribe`，POST 两次且带原 `subscriber_id` + `connection_id`（`usageboard-web.test.ts:957-989`）；集成断旧连、再开同 `connectionId`、重 POST 后收到 `after-reconn`（`server.test.ts:2784-2868`）。跑测通过。
- AC-006 `re_verified`：集成两条 `connectionId` SSE 各订不同会话，cancel 页 1 后只 `unsubscribe` 页 1 的 loc，页 2 仍收到 `page2-alive`（`server.test.ts:2691-2782`）。「每页 1 条 ES」与 AC-001 同构（独立 JS 上下文）。跑测通过。
- AC-007 `re_verified`：桥层在同一实例上注册 state/config/theme 并 subscribe，注入 `message`/`config`/`theme` 后回调收到对应值，实例数仍为 1（`usageboard-web.test.ts:1019-1056`）。跑测通过。

coverage = 7 / 7

危险模式已逐条扫描：无恒真断言当 AC 证据、无注释掉的 expect、无 `.skip`/`.only`、无 test 文件 `eslint-disable`/`@ts-ignore`、无条件跳过导致无证据仍 PASS、无用 `.value=` 冒充交互。七视角（安全 / 正确性 / 契约·Breaking / 性能·资源 / 架构·可维护性 / 健壮性·可观测 / 测试·文档·规格）已扫，未命中独立 finding。

独立复验命令：`pnpm exec vitest run tests/unit/web/usageboard-web.test.ts tests/integration/local-api/server.test.ts` → 2 files / 148 passed；`-t t414` 桥层 8 passed。

verdict: PASS
reviewed_scope: e7b8fc8f5316e52f

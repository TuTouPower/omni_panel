# p187 web 面板每会话一条 EventSource 占满 HTTP/1.1 连接池

- 现象：Chrome 打开 `--cli serve` 面板会话视图（8 槽挂满）后整页转圈；点「最近会话」列表空、「最近 4 个」点不动；同源 `fetch('/v1/sessions')` 只发 `requestWillBeSent`、无 TCP/无响应。期望：服务端已 2–6ms 返回 200 时，页面 fetch 同样秒回。复现：会话视图挂满 ≥6 个槽（每槽 `subscribe` 开一条 SSE）后任意 `getSessions` / `query` / 刷新即挂；CDP `queryObjects(EventSource)` 可见 6 条 `readyState=1`。关 2 条 OPEN SSE 后同页 fetch 182ms 恢复（对照关 CONNECTING 无效）。
- 影响：web 面板（`--cli serve` / 浏览器访问 local-api）会话工作台、最近会话弹窗、槽位 query/refresh、配置/用量等一切同源 fetch；桌面 Electron IPC 路径不受影响。两处 EventSource 构造点并集见根因清单。
- 根因：产品缺陷。`usageboard-web.ts` 每个会话 `new EventSource('/v1/events?subscriberId=')`，另加 1 条全局 `EventSource('/v1/events')`；LocalAPI 为 Node HTTP/1.1；Chrome 同 host 上限 6 条长连接。8 槽 + 全局 = 9 条 SSE，6 条 OPEN 永不结束，后续 fetch 永久排队。CDP 9223 走系统代理只改变 ss 可见性，不是根因。已确认同类位点：`src/web/usageboard-web.ts` `ensure_events`（:206 全局 SSE）与 `sessionHistory.subscribe`（:645 每会话 SSE）——同 origin、同 HTTP/1.1 池，合并一条。已扫 `new EventSource` / `new WebSocket`：无第三处。桌面 `session-history-ipc` 走 IPC，不同因。omni_panel 进程自连 18263（约 18 条）未证实同机制，待确认、不并入修复范围。
- 测试缺口：`usageboard-web.test.ts` 用 FakeEventSource，只断言「subscribe 开 1 条专属 SSE」，从未触达真连接池；local-api 集成最多并行 2 条 SSE；web e2e `session_panel.spec.ts` 每次只开 1 个会话。补测：① 单测/契约：N 次 subscribe 后 EventSource 数有上界（共享 1 条或 ≤5），不随槽位线性增长；② 集成或真实浏览器 e2e：挂满 6+ 槽后 `getSessions` / 再 `query` 须在数秒内 200，不能只 mock 桥。两处构造点都要被新上界盖住。
- 线索：`.scratch/cdp_9223_diag/`（`NOTES.md`、`close_open_es_unclog.py` 关 2 条 OPEN 后 fetch 恢复；`lna_es_probe.py` 枚举 readyState）
- 处理：未开

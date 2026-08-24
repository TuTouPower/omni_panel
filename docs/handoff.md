# handoff

- 最后更新：2026-08-16
- branch：`main`
- head_commit：`eb9bb45d`
- 当前状态：CDP 9223 浏览器访问面板挂起问题**未解决**，诊断已排除服务端/代理/全局网络栈，锁定在浏览器实例对 `localhost:18263` 的请求层；详见下文第一节。会话面板对齐批次（t223-t228）已完成合并。

## 2026-08-16 CDP 9223 浏览器访问面板挂起（未解决，待接手）

- branch：`main`（诊断全程只读，无代码改动，无 commit）
- head_commit：`eb9bb45d`（诊断开始前 main HEAD）
- 现象（用户报告 + 实测）：
    - 9223 CDP 浏览器（playwright-mcp 启动的 Chrome，profile `~/.cache/ms-playwright-mcp/mcp-chrome-6dd8310`）打开面板 `http://localhost:18263/`（OmniPanel `--cli serve` web 面板，会话视图 `#session`）。
    - 浏览器整页刷新后**转圈 5 分钟+**，再点刷新有时恢复；点「最近会话 → 最近 4 个」后同样卡死。
    - 实测：页面同源 `fetch('/v1/sessions?limit=6')` 挂起 >6s 无响应；CDP `Runtime.evaluate` 偶发超时（主线程长任务占用）。
    - 已多次用 CDP `Page.navigate` 强制重载恢复页面（恢复后页面正常、数据在），但**之后会复发**。
- 已确认事实（均实测）：
    - **服务端正常**：`omni_panel --cli serve`（PID 599798，`artifacts/linux-unpacked/omni_panel`，监听 `0.0.0.0:18263`）CPU 0%；`/v1/sessions` 2ms、`/v1/sessionHistory` 40ms 返回 HTTP 200。
    - **代理正常**：WSL 全局代理 `http_proxy=http://127.0.0.1:7890`（clash，Windows 侧；`ss -tln` 看不到 LISTEN 但可连）。`curl -x http://127.0.0.1:7890 http://localhost:18263/` 1.9ms 返回——clash 对 localhost 转发正常。curl 因 `no_proxy` 含 localhost 默认直连。
    - **无头 Chrome 对照正常**：`/home/karon/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome --headless --no-sandbox --disable-gpu --dump-dom http://localhost:18263/` 秒回（带/不带 `--no-proxy-server` 都正常）。
    - **浏览器外网请求正常**：about:blank tab 里 `fetch('https://www.google.com/', {mode:'no-cors'})` 625ms、baidu 56ms 成功（走代理）。**仅对 localhost:18263 的页面 fetch 挂**。
    - **浏览器网络栈对 18263 的具体表现**：`Network` 事件链只有 `requestWillBeSent`，无 `requestWillBeSentExtraInfo`、无 `responseReceived`、无 `loadingFailed`——请求生成后**未建立 TCP 连接**（服务端侧无新连接），但页面 HTML/JS 加载正常（导航请求可完成）。
    - **杀 network service 无效**：kill PID 622756（network.mojom）后 Chrome 自动重建（841816），问题依旧。
    - **页面主线程**：renderer 622806/622807 主线程平时 `futex_do_wait`（空闲态），622807 有周期性 CPU 爆发（约每 10s +100 ticks ≈ 1s CPU，疑似 tokenStats 10s 轮询渲染）；CDP `evaluate '1+1'` 多数秒回。
    - **DNS**：`/etc/resolv.conf` → `100.100.100.100` + `fd7a:115c:a1e0::53`（Tailscale MagicDNS）；`localhost` 解析为 `::1`；omni_panel 只监听 IPv4。
    - **页面 CSP**：`connect-src 'self' ws: wss:`（server.ts 内联），同源 fetch 不受限。
    - **扩展**：4 个 service_worker 扩展（含 Dark Reader `eimadpbcbfnmbkopoojfekhnkhdbieeh` 等），**Dark Reader 未注入页面**（无 darkreader DOM/style 痕迹），profile Preferences 无自定义代理。
- 已排除假设：服务端处理慢、代理转发 localhost 不通、系统 DNS 解析挂、浏览器全局网络栈挂（外网通）、页面 JS 主线程死锁（CDP 多数响应）、Dark Reader 注入阻塞、profile 代理覆盖。
- 未定位根因（当前最可疑）：
    - **浏览器连接池/特定 host 连接状态**：浏览器到 18263 只有 1 个长连接（network service fd32，对端 46845，从诊断开始就在）。页面 8 槽位会并发 `subscribe`（EventSource SSE `/v1/events?subscriberId=...`）+ `query`（200 条 × 8）——若某 SSE/请求在该连接上挂起，后续请求排队。但连接池 1/6 有空槽、新请求应建新连接，与「无新连接」矛盾，机制未明。
    - 备选：8 槽位 SSE 订阅连接异常/重连风暴；renderer 周期 CPU 爆发与挂起协同；playwright-mcp 启动参数（`--remote-debugging-pipe`、`--disable-background-networking` 等）与某请求路径冲突。
- 遗留副作用（接手人注意）：
    - 曾对页面发过 `Debugger.enable + Debugger.pause`（超时失败），可能残留调试器状态；遇异常先 `Page.navigate` 重置。
    - 浏览器 network service 已被 kill 重建过一次（现 841816）。
    - 新增了一个 about:blank 测试 tab（`Target.createTarget` 遗留），可关闭。
    - 用户页面多次被 `Page.navigate` 强制重载（会话数据都在服务端/localStorage，槽位会从 localStorage 恢复）。
- 工具（诊断脚本已存 `.scratch/cdp_9223_diag/`，需要 python3 + websocket-client）：
    - `fetch_probe.py`：页面同源 fetch 挂起探测（OK=网络正常 / STUCK=挂起）。
    - `net_events.py`：抓 fetch 的 Network 事件链，定位卡在 DNS/连接/TCP/响应哪一环。
    - `repro_sampling.py <renderer_pid...>`：模拟「最近会话→最近 4 个」+ 主线程 CPU/wchan 采样。注意弹窗列表空时（getSessions 挂起）「最近 4 个」选不中、confirm disabled，无法真实触发——这本身是挂起症状。
    - 关键命令：`curl -w '%{http_code} %{time_total}s' http://localhost:18263/v1/sessions?limit=6`（服务端直连）；`curl -x http://127.0.0.1:7890 ...`（走代理）；`ss -tnp | grep ':18263'` / `lsof -iTCP:18263`（连接归属）；无头对照见上。
    - CDP 恢复命令：连 `/json/list` 页面 target 的 `webSocketDebuggerUrl`，发 `Page.navigate {url: 当前URL}`（browser 级执行，不受 renderer 主线程卡死影响）。
- 关键代码位置：
    - `src/main/core/local-api/server.ts`：18263 HTTP 服务、CSP、SSE `/v1/events`、`/v1/sessionHistory/subscribe`（subscriber_id 未连 SSE 回 409）、静态资源（HTML `no-store`，asset immutable）。
    - `src/web/usageboard-web.ts`：web bridge——`getSessions` 走 `GET /v1/sessions`；`subscribe` 每个会话一个 EventSource（`/v1/events?subscriberId=`，open 后 POST subscribe，失败 close）；`query` 走 `GET /v1/sessionHistory`（limit 200）。
    - `src/renderer/components/workspace/use-workspace-columns.ts`：槽位挂载 `mount_column`（subscribe + query 并发）、`refresh_all` 轮询（`FALLBACK_MS`，见 `workspace-view-helpers.ts`）、`clear_all`/`open_session`。
    - `src/renderer/components/workspace/WorkspaceView.tsx`：`confirm_recent` → `clear_all` + N×`open_session`（用户「最近 4 个」路径）。
    - `src/renderer/components/workspace/RecentSessionsModal.tsx`：弹窗 `getSessions({limit:100})`。
    - `src/renderer/components/workspace/VirtualMessageList.tsx` + `src/renderer/lib/workspace/pane.ts`：虚拟列表（仅渲染可见行，渲染量可控，非瓶颈）。
    - `src/main/cli/client.ts`：CLI 客户端（health/control，超时 2-5s，无泄漏）。
- 下一步建议：
    1. **重启 9223 浏览器**（kill 622677，观察 playwright-mcp 是否自动重建；或重启 playwright-mcp）验证是否恢复/复发——最高优先级，可能直接定位为实例运行时状态泄漏。
    2. 若复发：用 `--log-net-log` 重启浏览器抓连接级日志；或导航 `chrome://net-internals/#dns` / `#sockets` 看该 host 连接池状态。
    3. 页面内检查 EventSource 状态（`readyState`、重连次数）与 8 槽位 SSE 连接数。
    4. 查 omni_panel 自连 18263 的连接（诊断期间 13→18 个，全部 Local 端口归属 omni_panel 进程自身，仅 1 个 46845 是浏览器 network service）——疑似 serve 进程内部组件自连泄漏（connector base URL 误配 18263？server.ts 注释有 17863 撞车前科），独立问题，可能与挂起无关。
    5. 服务端 `sessionHistory`/`events` handler 加临时日志确认浏览器请求是否到达（诊断中浏览器侧无连接、请求未达服务端）。
- 已知 bug：见 `docs/bugs.md`，所有条目均已记录「修复：」行——T029 per-account error（t084 spike close 评估完结，commit `311ee3d`）、OpenCode Go 添加账号无弹窗（t098，commit `3aabba4`）、监控重置 bell 仅 Tavily（t086，commit `cf8a55d`）、添加账号弹窗黑色横线（t087 评估 + t106 实施，commit `89dec60`）、task 索引序列化 CRLF/2 空格（`scripts/repo_template/task.py`，commit `5484704`）、t099 宽度上限、t100 L2 折叠重置。
- 大重构：t076 refresh-service / t077 main index / t078 PopupView 三轮拆分均 done（t089/t090/t091 后续拆分完成）。
- 连接器迁移 ctx.status（原 t066 遗留）：t088 已完成（9 连接器删内联 helper）。

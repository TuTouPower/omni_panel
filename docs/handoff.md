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
    - **无头 Chrome 对照正常**：`/home/testuser/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome --headless --no-sandbox --disable-gpu --dump-dom http://localhost:18263/` 秒回（带/不带 `--no-proxy-server` 都正常）。
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

## 2026-08-06 t223-t228 会话面板对齐批次完成

- branch：`t228_session_alignment_finalize`
- head_commit：本分支 HEAD（`git log --grep "t228"` 查）
- 内容：会话面板对齐 demo 批次 t223→t228 串行交付。
    - t223：会话窗口单壳双页签与 demo 设计系统基座。
    - t224：工作台 8 槽位 rail 与布局切换（slot 纯函数 + WorkspaceView）。
    - t225：工作台会话面板交互与 Markdown 渲染对齐（SessionPane / react-markdown）。
    - t226：跨会话摘选与托盘复制系统（selection-store / copy-format 三格式）。
    - t227：会话库视图（搜索/筛选/排序/预览/批量打开，main 侧 query_sessions 扩展）。
    - t228：对齐收尾——web e2e 会话面板关键路径（`session_panel.spec.ts`，全量 53 passed）、旧实现残留清理确认、web 会话桥实桥、文档同步。
- 验证：各 task `pnpm test` 全量绿（t228 2460 passed）、typecheck/lint/build 通过；t228 web e2e `MOCK_FIXTURE=synthetic` 全量 53 passed（CI smoke 同参）。
- 遗留：p054（web e2e fixture 分叉）/ p055（WorkspaceView 拆分）/ p056（crypto 集成 flaky）/ p057（act 警告）/ p058（load_error 展示）/ p059（会话库拆分）见 `docs/pending`「待办」。
- [deploy] 人工验收项（真实窗口黑盒：主题持久化/拖拽换位/滚动/快捷键/真实会话打开与实时更新）留用户打包后实测，清单见 t228 spec AC3。

## 2026-08-05 t209-t213 会话历史窗口功能链完成

- branch：`t213_session_history_e2e`
- head_commit：本分支 HEAD（`git log --grep "t213"` 查）
- 内容：会话历史窗口功能链 t209→t213 全部交付。
    - t209：四端会话历史消息提取器（claude_code JSONL / opencode SQLite / kimi wire.jsonl / grok chat_history.jsonl），正文提取 + 增量游标，全程只读。
    - t210：主进程订阅/watcher 服务 + `SESSION_HISTORY_*` IPC 通道组 + 分页查询 + 会话定位器（WSL 自动探测）。
    - t211：route `history` 分栏平铺窗口（最多 6 栏、超 6 模态、跨栏选择、Markdown 复制、分页、实时刷新、空态）。
    - t212：会话历史打开入口与面板间导航（明细表 checkbox 批量 / 单击行、popup TitleBar、代理面板 header、窗口内返回跳转）；批量冷启动补发。
    - t213：端到端验收 + 文档收口（architecture/domain/specs_index/handoff）。
- 验证：各 task `pnpm test` 全量绿（存量 flaky p049/p051 隔离全绿）、typecheck/lint/build 通过；真实窗口人工验收项 [deploy] 留用户打包后实测（分栏/复制/超 6/空态/跨窗口聚焦/WSL 路径、四端真实会话、源文件只读）。

## 2026-07-24 t099 交接

- branch：`t099_popup_width_cap_remove`
- head_commit：`3aabba4084c8d16d025a14b063b9979e0effe3b4`
- task：`t099_popup_width_cap_remove`，状态 `active`。
- 已完成实现：移除 `MAX_PANEL_WIDTH=780`；floating 保存与恢复宽度改以上次窗口所在 display 的 `workArea.width` 为上限；移除 `WINDOW_CONFIGS.usage.maxWidth`；新增 1200px floating 宽度持久化单元测试。
- 已完成验证：专项 Vitest 15 passed；`pnpm typecheck`、改动文件 Prettier、定向 ESLint 通过；`pnpm test` 158 files / 1616 tests 通过；隔离 Electron 验证 floating 1200px 可保存、重启恢复，popup 可超过 780px，二者 `maximum_size=[0,0]`；`pnpm package && pnpm test:packaged` 3 passed。
- 当前停点：Step 5 双审。提示词已生成于 `.scratch/review_prompts/`；下一步仅并行启动两个 `general-purpose` subagent，分别完整读取 `code_review_prompt.md` 与 `test_review_prompt.md`，只写 `docs/tasks/t099_popup_width_cap_remove/review_code.md` / `review_test.md`。
- 双审 PASS 后：更新 `task.md` 收尾报告与 `docs/blueprint/architecture.md` 主面板宽度策略；运行 `scripts/repo_template/task.py finish t099`；归档 task 目录；仅暂存 t099 文件，排除 `docs/tasks/t103_token_stats_natural_bucket/`；单 task 单 commit。

## 2026-07-24 t099 完成

- branch：`t099_popup_width_cap_remove`
- 状态：`done`；task 已归档至 `docs/archive/tasks/t099_popup_width_cap_remove/`。
- 验证：`pnpm test` 158 files / 1618 tests、`pnpm typecheck`、改动文件 Prettier 通过；`pnpm package && pnpm test:packaged` 3 passed，隔离 Electron 已验证 1200px floating 保存/恢复与 popup 宽度解除。
- 双审：Round 1 code PASS / test FAIL（`t099_test_f001` 已修）；Round 2 code/test PASS。
- 已知门禁：`pnpm check` 仍受未改动的 `src/renderer/components/UsageRows.tsx:92` 与 `tests/integration/connector/exa_connector.test.ts:187` lint 错误阻断。

## 2026-07-24 t100 完成

- branch：`t100_l2_state_reset_on_collapse`
- head_commit：提交前 `b5d2c47`；本条随 t100 task commit 更新。
- 状态：`done`；task 已归档至 `docs/archive/tasks/t100_l2_state_reset_on_collapse/`。
- 实现：`ProviderCard` 在 `expanded === false` 时重置 `l2open`，再次展开显示概览。
- 验证：红灯覆盖旧行为；绿灯后 `pnpm test` 158 files / 1619 tests、`pnpm typecheck`、改动文件 Prettier 通过。
- 运行时验证：`BLOCKED`。隔离 Electron 已启动，但当前 harness 无法驱动原生窗口；直接访问 Vite renderer 缺 preload API，未将其作为 GUI 证据。
- 双审：Round 1 test PASS；code FAIL，仅 `ProviderCard.tsx` 与 `provider_card.test.tsx` 文件膨胀 minor，均已记录为遗留。

## 2026-07-24 t101 完成

- branch：`t101_label_map_default_expanded`
- head_commit：提交前 `4a8be33`；本条随 t101 task commit 更新。
- 状态：`done`；task 已归档至 `docs/archive/tasks/t101_label_map_default_expanded/`。
- 实现：移除标签映射折叠 state 与 chevron button，静态标题下立即加载并渲染标签映射。
- 验证：`pnpm test` 158 files / 1621 tests、`pnpm typecheck`、改动文件 Prettier 通过。
- 运行时验证：`BLOCKED`。当前 harness 无法驱动原生 Electron 窗口；自动化渲染测试覆盖标签行、无按钮、加载态、空态。
- 双审：Round 1 code PASS / test FAIL（`t101_test_f001` 已修）；Round 2 code/test PASS。

## 2026-07-24 t102 完成

- branch：`t102_remove_stale_amber_border`
- 状态：`done`；task 已归档至 `docs/archive/tasks/t102_remove_stale_amber_border/`。
- 实现：删除 `.card.stale` amber border；清理 ProviderCard、ProviderAccountRow 无消费者 `stale` class；保留 stale 徽章、错误文字及 stale 判定。
- 验证：`pnpm test` 158 files / 1622 tests、`pnpm typecheck`、改动文件 Prettier 通过。
- 双审：Round 1 修复 `t102_code_f001`、`t102_test_f001`；Round 2/3 测试 PASS。代码 review 遗留 `t102_code_f002`：`scripts/repo_template/task.py` 输出的 task 索引为 CRLF/2 空格，已记录 `docs/bugs.md`，需另立 task 修复。后续已由 commit `5484704 fix(scripts): task.py save() 用 4 空格缩进 + LF` 修复（见 bugs.md 修复行）。

## 2026-07-24 t103 完成

- branch：`t103_token_stats_natural_bucket`。
- 状态：`done`；task 已归档至 `docs/archive/tasks/t103_token_stats_natural_bucket/`。
- 实现：趋势图时间轴按本地自然日/整点切分；滑动窗口端点保持不变，首末可为 partial；小时刻度读取真实 bucket 起点。
- 验证：`pnpm typecheck`、相关 ESLint、`pnpm test` 158 files / 1628 tests 通过。未单独启动含可控 token records 的代理面板进行人工截图。
- 双审：Round 1 code PASS / test FAIL（`t103_test_f001` 已修）；Round 2 code/test PASS。

## 2026-07-25 t104 完成

- branch：`t104_cpa_account_reset_bell`。
- 状态：`done`；task 已归档至 `docs/archive/tasks/t104_cpa_account_reset_bell/`。
- 实现：CPA 厂商数据标签映射弹窗按 raw_label 显示即将重置 bell；同标签多个 gateway accountKey 全部已监控才 pressed，部分或全未监控时一并添加、全部已监控时一并移除。
- 验证：定向 renderer 74 passed；`pnpm typecheck`；`pnpm test` 158 files / 1635 tests；真实 Electron CPA 流程 1 passed。
- 双审：Round 1 code/test FAIL（`t104_code_f001`、`t104_test_f001`、`t104_test_f002` 已修）；Round 2 code PASS / test FAIL（`t104_test_f003`、`t104_test_f004`、`t104_test_f005` 已修）；Round 3 code/test PASS。
- 收尾 lint 修正后追加 Round 4 code/test PASS；无 finding。

## 2026-07-25 t105 完成

- branch：`t105_upcoming_reset_unified_card`。
- 状态：`done`（待 finish + 归档）；双审 Round 3 code/test PASS。
- 实现：将「即将重置」从 `UpcomingResetBanner`/`UpcomingResetRail` 改为 `UpcomingResetCard`，纳入 `.overview-grid`，复用 `CollapsibleCard`+`DragGrip`+`UpcomingResetRow`；保留键 `__upcoming_reset__` 同时承载 `providerOrder` 排序位与 `expandedProviders` 展开态，不新增 config 字段。
- 顺手修两个既有缺陷（挡 AC「持久化/重启后保持」）：`ProviderCard` 根补 `data-card-id`；`AppConfigStore.scheduleSave` 支持 thunk，`index.ts` 两处 bounds 保存改传 thunk，消除 debounce 窗口内 renderer 配置被陈旧快照回滚（数据丢失 bug，stack 追踪确认 `save_floating_bounds → save_config → scheduleSave`）。
- 验证：`pnpm test` 158 files / 1639 tests；E2E `upcoming_reset_card.spec.ts` 连跑 3 次全绿（Electron 下 Playwright 不触发 HTML5 DnD，改派发原生 `DragEvent`）；`pnpm typecheck`、ESLint、Prettier 通过。
- 双审：Round 1 code/test FAIL（10 条全修）；Round 2 code PASS / test FAIL（f006/f007，补 `config-save-wiring.test.ts` 与裁剪保留键测试，全修）；Round 3 code/test PASS。`max_review_round` 用户提至 5。
- 交出 head：`t105_upcoming_reset_unified_card` 分支当前 HEAD（commit 待提交）。

## 2026-07-25 t107-t111 完成（会话交出）

- branch：`t111_config_fallback_p0_protection`
- head_commit：`994139c7257b370cb6c0f0a7f91ab1012710586d`
- 完成任务：t107 manifest auth descriptor、t108 auth flow registry 替代 `VENDOR_AUTH_MAP`、t109 OAuthDeviceForm + WebLoginForm 厂商子表单、t110 修复添加账号接线匹配、t111 config-store ENOENT/空文件 fallback P0 保护。均已按工作流单 task 单 commit 提交到各自分支；t111 为当前分支最新 commit。
- t111 关键验证：`pnpm test` 165 files / 1691 tests 全绿；双审 Round 2 code/test PASS（`max_review_round=5`）。
- 已落地产物：
    - `src/main/core/config/config-store.ts`：ENOENT/空文件/仅空白字符统一走 P0 保护，目录不存在时才允许 auto_seed。
    - `src/main/core/storage/write-json.ts`：`writeFileAtomic` tmp → fsync → close → rename，句柄关闭放 `try/finally`。
    - `tests/integration/config/config-store.test.ts`、`tests/unit/core/storage/write-json.test.ts` 覆盖新行为。
    - `docs/specs/config_fallback_p0_protection.md`、`docs/specs_index.md`、`docs/blueprint/architecture.md` 已同步。
- 后续 backlog：t112 Kimi device code OAuth 登录、t113 Kimi connector 解析 boosterWallet/totalQuota/membership、t114 token-stats collector 扫描状态落盘。
- 用户指示完成 t111 后结束，t112 未启动实现。已创建空 task 目录 `docs/tasks/t112_kimi_oauth_device_code/` 与分支 `t112_kimi_oauth_device_code`（仅模板文件，未提交），接手时可直接从 `scripts/repo_template/task.py show t112` 与 spec/plan 开始。

## 2026-07-26 t121+t122 完成

- branch：`t121_add_account_manifest_catalog` / `t122_split_settings_view`
- head_commit：`bacf5a32`（t121 merge）/ `3ba76c28`（t122 merge）
- 状态：`done`；task 已归档至 `docs/archive/tasks/t121_add_account_manifest_catalog/`、`docs/archive/tasks/t122_split_settings_view/`。
- t121 实现：`connector:catalog` IPC 从 manifest 出目录（不读 config/墓碑/密钥）；`config:createInstance` 按 manifest_id 直接建实例并清对应墓碑；`AddAccountDialog` 优先按 catalog 解析 auth，grok/exa/opencode_go/cpa 在无实例+墓碑场景下正确渲染对应表单。
- t122 实现：`SettingsView.tsx` 2352→724 行，按领域拆出 `src/renderer/views/settings-view/lib.ts` 与 `sections/{about,accounts,appearance,data,general}_section.tsx`，行为零变化。
- 验证：t121 `pnpm test` 1749/1749 绿；t122 `pnpm test` 1749/1750（config-store EPERM 为 Windows 已知 flaky）。
- 遗留 finding：
    - t121_code_f005：`SettingsView.tsx` 2345 行超 800 行 important 阈值，本 task 未拆，后续 task 抽出 `AccountDialogHost` / `useConnectorCatalog` / `useAccountDialogState`。
    - t121_test_f006：`OAuthDeviceForm` 表单层未断言 secret_name 绑定到内部 input；on_save secrets 断言已覆盖端到端 secret_name 流向，增益有限。
    - t122_code_f002：`AccountDialog`→`views/lib` 反向依赖由拆分暴露；待后续将 `session_meta` 迁至 `src/renderer/lib/`。
    - t122_code_f003：`accounts_section.tsx` 436 行略超 minor 阈值，未达 800 硬限；后续可拆 `AccountsList`。

## 2026-07-31 对齐 repo_template（工作流迁移）

- branch：`t169_align_scripts_layer`
- head_commit：本分支 HEAD（本次迁移工作区 commit，`git log --grep "align repo_template"` 查）
- 内容：本仓工作流对齐 `\wsl.localhost\Ubuntu-22.04\home\testuser\testuser_ubuntu\repo_template`。
    - 脚本层：`scripts/repo_template/task.py`（2216 行，front matter 状态权威 + worktree 链）+ `_id_scan.py`/`pending.py`/`findings.py`/`render_review_prompts.py`/`check_review_status.py` 全量移植；Windows 适配（git 子进程 UTF-8 encoding、worktree 路径 resolve 统一，见 `docs/findings` d001）。`tests/repo_template/` 197 用例 + `pnpm test` 1910 用例全过。
    - 数据迁移：169 个 task 目录补 `task.md` front matter（12 字段 schema）；旧 `task_report.md`/`log.md` 保留；`docs/archive/tasks/_pre/` 历史快照移至 `docs/archive/_pre_tasks/`。
    - 文档骨架：`docs/pending`（原 `bugs.md` 10 条全修复→`archive/bugs_2026_07.md`；`legacy_backlog.md` 9 条「暂不建」→ pending「不办」节 p001–p009）；`docs/findings`；模板迁到 `docs/tasks/task_template/`、`docs/spikes/report_template.md`、`docs/reviews/prompts/`；旧 `docs/templates/` 删除。
    - AGENTS.md 重写为路由版（skill 路由 + 目录权责，本仓特有约束保留）。
    - 9 个 skill 移植（`.agents/skills/` + `.claude/skills/` 软链）+ `merge_guard.py` PreToolUse hook（`.claude/settings.json`）。
    - `docs/blueprint/testing.md` 建立（门禁类别清单：单测/typecheck/lint/build 全绿）。
- 注意：`docs/bugs.md` 与 `docs/legacy_backlog.md` 已迁 `docs/archive/`（`bugs_2026_07.md` / `legacy_backlog_2026_07.md`），本文件历史节中的旧引用指向归档位置。
- 后续：首个真实 worktree task 执行时实测 pnpm + node_modules + better-sqlite3 ABI 适配（见 `docs/blueprint/testing.md` worktree 节）。

# Code Review Bundle — architecture | chunk 3

- Perspective: `architecture`
- Chunk: `3`（bundle index `% 6 == 2`，index 0-based）
- Reviewed: 19 bundles / 61 files（全部分配文件逐行审读）
- HEAD: `51ea3972efefea568cc2fba3e530ea5f69296182`（`chore(task): rebuild task indexes`）

审查范围（按 `bundle.json` id 排序后 index `% 6 == 2`）：
connectors_codex / connectors_glm / connectors_tavily / scripts / src_main_core_config / src_main_core_observation / src_main_core_session_history / src_main_index_ts / src_preload_oauth_api_ts / src_renderer_components_AccountRow_tsx / src_renderer_components_ConfirmDelete_tsx / src_renderer_components_DragGrip_tsx / src_renderer_components_ProviderNav_tsx / src_renderer_components_TokenPanel_tsx / src_renderer_components_VendorCard_tsx / src_renderer_components_session_library / src_renderer_hooks / src_renderer_vite_env_d_ts / src_web_usageboard_web_ts。

---

- [Medium][60] src/renderer/components/TokenPanel.tsx:20 — Segmented 时间范围控件是死交互，`range` state 从不影响任何输出 — `const [range, setRange] = useState("today")` 只被 `Segmented` 的 value/onChange 读写，`display_value`（:22-25）只依赖 `total_tokens`/`has_real_data`，与 range 无关；全仓唯一消费方 `PopupView.tsx:893` 固定传 `<TokenPanel has_real_data={false} />`（不传 total_tokens），面板永远显示「暂无历史数据」。用户点击 今天/最近一周/最近一月 无任何效果，是带误导性的空控件。修复建议：要么实现 range→取数逻辑，要么删除 Segmented 与 range state（保留纯展示）；若属规划中功能，加 TODO 并禁用控件。

- [Medium][60] src/renderer/components/session-library/SessionLibrary.tsx:207 — `content_hits` state 只写不读，死状态 — `const [, set_content_hits] = useState<Set<string>>(new Set())` 把值解构丢弃，仅在 :224/:230/:261 调 setter（含 `set_content_hits(new Set(response.hits))`），渲染/过滤从不读取；内容搜索的命中集没有任何下游消费，连同 `response.hits` 的落点一起是悬空代码。修复建议：删除该 state 与三处 setter（及 :253-262 中仅用于填它的 `response` 分支化简），或实现命中高亮/计数后接回。

- [Medium][65] src/main/core/session-history/claude-code-extractor.ts:14 — 提取器三端重复同一套解析样板 — `pick_text_from_content` 逐字复制于 claude-code-extractor.ts:14-28、grok-extractor.ts:20-34、kimi-extractor.ts:17-32；三端 `*_first_user`（claude:55-75、grok:84-104、kimi:96-117）与全量/增量提取骨架同样平行重复；opencode 端另有自己的 row→message 映射。四端裁剪规则（仅 text/user+assistant）本质同一语义，未来改规则（如允许 thinking）需同步 4 处。修复建议：抽共享 `pick_text_from_content` 与「按行解析+字节游标」通用 helper（保持各端 record 字段差异为参数），减至每端只留厂商专属映射。

- [Medium][60] connectors/glm/manifest.json:18 — 脚本型连接器的 manifest `poll.request` 是死配置，与脚本重复声明 — glm/tavily 的 manifest 同时声明 `poll.request`（endpoint/path/method）与 `script`；运行时 `refresh-service.ts:179` 有 `script` 时走脚本、无脚本才走 tier1 `execute_poll`（`tier1-poll-executor.ts:41` 依赖 `manifest.poll`），即 glm/tavily 的 `poll.request` 永不生效，而脚本内 `ctx.http.get_json("default", "/api/monitor/usage/quota/limit"...)`（connector.ts:85）/ `/usage`（tavily connector.ts:41）再次硬编码同一 path——路径/方法在 manifest 与脚本两处维护，改一处漏一处即静默失效。修复建议：脚本型 manifest 删除 `poll` 块（保留 endpoints），或脚本改为读 manifest 的 path/method 生成请求，单一事实源。

- [Medium][60] src/web/usageboard-web.ts:256 — `connector`/`plugin` 命名空间逐字重复且 `connector.snapshot` 返回错误形状的桩 — `connector`（:256-268）与 `plugin`（:269-279）六个方法实现完全相同，仅名字不同；`connector.snapshot: () => Promise.resolve({})` 返回 `{}` 而非 `ConnectorSnapshotDTO`，全仓 grep 无任何调用方（仅 `connector.snapshot` 数据属性被用），是遗留死面。修复建议：删 `plugin` 命名空间与 `snapshot` 桩（或改为真调用 `/v1/connectors` 映射），保留单一实现。

- [Medium][55] scripts/token-stats-spike.ts:1 — 遗留 Phase 0 spike 长期驻留 scripts/，硬编码个人环境 — 该文件自 2026 单次提交（302e509f）后从未更新，仍含硬编码 `wsl_distro = "Ubuntu-22.04"`、`wsl_user = "testuser"`、UNC 路径（:17-21）与文件级 `eslint-disable`（:1）；其结论已被 token-stats 正式实现（readers/collector）取代，作为历史产物放在 scripts/ 会误导新读者（误以为当前数据源仍走这些路径）。修复建议：迁至 `docs/spikes/{sid}/code/`（项目约定 spike 产物位置）或标注已归档；如保留运行入口需参数化 distro/user。

- [Medium][55] src/main/index.ts:545 — grok/kimi 活跃实例 id 提取逻辑重复 4 份 — 相同模式（`definitions.find(provider===grok/kimi)` → `plugins.filter(enabled && executablePath===def)` → `.map(instanceId)`）在 onConfigSaved 内（:545-554、:555-564）与启动期（:988-999、:1001-1012）各重复一次，共 4 份；任一处改动（如过滤条件）极易漏同步。修复建议：抽 `active_instance_ids(provider): string[]` helper（依赖 allDefinitions + 当前 config 快照），4 处统一调用。

- [Medium][55] src/preload/oauth_api.ts:26 — grok/kimi OAuth API 工厂近乎逐字重复 — `create_grok_oauth_apis`（:26-57）与 `create_kimi_oauth_apis`（:59-89）仅 IPC channel 名与泛型参数不同，结构/签名完全一致，`settings_api` 中 `login_status` 又各转发一次 `readonly_api`。修复建议：参数化单工厂 `create_oauth_apis<TReadonly, TSettings>(channels: { loginStatus, loginStart, loginPoll, loginCancel, logout, refresh })`，保留两个类型化导出。

- [Medium][55] src/renderer/components/session-library/session-library-utils.ts:15 — source→agent 派生助手分散多文件、语义重叠 — `agent_abbrev`（本文件）、`agent_friendly`/`agent_slug`（lib/session-history/markdown.ts）、`agent_accent`/`vendor_id_for_source`（lib/workspace/slots.ts）各自独立实现 claude*code/opencode/kimi_code/grok 的映射；`recent_sessions`（subscription-service.ts:615）又用 `source.replace(/*/g,"-")`内联派生。新增厂商需同步 4-5 处。修复建议：在`lib/session-history`或 shared 层集中一个`source_meta(source)` 返回 {friendly, slug, abbrev, accent, vendor_id}，各处消费。

- [Low][50] src/web/usageboard-web.ts:161 — 常驻 10s 轮询定时器永不清除且无订阅也空转 — `setInterval(..., POLL_MS)` 在 `create_web_usageboard()` 内创建后从不 clear；`token_stats_callbacks` 为空时每 10s 仍唤醒一次空循环；若未来多实例化（HMR/重复 install）会叠加多个定时器。修复建议：在首个 subscriber 注册时启动、最后一个注销时清除（或至少空集合时跳过），并暴露 dispose。

- [Low][50] src/web/usageboard-web.ts:255 — web shim 硬编码 `platform: "win32"`，web 面板品牌/行为失真 — 桌面端 platform 来自 process.platform；web 端固定 win32 使 `about_section.tsx:47` 永远显示「Windows · x64」，`PopupView.tsx:678-679` 的 titlebar 拖拽分支按 win32 处理（macOS 宿主浏览器打开 web 面板也会得到可拖拽 titlebar）。修复建议：`navigator.userAgent`/`navigator.platform` 推导映射到同一枚举，与桌面语义一致。

- [Low][50] src/main/core/config/config-store.ts:280 — compare-and-save 用整份 `JSON.stringify` 判等，脆弱且无规范化 — `enqueueCompareAndSave` 以 `JSON.stringify(committed) !== JSON.stringify(base)` 判定并发冲突；doSave 落盘前 `sortKeys` 但 `cached_config` 存的是原始对象，两对象键序不同（zod 重建 vs 透传）时值相同也会误判 conflict，且每次 save 序列化全树 O(n)。修复建议：比较前对双方跑 `sortKeys`（或存 committed 时即存规范化副本），消除键序敏感性；或引入基于内容的 hash/版本号。

- [Low][50] src/main/index.ts:1257 — before-quit 中异步清理 fire-and-forget，与 will-quit 等待集不一致 — `void local_api?.stop()`、`void close_all_proxy_agents()`、`void runtimeStore.flushPendingCache()`（:1260/:1278-1279）在同步的 before-quit 内不等待；will-quit（:1287-1310）仅对 configStore/logging 做 preventDefault+await，其余清理在第二次 `app.quit()` 后随进程退出中断，代理连接池/本地 API 可能未经优雅关闭。修复建议：把这三项并入 will-quit 的 Promise.all（或统一用单一 quit 协调器），明确退出顺序与等待集。

- [Low][50] src/renderer/hooks/use_connector_catalog.ts:5 — 共享 hook 反向依赖 view 模块 — `useConnectorCatalog` 从 `../views/settings-view/lib` import `log`，使 hooks 层耦合到具体视图；settings-view/lib.ts 还同时承担常量/映射工具，层级职责混杂，其它视图复用该 hook 时被迫引入 settings 视图模块。修复建议：把 `createLogger` 实例与 label↔value 映射工具下沉到 `lib/`（如 `lib/settings-utils.ts`），view 层 re-export 兼容。

- [Low][45] src/main/core/observation/observation-store.ts:92 — 一次性数据清理固化在每次打开的迁移路径 — `migrate_observation_schema` 内硬编码 `DELETE ... provider='kimi' AND metric_id='kimi:total_quota'`（:92-101），每次 `create_observation_store`（含测试与未来只读 worker 打开）都会执行该语句；迁移函数混入了「数据清理」职责且无版本条件。修复建议：按 schema_version/迁移批次标记，仅执行一次后记录（如 migration 表或 meta 键），避免与 schema 列迁移并列。

- [Low][45] src/main/core/session-history/session-locator.ts:41 — 模块级可变单例状态（含定时器） — `resolution_cache`/`session_index`/`wsl_user_cache`/`index_flush_timer` 均为模块级全局（:41-55），多窗口/多 index_dir 切换依赖 `clear_resolution_cache()` 测试钩子与 dir 隔离逻辑维持正确；一旦未来出现多实例（如多 userData 并存）易串状态。修复建议：将状态收进 `create_session_locator(paths)` 实例化（保持现有函数签名薄封装），或至少注释声明单例约束。

- [Low][40] src/renderer/hooks/use-config.ts:1 — 8 个 hook 文件顶部统一 `eslint-disable react-hooks/rules-of-hooks` — use-config/use-plugins/use-route/use-popup-height-report/use_dnd_handlers/use_popup_derived/use_provider_tab_drag/use_tab_navigation 均以文件级 disable 开头，但代码本身按常规 hooks 顺序调用，未见必须豁免处（疑似复制粘贴的惯性）；整文件禁用使该文件内未来的违规（条件调用/循环调用）不再被规则拦截。修复建议：逐个文件去掉 disable 后跑 lint，确需豁免处改用行内 `// eslint-disable-next-line` 并注明原因。

- [Low][40] connectors/codex/connector.ts:49 — local 脚本对会话目录整树无界读取，无规模防护 — `ctx.files.list` 两目录后对每个文件 `ctx.files.read` 全量读入逐行 JSON.parse（:51-68），无扩展名/大小过滤、无并发限制，长历史（数千会话 JSONL）时单轮全量扫描成本无上限且纯串行。修复建议：按文件大小阈值跳过超大文件、限定扩展名（.jsonl），并评估是否需要增量游标（与 session-history 提取器一致）。

- [Info][35] scripts/smoke_check.md:39 — 文档与运行模型错位 — 「关闭所有窗口，确认进程退出（或任务管理器结束进程）」与 `index.ts:1342` `window-all-closed` 不退出（托盘常驻）的设计矛盾，新打包验证者按文档会误判常驻为 bug。修复建议：改为「关闭窗口后确认托盘常驻、经托盘退出后确认无残留进程」。

- [Info][30] src/main/core/session-history/head-read.ts:49 — 死赋值 — `else if (last_nl < 0) { last_nl = -1; }` 分支中 last_nl 已为 -1，赋值无效果，属冗余防御。修复建议：删除该 else 分支（或改为显式初始化注释）。

---

Reviewed files（61，均以 HEAD 内容审读）：

- connectors/codex/{connector.ts,manifest.json}、connectors/glm/{connector.ts,manifest.json}、connectors/tavily/{connector.ts,manifest.json}
- scripts/{designmd.ts,export-schemas.ts,gen-build-info.ts,package-and-run.ts,smoke_check.md,token-stats-baseline.ts,token-stats-spike.ts}
- src/main/core/config/{auto-seed.ts,config-store.ts,secret_param_keys.ts,secrets-store.ts,types.ts}
- src/main/core/observation/observation-store.ts
- src/main/core/session-history/{claude-code-extractor.ts,grok-extractor.ts,head-read.ts,kimi-extractor.ts,opencode-extractor.ts,session-locator.ts,session-path-index.ts,subscription-service.ts,types.ts}
- src/main/index.ts
- src/preload/oauth_api.ts
- src/renderer/components/{AccountRow.tsx,ConfirmDelete.tsx,DragGrip.tsx,ProviderNav.tsx,TokenPanel.tsx,VendorCard.tsx}
- src/renderer/components/session-library/{AgentFilterChips.tsx,SelectionDock.tsx,SessionCard.tsx,SessionLibrary.tsx,SessionList.tsx,SessionPreview.tsx,SessionRow.tsx,session-library-utils.ts}
- src/renderer/hooks/{use-config.ts,use-device-login.ts,use-echarts.ts,use-now-tick.ts,use-plugins.ts,use-popup-height-report.ts,use-popup-ui-config.ts,use-resize-observer.ts,use-route.ts,use_connector_catalog.ts,use_dnd_handlers.ts,use_popup_derived.ts,use_provider_tab_drag.ts,use_tab_navigation.ts}
- src/renderer/vite-env.d.ts
- src/web/usageboard-web.ts

执行过的只读检查：

- `git rev-parse HEAD`（51ea3972）；`git log --oneline -N -- <file>` 核查 token-stats-spike.ts / TokenPanel.tsx / claude-code-extractor.ts / use_connector_catalog.ts 历史
- Grep 追踪：`saveIfBaseMatches` 调用方（config-ipc.ts:195）、`TokenPanel`/`content_hits` 使用点、`pick_text_from_content` 重复计数、`connector.snapshot()` 调用方（无）、`.platform` 消费点（PopupView/about/general section）、manifest `poll`/`script` 运行时分支（runtime.ts:139、refresh-service.ts:179、tier1-poll-executor.ts:41）
- 读上游契约：src/main/core/connector/host-io.ts（ConnectorContext）、src/main/ipc/config-ipc.ts:140-206（handleConfigSave 冲突路径）、src/renderer/views/settings-view/lib.ts（log 导出）、src/renderer/views/PopupView.tsx:670-699（platform/token panel 消费）、src/renderer/components/ui/Dialog.tsx（Escape 处理，确认无重复）
- `package.json` scripts 核查（export-schemas/gen-build-info 的 cwd 假设；无 "type":"module"，`__dirname` 可用）

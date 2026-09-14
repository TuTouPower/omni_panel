# Review Bundle: robustness | chunk 1

- Perspective: robustness（错误处理 / 失败回滚 / 超时 / 重试 / 幂等 / 竞态防护 / 日志上下文 / 静默失败 / 恢复能力；不涉及安全）
- Chunk: 1（审查 `bundle.json` 中 `index % 6 == 0` 的 bundles，index 从 0 起）
- Reviewed bundles: 19 / 111；Reviewed files: 83
- HEAD: `51ea3972efefea568cc2fba3e530ea5f69296182`（2026-08-13 11:23:05 +0800，chore(task): rebuild task indexes）
- 范围: connectors_antigravity、connectors_firecrawl、connectors_minimax、root_config_03、src_main_config_callbacks_ts、src_main_core_main_panel、src_main_core_scheduler、src_main_core_vault、src_preload_index_ts、src_renderer_App_tsx、src_renderer_components_Card_tsx、src_renderer_components_CpaLabelMapDialog_tsx、src_renderer_components_ProviderAccountRow_tsx、src_renderer_components_SettingsForm_tsx、src_renderer_components_UsageBarList_tsx、src_renderer_components_provider_card_content_tsx、src_renderer_components_ui、src_renderer_styles、src_shared_types

## Findings

- [Medium][68] connectors/firecrawl/connector.ts:59 — Promise.all 并行拉取部分失败整体失败 — `fetch_usage("/v1/team/credit-usage", ...)` 与 `fetch_usage("/v1/team/token-usage", ...)` 经 `Promise.all` 并行；任一请求失败（接口 5xx/超时/返回格式异常）即 reject 整个 `main()`，两个指标全部丢失，已成功获取的那一侧数据也作废。运行时将整个 connector 标记 failed 并插入 stale 副本（refresh-service.ts:489-505），直到下一轮调度才恢复。Firecrawl 两接口相互独立，一侧故障不应拖垮另一侧。修复：改用 `Promise.allSettled`，成功侧照常产出 observation，失败侧通过 `ctx.report_failed_account(...)` 上报（与 minimax connector.ts:143 的做法对齐），保底一方可用。

    - 证据：`ctx.http.get_json` 抛错 → main reject → `run_connector` 返回 error → refresh-service 捕获后整实例失败（retry 3 次均失败后 stale 标记）。net-client 有 15s 超时（net-client.ts:238），所以是"慢失败+全丢"而非挂死。
    - 修复建议：`const [credits, tokens] = await Promise.allSettled([...])`，对 rejected 侧 `ctx.report_failed_account("firecrawl","firecrawl","Firecrawl", reason)` 并在返回数组中省略该指标；同时保留 `extract_usage` 的校验。

- [Medium][65] src/renderer/views/SettingsView.tsx:183 — 快捷配置保存 `void save_config(...)` 静默失败、乐观更新无回滚 — `save_config` → `use_config().save`（use-config.ts:80-94）先乐观 `setConfig(newConfig)` 再入串行队列写盘；写盘失败时仅 `log.error`（use-config.ts:85-92），调用方（hide_account 183、restoreOverrideAccount 197、RenameAccountDialog 541、watched toggle 681、删除 connector 713/740、CpaLabelMapDialog.tsx:68 的 `on_toggle_watched`）全部 `void` 不 catch：用户界面已显示新状态（隐藏/改名/watch），重启后全部还原，无任何错误提示（静默失败）；且 `save()` 返回的原始 promise 在 reject 时形成 renderer unhandled rejection。修复：在 `use_config().save` 失败时回滚 `config_ref`/`setConfig` 到写入前快照并向调用方暴露错误（如 `setError`），或至少让各 `void save_config` 调用点 catch 后给出可见提示（复用 SettingsForm 的 `saveError` 模式）。

    - 证据：SettingsView.tsx:150-158 `save_config = async (payload) => await save(payload)`；use-config.ts:84 `const p = save_queue_ref.current.then(() => ...save(newConfig))`，:93 `return p`（未吞错的原始 promise），:85-92 只在队列链上记录日志。对比 SettingsForm.perform_save（SettingsForm.tsx:211-216）有 `setSaveError` 显式反馈，证明此路径是疏漏。
    - 修复建议：见上。回滚时注意队列内后续保存仍基于旧 `config_ref` 的问题——建议失败后重新 `reload()`。

- [Low][50] src/main/core/scheduler/refresh-service.ts:489 — 失败路径 stale 副本 insert 抛错使状态卡在 loading — 重试耗尽后的 stale 标记循环 `deps.observationStore.insert({...obs, stale:true,...})`（489-496）与 `runtimeStore.updateState(failed)`（501-505）都在 try 块外；若 insert 因 DB 层错误（磁盘满/损坏，insert 是 delete+insert 两条非事务语句，observation-store.ts:237-245）抛错，异常直接冒泡出 `refresh()`，`updateState(failed)` 不执行，runtime store 停留于 `loading` 态，UI 一直转圈，直到 5 分钟锁超时后下一轮调度才可能纠正。修复：把 stale 标记循环与 `updateState(failed)` 包进 `try/finally`，保证 failed 状态一定写入；insert 失败仅告警不阻断状态更新。

    - 证据：refresh() 的 try 块在 406 行 catch 结束后即退出（482），489-505 无任何保护；scheduler 的 do_refresh catch（connector-scheduler.ts:41-45）只 log.error，不补状态。

- [Low][45] src/main/core/main-panel/history-window-controller.ts:81 — 历史窗口 did-finish-load 无失败兜底，定位永久丢失 — `loading=true` 后仅挂 `once("did-finish-load")` 清缓冲；若 `loadURL` 失败（window-manager.ts:231-236 只 log.error，did-finish-load 不会触发），`loading` 恒为 true：后续所有 `send_focus`（105-119）都进 `pending_locs` 缓冲永不发送（静默失败），且缓冲无界累积（去重仅按 loc 键，键数量有限但不清空）。窗口空白 + 定位功能静默失效。修复：同时监听 `did-fail-load`（与 `did-finish-load` 互斥）清 `loading` 并清空 `pending_locs`，或对缓冲加超时/上限；失败时 log 带窗口身份上下文。

    - 证据：`target.webContents.once("did-finish-load", ...)`（81-90）为唯一清 loading 出口；open_or_focus 重建路径（68-76）虽重置缓冲，但前提是用户再次触发 open。

- [Low][40] src/main/core/scheduler/snapshot-cache.ts:106 — 单条损坏缓存条目使整次持久化失败 — `deserialize_entry` 对 `ready`/`failed` 状态直接 `new Date(entry.updatedAt)` 且不校验结果；缓存文件若被截断/篡改（`updatedAt` 为非法字符串），`new Date(...)` 得到 Invalid Date。下一次 `cache.save()` 序列化时 `serialize_state` 走 `state.updatedAt.toISOString()`（snapshot-cache.ts:67）抛 `RangeError: Invalid time value`，`save` 的 catch（175-177）只 warn——但 entries 构建循环已中断，所有实例的 snapshot 缓存整批写失败；`load()` 侧 catch 又整体回退空 Map（157-162），已有部分缓存也被弃。修复：deserialize 时校验 `Number.isNaN(date.getTime())`，非法则跳过该条目或按无 lastSuccess 处理。

    - 证据：ready 分支 `updatedAt: new Date(entry.updatedAt)`（110）；save 路径无逐条容错（165-178 整循环包在一个 try 内）。

- [Low][35] src/main/core/vault/file-vault-backend.ts:174 — 解密失败与"未配置"不可区分，误导性错误 — `get()` 对 `decrypt_value` 失败仅 `log.warn` 后返回 `null`（178-181），与"该 key 不存在"返回同一信号；refresh-service `build_params`（refresh-service.ts:127-145）据此判定为缺密钥，required secret 时报 `Missing required secret: xxx`——真实原因是 vault 条目损坏或主密钥轮换后数据不可解，用户按"重新填 key"处理仍无法恢复（新值写入可覆盖，但既有其它条目同样损坏不暴露）。修复：`get` 增加"解密失败"与"不存在"的区分信号（如返回 `{status:"corrupt"}` 或抛带 key 上下文的错误），`build_params` 对损坏态给出"vault 条目损坏"明确文案；日志保留 redact_key 防泄露。

    - 证据：`catch { log.warn(...); return null; }`（178-181）；build_params 仅 `if (stored !== null)` 分支（128-135）。

- [Low][30] src/main/core/main-panel/main-panel-controller.ts:125 — 面板 loadURL 失败窗口空白且无恢复 — `loadURL(...).catch` 仅 `log.error`，窗口继续显示空白渲染区，用户无任何提示也无法自动重试；headless/断网/资源损坏场景下面板表现为"打开即白屏"。修复：失败时记录后 `target.close()` 并让下次 `open_or_toggle` 重建，或向 renderer 注入可见错误态（复用失败 snapshot 推送模式，参考 connector-ipc.ts:208）。

    - 证据：`void target.loadURL(deps.get_renderer_url("usage")).catch((error) => { log.error("Failed to load main panel", error); });`（125-127），窗口仍被赋值 `win = target`（170）并正常 show。

- [Info][25] connectors/minimax/connector.ts:78 — period 判定假设 end_time/start_time 为毫秒 — `period_key` 以 `(end_time - start_time) / 3_600_000` 判定 5h/天/周周期，若 API 某日改返回秒（minimax 文档未在代码中固化单位），所有模型周期会被误判为 `period_generic`（hours 极小）且静默无日志；注释（93-96）仅覆盖 `remains_time` 的单位假设，未覆盖 end/start_time。修复：对 `end_time - start_time` 加量级 sanity check（如 > 一年视为毫秒/秒混用），或解析时记录单位异常日志。

    - 证据：`period_key`（78-84）无单位校验；`reset_from_ms` 已有同类防护（99-104）可作参照。

## Reviewed files

Bundle 内（83）:

- connectors/antigravity/connector.ts, connectors/antigravity/manifest.json
- connectors/firecrawl/connector.ts, connectors/firecrawl/manifest.json
- connectors/minimax/connector.ts, connectors/minimax/manifest.json
- root_config_03：docs/archive/tasks/t328~t337/handoff.json（10）、docs/archive/tasks_index.json（头部 40 行，5062 行派生索引）、docs/spikes/s008_tokenstats_incremental_rollup_aggregation/code/compare_aggregation.ts、compare_read_scale.ts、docs/spikes/s009_tokenstats_query_process_isolation/code/wal_readonly_concurrency.ts、docs/tasks_index.json、electron-builder.test.yml、electron-builder.yml、electron.vite.config.ts、eslint.config.ts、knip.json、package.json、playwright.config.ts、public/frontend_demo/app/components.json、package.json、pnpm-workspace.yaml
- src/main/config-callbacks.ts
- src/main/core/main-panel/agent-window-controller.ts、floating-bounds.ts、history-window-controller.ts、main-panel-config.ts、main-panel-controller.ts、main-panel-types.ts
- src/main/core/scheduler/connector-scheduler.ts、hydrate-runtime-store.ts、observation-mapping.ts、refresh-service.ts、runtime-store.ts、scheduler-orchestrator.ts、snapshot-cache.ts、types.ts
- src/main/core/vault/file-vault-backend.ts、vault-backend.ts
- src/preload/index.ts
- src/renderer/App.tsx、components/Card.tsx、components/CpaLabelMapDialog.tsx、components/ProviderAccountRow.tsx、components/SettingsForm.tsx、components/UsageBarList.tsx、components/provider_card_content.tsx
- src/renderer/components/ui/：Badge.tsx、Button.tsx、Card.tsx、Checkbox.tsx、Dialog.tsx、Input.tsx、Kpi.tsx、ListRow.tsx、Menu.tsx、PanelTitleBar.tsx、Progress.tsx、SecretInput.tsx、Segmented.tsx、Select.tsx、Skeleton.tsx、StatusDot.tsx、Switch.tsx、Textarea.tsx、icon-link.ts、index.ts
- src/renderer/styles/globals.css
- src/shared/types/config.ts、ipc.ts、oauth.ts、observation.ts、plugin.ts、token-stats.ts

追踪核查（只读，非本 bundle）：src/main/core/observation/observation-store.ts、src/main/core/connector/net-client.ts、runtime.ts、src/main/core/popup/popup-height-controller.ts、src/main/core/config/config-store.ts、src/main/ipc/connector-ipc.ts、src/main/window/window-manager.ts、src/main/index.ts（284、929-940、1260-1309 段）、src/renderer/views/SettingsView.tsx、src/renderer/hooks/use-config.ts、src/renderer/lib/account-overrides.ts、src/shared/lib/connector-thresholds.ts

执行过的只读检查：`git rev-parse HEAD`；逐文件 Read 全部 bundle 文件当前 HEAD 内容；Grep 验证 `@review-ok`（无豁免标记）；Grep 追踪 save_config / onToggleWatched / flushPendingCache / timeout / Abort 的上下游调用与实现，确认各疑点（net-client 15s 超时、runtime 脚本超时、config-store scheduleSave 500ms 防抖、observation-store t174 stale 去重、connector-ipc refresh 立即 ack + catch 补 failed）后裁定不报或降级。

无 `@review-ok` 豁免条目；未发现 Critical/High 级问题。

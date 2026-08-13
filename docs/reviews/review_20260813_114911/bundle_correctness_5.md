# Review bundle: correctness | chunk 5

- perspective: correctness
- chunk: 5（bundles index % 6 == 4）
- reviewed bundles: 18（connectors_deepseek, connectors_kimi, root_config_01, scripts_repo_template_repo_task, src_main_core_local_api, src_main_core_paths_ts, src_main_core_storage, src_main_security, src_preload_token_stats_events_ts, src_renderer_components_AliasEditor_tsx, src_renderer_components_CpaCard_tsx, src_renderer_components_LabelMapDialog_tsx, src_renderer_components_RenameAccountDialog_tsx, src_renderer_components_UpcomingResetCard_tsx, src_renderer_components_add_account, src_renderer_components_settings, src_renderer_lib_01, src_shared_lib）
- reviewed files: 99
- HEAD SHA: `51ea3972efefea568cc2fba3e530ea5f69296182`

## Findings

- [Medium][60] src/renderer/lib/token-stats/chart-data.ts:370 — 非 UTC+8 用户的时间轴/热力图数据错位 — `prepareBarDataFromHourBuckets` 用 `bucketize(start, end, "hour")` 生成小时边界（`aggregate.ts:65-75` 走本地时区 `setHours/setDate`），而服务端 `query_hour_buckets`/`query_heatmap` 固定按 UTC+8 聚合（token-stats-store.ts:31 `(timestamp + 28800000) % 3600000`、`:30-31 strftime('%w','+8 hours')`，注释明言 "the panel's fixed timezone"）。`prepareHeatmapFromCells`（chart-data.ts:563-574）消费的 weekday 是 UTC+8，`prepareHeatmapData`（chart-data.ts:493-512）用本地 `getDay()/getHours()`；`prepareBarDataFromBuckets`（chart-data.ts:319-331）用 UTC 日期而 records 路径用本地日期。时区非 UTC+8 的机器上：短窗（records 路径）与 ≥7d（cells/buckets 路径）图表互相矛盾，hour bucket 会落错轴槽位，且 `first_hour`/`last_hour`（chart-data.ts:380-383）过滤可能排除/误纳边界小时。修复建议：renderer 侧统一定义 `utc8_offset = 8*3600*1000` 的日期/小时边界 helper（与 server 对齐），替换 `bucketize` 与 `getDay/getHours` 的本地时区调用；或在 server 注释与渲染层共用同一常量。仅 UTC+8 用户不受影响。

- [Medium][55] src/main/core/local-api/server.ts:555 — 同一 subscriber_id 重复 subscribe 泄漏 watcher 且错路由推送 — `ctx.subs.set(subscriber_id, ...)` 直接覆盖旧订阅，未先 `service.unsubscribe` 旧 loc；旧订阅的 `on_update` 闭包捕获旧 `loc`，但内部 `ctx.subs.get(subscriber_id)` 已指向新条目 → 旧会话的更新被推到新客户端、载荷里却是旧 session_id；旧 watcher 永不注销（SSE close cleanup 只删当前条目，server.ts:1541-1551）。客户端每次订阅自增 id 时可避开，但重复 id（刷新/重连复用）即触发，且泄漏无上限。修复建议：set 前若 `subs.has(subscriber_id)` 先对旧条目执行 `service.unsubscribe(sub.source, sub.env, sub.session_id, subscriber_id)`，或对重复 id 回 409。

- [Medium][40] connectors/kimi/connector.ts:113 — limits[0] 硬编码为「5 小时限额」未校验窗口定义 — `response?.limits?.[0]` 直接当 300 分钟窗口输出 `kimi:five_hour`，注释依赖 "duration=300 分钟" 的 API 顺序假设；若服务端调整 limits 数组顺序或新增窗口（如 1 小时/1 天），该指标会静默携带错误数值与 label。修复建议：取 limits 中 `detail` 存在且 `window.duration === 300` 且 `window.timeUnit` 为分钟的条目；匹配不到则跳过，避免误标。

- [Low][80] src/main/core/local-api/server.ts:193 — 413 超限后 req.pause() 未 resume/destroy，连接悬死 — `parse_body` 超 `MAX_BODY_BYTES` 时 `req.pause(); reject(...)`，响应已写但请求体未被消费，keep-alive 连接停留在「读 body」状态，后续同连接请求会被当作旧请求体解析（表现为连接挂起/乱序）。修复建议：reject 前 `req.resume()` 丢弃剩余数据，或响应后 `res.destroy()` 关闭连接。

- [Low][80] src/main/core/local-api/server.ts:1244 — /v1/sessions 及多个读端点未校验数值参数，畸形输入回 500 — `filters.limit = Number(params.get("limit"))` 等（:1266-1267）对 `limit=abc` 得 NaN，`token-stats-store.ts:1100-1101` `LIMIT NaN` 触发 SQLite 异常，而该端点无 try/catch（:1268），最终由外层 handle_request 兜底回 500；/v1/records（:1194）、/v1/heatmap（:1204）、/v1/hourBuckets（:1222）、/v1/rollup（:1238）同型（start/end 传 NaN）。dashboard 端点均有 try/catch 而这几处没有。另 `handle_session_history_query`（:349-351）`?limit=` 空串经 `Number("")===0` 判 finite 后传 `limit:0` 返回空页。修复建议：Number 转换后做 `Number.isFinite` 校验，非法回 400；统一抽一个 parse 非负整数 helper。

- [Low][90] src/renderer/components/LabelMapDialog.tsx:99 — 保存失败无反馈且未处理 rejection — `void handle_save()` 中 `await on_save(...)` 抛错即 unhandled rejection（on_save 由父组件实现，config 保存可能失败），用户无任何提示且对话框静默失败。修复建议：`handle_save` 内 try/catch 并显示错误（复用 synced/错误文案状态）。

- [Low][50] src/renderer/components/LabelMapDialog.tsx:61 — updatedAt 为空时渲染 "Invalid Date" — `set_synced(new Date(state.updatedAt).toLocaleString())`：connector state `ready` 但 `updatedAt` 为 `""` 时 `new Date("")` 为 Invalid Date，界面显示 "Invalid Date"。修复建议：`updatedAt` 空或 `Number.isNaN(Date.parse(...))` 时不设 synced。

- [Low][50] scripts/repo_template/repo_task/integration.py:130 — cmd_start 解析 depends_on/conflicts_with 未 strip，含空格的手工值误判依赖缺失 — `str(ref_fm.get("depends_on", "")).split(",")`（同 :131 conflicts_with）不做 trim，与 `documents.parse_tid_list`（:86-88 会 strip）不一致；若 front matter 被手工写成 `t001, t002`，`dep` 为 `" t002"` → `effective.get(dep)` 落空 → 误报「依赖未满足」。修复建议：改用 `parse_tid_list` 或 `split(",")` 后逐项 strip。

- [Info][90] src/main/core/local-api/server.ts:452 — `metadata_rows.includes(row)` 恒假死条件 — `metadata_rows` 与 `candidate_rows` 来自两次独立 `sessions_provider` 调用（index.ts:503-513 每次 `.map` 新建对象），引用相等对 candidate 行恒 false；对 metadata 行恒 true（自身元素）。语义上结果仍正确（响应 = metadata 命中 ∪ content 命中，dedupe 保序），但该条件对 candidate 行是死代码，意图不明的冗余。desktop IPC 同型（session-history-ipc.ts:295）。修复建议：改为按 key 判断（如 `metadata_keys.has(key)`）或删除该分支并加注释说明语义。

- [Info][50] src/main/core/storage/write-json.ts:38 — rename 覆盖会重置目标文件权限位 — `writeFileAtomic` 未传 chmod 时 tmp 文件按默认 umask 创建，rename 后目标文件既有的特殊权限（如手动 chmod 0600 的 config.json）被重置为 0644；当前调用方均自洽（vault 恒传 0o600，config.json 恒 0644），无实际触发，但属隐藏陷阱。修复建议：rename 前若目标存在，可先 `stat` 目标并沿用其 mode，或文档注明。

- [Info][60] src/renderer/components/UpcomingResetCard.tsx:81 — 空态文案硬编码「未来 7 天」与实际阈值不一致 — `collect_upcoming_resets` 的进入条件是可配置的 `thresholdPercent`（provider-usage.ts:597-624），文案却固定写 "未来 7 天内暂无重置"；阈值非默认时文案误导。修复建议：文案改为「当前无即将重置」或由调用方传入实际窗口。

- [Info][50] connectors/deepseek/connector.ts:52 + connectors/kimi/connector.ts:34 — 数字强转宽容度不一致 — kimi `to_number` 只接受 `string|undefined`，deepseek `to_number` 接受 `string|number|undefined`；两文件对 `Number(value ?? 0)` 均会把 `""`/`"abc"` 转成 0 而非视为异常，API 若返回空串会把 used/limit 静默当 0（kimi 下 `limit=0` 走 "normal"，掩盖真实状态）。低风险观察：字段缺失时 0 是合理缺省，但空串与缺省无法区分。修复建议：无，如可接受可保留。

## Reviewed files

18 bundles / 99 files（`docs/reviews/review_20260813_114911/_meta/bundle.json` 中 index % 6 == 4）：

- connectors/deepseek/connector.ts, manifest.json
- connectors/kimi/connector.ts, manifest.json
- root_config_01：.agents/skills/repo-template-sync/sync_state.json, .claude/settings.json, .github/workflows/{ci,nightly,release}.yml, docs/archive/\_pre/omni_powers_sunset/op_execution/tasks_list.json, docs/archive/reviews/review_20260726_054747/\_meta/{\_fire_meta,\_wait_status}.json, docs/archive/tasks/t281..t301 handoff.json ×19, docs/archive/tasks_index.json
- scripts/repo_template/repo_task/：**init**.py, attempts.py, cli.py, context.py, control.py, documents.py, git_ops.py, goal.py, integration.py, ledger.py, lifecycle.py, monitoring.py, plan.py, scheduling.py, store.py, view_server.py, view_static/{board.css, board.js, chain_plan.js}, worktrees.py
- src/main/core/local-api/server.ts
- src/main/core/paths.ts
- src/main/core/storage/write-json.ts
- src/main/security/csp.ts
- src/preload/token-stats-events.ts
- src/renderer/components/{AliasEditor,CpaCard,LabelMapDialog,RenameAccountDialog,UpcomingResetCard}.tsx
- src/renderer/components/add_account/{ApiKeyForm,LocalScanForm,SessionForm,VendorPicker}.tsx, add_account_params.ts
- src/renderer/components/settings/{BarSchemeField,Select,SetRow,Toggle}.tsx
- src/renderer/lib/：account-overrides.ts, auth-flow-registry.ts, common-services.ts, config-debounce.ts, config-sync.ts, cookie_login_poll.ts, device-login-url.ts, display_label.ts, drag-reorder.ts, echarts_token_resolver.ts, is-web.ts, label-map-util.ts, logger-transport.ts, panel-navigation.ts, provider-usage.ts, refresh-intervals.ts, session-history/{layout,markdown}.ts, session-library/filter.ts, session-resume.ts, session_meta.ts, theme.ts, token-stats/{aggregate,chart-data,filter,format,query-cache,types}.ts
- src/shared/lib/{auth-error,config_redaction,connector-thresholds,cookie_parser,logger,trend}.ts

## 只读检查执行记录

- 读取 bundle.json 全量，按 `index % 6 == 4` 确定本 chunk 的 18 bundles / 99 files
- `git rev-parse HEAD`（51ea3972...）；`git log --oneline` connectors/kimi、connectors/deepseek 历史
- 全部代码文件逐行 Read；root_config_01 的 25 个 JSON 全部经 `json.loads` 有效性校验（均合法）
- 追踪下游/上游验证：
    - `metadata_rows.includes(row)` 引用相等语义：比对 desktop 同型实现 src/main/ipc/session-history-ipc.ts:292-303、sessions_provider 注入 src/main/index.ts:490-514（每次调用新建对象 → includes 对 candidate 恒假）
    - 日志导出日期：src/main/core/logging.ts:22 与 local-api server.ts:961 同为 `toISOString().slice(0,10)`，命名一致，无时区错位
    - hour/heatmap 聚合时区：src/main/core/token-stats/token-stats-store.ts:31（UTC+8 固定）与 query_heatmap `'+8 hours'`（token-stats-store.ts:1230-1231 区段）→ 确认与渲染层本地时区 bucketize 不一致
    - query_sessions 的 LIMIT/offset 用法（token-stats-store.ts:1100-1101）→ 确认 NaN 入 SQL
    - connectors ctx.status API（src/main/core/connector/host-io.ts:26-29）与 connector-thresholds 一致
    - 未执行任何写操作，未修改任何代码/配置/文档

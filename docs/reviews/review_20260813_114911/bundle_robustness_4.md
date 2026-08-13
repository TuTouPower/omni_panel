# Bundle Review: robustness | chunk 4

- Perspective: robustness
- Chunk: 4 (bundle index % 6 == 3)
- Bundles reviewed: 18
- Files reviewed: 46
- HEAD SHA: `51ea3972efefea568cc2fba3e530ea5f69296182`
- Findings: 16 (Medium 5, Low 10, Info 1)

## Findings

- [Medium][70] src/main/core/connector/runtime.ts:174 — 超时无法终止已开始的 async 脚本，await 后死循环可饿死事件循环使超时机制整体失效 — `race_with_timeout` 只对外层 promise reject；vm.runInContext 的 `timeout` 仅覆盖同步段。脚本一旦 `await` 后进入同步死循环（微任务饿死事件循环），`setTimeout` 回调永不触发，reject 永不发生，主进程整块卡死且无任何恢复路径。对用户贡献的 connector 脚本这是未缓解的 DoS/稳定性风险（注释也承认 node:vm 非安全边界，但超时失效属 robustness 而非安全）。修复建议：为脚本执行引入隔离进程/worker 并进程级超时强杀；至少在文档与 connector 编写规范中明示「await 后不得有长同步循环」，并在 run_connector 增加执行耗时监控日志。
- [Medium][65] src/main/ipc/event-ipc.ts:66 — 事件回调 catch-log-rethrow 会把异常抛给 EventEmitter/调用方，导致未捕获异常与刷新流程污染 — `themeHandler` 挂在 `nativeTheme.on("updated")` 上，`win.webContents.send` 对销毁中 webContents 抛 "Object has been destroyed"（`win.isDestroyed()` 为 false 但 webContents 已销毁的竞态），rethrow 从 EventEmitter 冒出成未捕获异常；`onStateChange`（44-48 行同模式）rethrow 后经 runtime-store.ts:49-51 的无防护 listener 循环传播到 `updateState` 调用方 refresh-service，被当作采集失败触发 3 次重试并最终标记 stale/failed（数据已插入但状态误标失败）。修复建议：事件回调内 catch 后只 log 不 rethrow；runtime-store 的 listener 循环也应逐 listener try/catch 隔离。
- [Medium][65] src/renderer/components/AddAccountDialog.tsx:187 — handle_save 无 catch 且 error_message 从未置非 null，保存失败完全静默 — `handle_save` 只有 try/finally；`on_save`（SettingsView.tsx:579 → create_instance_and_save → config.createInstance/saveSecrets/save）任何一步 reject 都成为 unhandled rejection，`error_message` state 全文件只在 110/170/179/185 置 null，UI 错误提示分支（305-312 行）永不触发：对话框保持打开、无任何反馈，用户不知保存失败。`handle_form_save`（239-251）同样无 catch。修复建议：catch 后 `set_error_message(...)` 展示 IPC 错误消息。
- [Medium][60] connectors/cpa/connector.ts:213 — reset_after_seconds 非数字产生 NaN reset_at，整条 observation 被 runtime schema 拒绝丢数据 — `Number(reset_after_seconds)` 未校验有限性，API 返回非数字串（如 "unknown"）时 `Date.now() + NaN` → NaN；observation.ts:42 `reset_at: z.number().finite().nullable()` 拒绝 NaN，runtime.ts:183-189 对校验失败只 warn 并 `continue`，该 codex 账号的 used/limit 观测整条静默丢弃。修复建议：`const secs = Number(reset_after_seconds); if (Number.isFinite(secs)) reset_at = Date.now() + secs * 1000;`（对齐上方 raw_reset 路径的 isFinite 检查）。
- [Medium][60] connectors/grok/connector.ts:119 — get_legacy_reset_at 对 Date.parse 结果无 isFinite 校验，非法 billingPeriodEnd 使产品额度观测整条丢失 — `Date.parse(config.billingPeriodEnd)` 对非法日期返回 NaN，直接作为 productUsage observation 的 `reset_at`（221 行）→ 被 observation.ts:42 schema 拒绝 → 该产品 usage 观测被 runtime 静默跳过（连带 valid 的 usagePercent 数据）。修复建议：`const ts = Date.parse(...); return Number.isFinite(ts) ? ts : null;`。
- [Low][45] src/main/core/connector/runtime.ts:183 — schema 校验失败仅 warn 静默丢条，不 report_failed_account — 脚本输出任一字段不合法（如 NaN reset_at、错误 window 枚举）时整条被丢弃且只记 warn 日志，上层 refresh-service 无感知，用户无任何可见信号（不 stale、不 failed），与 t039「不得静默返回空」的既定原则不一致。修复建议：校验失败时调用 `ctx.report_failed_account`（至少对 provider/account 可辨识的场景），或计入 error 摘要返回。
- [Low][40] src/main/core/connector/tier1-poll-executor.ts:84 — poll/probe 路径 observation 的 status 硬编码 "normal"，used/limit 超阈值不告警 — execute_poll 返回 `status: "normal"`（probe-executor.ts:114 同），即使 used=90/limit=100 也不会 warning/critical，UI 阈值告警对 tier-1 poll/probe 连接器完全失效（对自定义无 script 连接器）。修复建议：按 display_style 调用 `ctx.status.for_ratio(used, limit)` 计算 status。
- [Low][40] src/main/ipc/session-ipc.ts:74 — logged 参数求值阶段访问 undefined request 属性，缺参时抛原始 TypeError 而非 IpcResult — renderer 未传参时 `request` 为 undefined，`[request.instance_id]` 在进入 logged 的 try/catch 之前求值即抛 TypeError，调用方收到 "Error invoking remote method" 原始错误而非结构化 fail。修复建议：`[request?.instance_id]` 或先 schema 校验再取参。
- [Low][40] src/main/ipc/config-ipc.ts:236 — saveSecrets 逐 key 写入无事务，中途失败部分成功无回滚 — `for (...) await deps.secretsStore.set(...)` 循环中某 key 失败时，已写入的 key 保留、返回 INTERNAL_ERROR，无回滚与部分成功提示，用户重试可能覆盖；与 handleConfigImportData 的失败回滚路径（521-527）不一致。修复建议：全部 set 前先校验，或批量写入失败时回滚已写 key。
- [Low][40] src/main/ipc/config-ipc.ts:200 — onConfigSaved 回调抛错会把已成功的保存误报为失败 — `deps.configStore.saveIfBaseMatches` 成功后调用 `deps.onConfigSaved?.(stripped)`，回调异常被外层 catch 成 `INTERNAL_ERROR` 返回给 renderer，但配置实际已保存：用户看到失败提示并可能重复保存。修复建议：回调包 try/catch 隔离，或与保存结果解耦。
- [Low][35] src/main/ipc/token-stats-ipc.ts:36 — 多数查询 handler 无 try/catch，store 内部错误以非结构化 rejection 传给 renderer — TOKEN*STATS_BUCKETS/SESSIONS/SESSION_STATS/RECORDS/HEATMAP/HOUR_BUCKETS/ROLLUP 直接 `ok(store.query*\*(...))`，store 抛错（如 DB 损坏）时 renderer 收到原始 IPC rejection 而非 `fail()`，与 DASHBOARD 路径（catch → QUERY_FAILED）不一致。修复建议：统一 try/catch 返回 fail("QUERY_FAILED")。
- [Low][35] src/main/ipc/connector-ipc.ts:220 — handleConnectorRefreshAll 失败仅 log，不推送 failed 状态 — 对比 handleConnectorRefresh（203-209 行）失败时主动 `updateState(failed)`，refreshAll 的 catch 只 `log.error`，用户点击「全部刷新」失败时无任何可见状态变化（t196 f004 原则未覆盖 refreshAll）。修复建议：同样推送 failed 快照或逐实例状态。
- [Low][35] src/renderer/components/CpaAddDialog.tsx:66 — 对话框保存/测试按钮无 onClick 且 showCpaAdd 恒 false，整条路径为未接线死 UI — "保存并同步"/"测试连接" 按钮（57-70 行）无任何 onClick，url/key/scope 三个 state 仅用于 canSave；且 SettingsView.tsx:123 的 `showCpaAdd` 全仓无 `setShowCpaAdd(true)` 调用，对话框永不可达。若未来接线，无操作按钮会造成用户输入后无反馈的静默失败。修复建议：删除该死组件，或接入 CpaMgmtForm 对应的保存流程并补 onClick。
- [Low][30] src/renderer/components/WebLoginSection.tsx:107 — Icon name="alert_circle" 不在 UI_ICONS 注册表，错误图标静默渲染为空 SVG — Icon.tsx UI_ICONS（71-121 行）无 alert_circle，Icon 组件对未知 name 返回空 svg（175-191 行）；SessionSection.tsx:53、DeviceLoginSection.tsx:214 同样引用。错误文案仍显示但图标缺失。修复建议：在 UI_ICONS 补 `alert_circle: AlertCircle`（lucide）或改用已有图标。
- [Low][30] scripts/repo_template/pending.py:166 — 批量迁移 --write 非原子，中途失败部分完成且无回滚 — `_apply` 循环内 `move_entry`（git mv/rename）任一条目失败抛 IdScanError 时，前面条目已迁移并 git add，命令以错误退出但仓库处于部分迁移状态，用户需手工补齐。修复建议：先 dry-run 校验全部条目可迁移，再逐个落盘；或失败时提示已迁移清单。
- [Low][25] connectors/cpa/connector.ts:203 — codex used_percent 无下界 clamp，负值 used 落库且状态显示 normal — `Math.min(to_number(...), 100)` 只封上限，上游返回负 percent 时 used 为负，status_for_pct 对负值返回 normal（connector-thresholds.ts:9-13），数据失真且不告警。修复建议：`Math.max(0, Math.min(to_number(...), 100))`。
- [Info][15] src/renderer/components/Icon.tsx:326 — `if (!render) return null` 死代码 — `VENDOR_MARKS[id] ?? VENDOR_MARKS["overview"]` 恒非 undefined（overview 键恒在），null 分支不可达。可删除或改为显式缺省处理。

## Reviewed files (46)

- connectors/cpa/connector.ts, connectors/cpa/manifest.json
- connectors/grok/connector.ts, connectors/grok/manifest.json
- connectors/tikhub/connector.ts, connectors/tikhub/manifest.json
- scripts/repo_template/\_id_scan.py, check_review_status.py, findings.py, pending.py, render_review_prompts.py, repo_state.py, spikes.py, task.py, track_worktree.py
- src/main/core/connector/host-io.ts, manifest-loader.ts, net-client.ts, probe-executor.ts, runtime.ts, script-cache.ts, tier1-poll-executor.ts
- src/main/core/open-connectors-dir.ts, src/main/core/settings-close-action.ts
- src/main/ipc/auth-ipc.ts, build-info-ipc.ts, config-ipc.ts, connector-ipc.ts, event-ipc.ts, grok_auth_ipc.ts, helpers.ts, kimi_auth_ipc.ts, log-ipc.ts, logged.ts, popup-ipc.ts, session-history-ipc.ts, session-ipc.ts, size-validation.ts, token-stats-ipc.ts, trend-ipc.ts
- src/preload/route_api.ts
- src/renderer/components/AddAccountDialog.tsx, CpaAddDialog.tsx, Icon.tsx, ProviderOverview.tsx, TrendSparkline.tsx, WebLoginSection.tsx, session-shell/SessionShell.tsx
- src/renderer/index.tsx, src/shared/constants.ts

## 执行过的只读检查

- 读 bundle.json 确定 18 个目标 bundle（index % 6 == 3），全部文件读 HEAD 当前内容
- 交叉验证调用链：refresh-service.ts（connector 错误/stale 处理、retry 预算）、runtime-store.ts（listener 循环）、observation-store.ts（insert/prune 去重语义）、token-stats-store.ts query_sessions（分页 offset 终止性）、src/main/index.ts sessions_provider 注入、SettingsView.tsx onAddAccount 链、use_connector_catalog.ts create_instance_and_save、use-config.ts saveSecrets、shared/lib/trend.ts（percent clamp）、shared/schemas/observation.ts（NaN 拒绝语义）、shared/lib/connector-thresholds.ts
- `git rev-parse HEAD` 取 HEAD SHA
- Grep 验证：CpaAddDialog 引用与 showCpaAdd 赋值、alert_circle 图标注册、set_error_message 赋值点、sessions_provider 定义

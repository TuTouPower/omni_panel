# Bundle Review — correctness | chunk 1

- Perspective: correctness
- Chunk: 1（`index % 6 == 0`）
- 审过 bundles: 19 / 111
- 审过 files: 72
- HEAD SHA: `51ea3972efefea568cc2fba3e530ea5f69296182`

---

- [Medium][60] src/main/core/scheduler/refresh-service.ts:226 — `refresh` 的 `force` 参数无任何行为，手动刷新在自动刷新持锁时被静默跳过 — connector-ipc.ts:203 手动刷新入口传 `{ force: true }`（测试也断言该调用，tests/unit/ipc/connector-ipc.test.ts:160），但 refresh-service.ts:226-229 `if (is_locked(instanceId))` 不区分 force 直接 return；`force` 仅出现在 :225 的日志字符串里。可复现：连接器处于 1800s 自动刷新间隔中，用户点「刷新」，该实例锁被占用（或上次 refresh 尚在跑）时调用立即返回，无 loading、无失败提示、无排队，且 `force` 参数形同虚设。修复：force 为 true 时绕过锁（或等待当前刷新结束后重跑一次），并保证调用方有可见反馈；否则删除该参数并同步 connector-ipc 调用与测试断言。
- [Medium][55] src/main/core/scheduler/refresh-service.ts:489 — 全轮失败后的 stale 副本插入段无 try/catch，insert 抛错会跳过 `updateState(failed)` 使 runtime store 卡在 loading — 489-496 的 `list_by_source_instance_id` + `insert` 在 try 块内但无内部保护；observation-store 的 insert（better-sqlite3 同步，busy_timeout 5000ms 后仍可抛 SQLITE_BUSY）或解析异常时，501-505 的 `updateState(status:"failed")` 不执行，状态机停留在 :250-253 设置的 loading；异常冒泡到 scheduler 仅记日志，UI 永久显示「加载中」。现有测试只覆盖插入成功路径（tests/integration/scheduler/refresh-service.test.ts:1083-1135）。修复：将 489-499 包 try/catch（stale 副本是尽力而为，失败仅告警），确保 failed 状态更新无条件执行。
- [Medium][60] src/main/core/main-panel/history-window-controller.ts:81 — `did-finish-load` 单次监听在 loadURL 失败时永不触发，`loading` 恒 true 导致后续 `send_focus` 永久进入缓冲队列 — :79-80 置 loading=true 后 `webContents.once("did-finish-load", ...)` 复位；若窗口 load 失败（did-fail-load / renderer 崩溃 / 资源 404）回调不触发，:107-117 的 `send_focus` 永远走缓冲分支（pending_locs 去重后仍可无限累积不同 loc），会话定位功能失效直到窗口被关闭重建。修复：同时监听 `did-fail-load`（或加超时）复位 loading 并清空缓冲。
- [Low][45] src/main/core/main-panel/main-panel-controller.ts:70 — `suppress_bounds_save` 的 `setImmediate` 递减与用户拖拽事件存在竞态，可能吞掉一次真实位置保存 — height_controller 自动 `setBounds` 时 suppress_bounds_save++，`setImmediate` 下一宏任务递减；若用户在该宏任务前触发真实 move/resize（Electron 事件独立宏任务），`save_floating_bounds`（:86-104）仍被抑制，该次用户操作的位置/尺寸不持久化（floating 模式下重启窗口后回跳）。修复：按 setBounds 次数配对递减改为 token 计数（每次 setBounds 用唯一 token，只清自己的抑制位），或对用户事件走独立节流路径。
- [Low][40] connectors/minimax/connector.ts:78 — `period_key` 在 API 缺省 `end_time`/`start_time` 时把周期误判为「5小时」— `to_number(undefined)` 返回 0，:79 `hours = 0` → `period_5h`；若 MiniMax 只返回配额不返回时间戳，所有 interval 条目标签变成「(5小时)」且排序进入 period_5h 桶，误导用户。现有测试只覆盖负值 clamp（tests/integration/connector/minimax-connector.test.ts:106-125），未覆盖时间戳缺失。修复：end_time<=0 或 start_time<=0 时跳过周期推断（归为 `period_generic`/不展示周期后缀）。
- [Low][40] src/main/core/connector/runtime.ts:114 — `race_with_timeout` 超时后底层脚本 promise 不取消，超时脚本继续运行产生在途 HTTP 请求 — `vm.runInContext` 异步结果由 race 超时 reject，但原始 promise 仍在执行（如 `ctx.http.get_json` 要到自身 15s 超时才结束）；refresh-service 失败路径 1s 后重试时旧脚本可能仍在发请求，同一实例新旧两轮并发打到服务端（connector-scheduler.ts:37-39 的 stagger 本意就是避免握手风暴）。修复：向 ctx 注入可取消的 AbortSignal 并在超时后 abort，或至少对在途请求打标防重入。
- [Low][35] connectors/firecrawl/connector.ts:35 — `Date.parse` 对无时区日期按宿主本地时区解析，`reset_at` 偏移 — `billing_period_end` 若返回 "2026-09-01" 这类无时区串，Date.parse 按本地时区（UTC+8）解释，reset_at 差 8 小时，进度条剩余时间与「即将重置」判定（provider-usage.ts:622）随之偏移。修复：显式按 ISO8601 约定处理（如检测无时区后缀时附加 `Z` 或 `T00:00:00Z`）。
- [Info][30] src/main/core/scheduler/snapshot-cache.ts:110 — 损坏缓存中非法 `updatedAt` 产生 Invalid Date，后续 `toISOString()` 抛 RangeError 被 save 的 catch 吞掉，该实例缓存永久不再持久化 — `new Date(entry.updatedAt)` 对 "not-a-date" 不抛错；下次 serialize_state（:67）调 `toISOString()` 抛异常 → save() 的 catch 记 warn，缓存条目滞留内存、写盘持续失败。修复：反序列化时校验 `Number.isFinite(date.getTime())`，非法则回退。
- [Info][30] src/main/core/scheduler/connector-scheduler.ts:106 — `isRunning` 在 jitter 启动窗口期返回 false，与「已启动」语义不一致（且生产代码无调用方，仅测试使用）— start() 带 jitter 时（:47-52）timers 尚未登记（schedule_next 在 jitter 之后才执行），isRunning 为 false；connector-scheduler.test.ts:125-137 只覆盖无 jitter 路径。修复：isRunning 同时检查 jitter_timers，或文档化该语义。
- [Info][25] connectors/minimax/connector.ts:99 — `reset_from_ms` 假定 `remains_time` 单位为毫秒，注释已声明但 sanity check 挡不住秒级误判 — 若 API 返回秒（如 2592000 表示 30 天），reset_at 被算成 ~43 分钟后；:103 的 1 年上限检查对「秒数」恰好放行。修复：改为对 API 响应做单位探测（与周期跨度量级比对）或明确契约。

No findings.（无 High/Critical 级发现）

---

## Reviewed files（72）

- connectors/antigravity/connector.ts, connectors/antigravity/manifest.json
- connectors/firecrawl/connector.ts, connectors/firecrawl/manifest.json
- connectors/minimax/connector.ts, connectors/minimax/manifest.json
- public/frontend_demo/app/src/components/library/sessionMeta.ts, public/frontend_demo/app/src/components/workspace/format.ts, public/frontend_demo/app/src/hooks/use-mobile.ts, public/frontend_demo/app/src/lib/store.ts, public/frontend_demo/app/src/lib/types.ts, public/frontend_demo/app/src/lib/utils.ts, public/frontend_demo/app/tsconfig.app.json, public/frontend_demo/app/tsconfig.json, public/frontend_demo/app/tsconfig.node.json, public/frontend_demo/app/vite.config.ts, public/frontend_demo/app/components.json, public/frontend_demo/app/package.json, public/frontend_demo/app/pnpm-workspace.yaml, schemas/plugin-metadata.schema.json, schemas/plugin-output.schema.json, tsconfig.json, vite.web.config.ts
- src/main/config-callbacks.ts
- src/main/core/main-panel/agent-window-controller.ts, floating-bounds.ts, history-window-controller.ts, main-panel-config.ts, main-panel-controller.ts, main-panel-types.ts
- src/main/core/scheduler/connector-scheduler.ts, hydrate-runtime-store.ts, observation-mapping.ts, refresh-service.ts, runtime-store.ts, scheduler-orchestrator.ts, snapshot-cache.ts, types.ts
- src/main/core/vault/file-vault-backend.ts, vault-backend.ts
- src/preload/index.ts
- src/renderer/components/AccountDialog.tsx, Card.tsx, CpaLabelMapDialog.tsx, ProviderAccountRow.tsx, SessionSection.tsx, UsageBarList.tsx, provider_card_content.tsx
- src/renderer/components/ui/（Badge, Button, Card, Checkbox, Dialog, Input, Kpi, ListRow, Menu, PanelTitleBar, Progress, SecretInput, Segmented, Select, Skeleton, StatusDot, Switch, Textarea, icon-link, index）
- src/renderer/styles/globals.css
- src/shared/types/（config, ipc, oauth, observation, plugin, token-stats）

## 执行过的只读检查

- 读取 bundle.json 全部 111 个 bundle 元数据，按 `index % 6 == 0` 选出 19 个 bundle
- 逐文件 Read 全部 72 个 bundle 文件（当前 HEAD 内容）
- 追踪上游调用：provider-usage.ts / use_popup_derived.ts / use-plugins.ts / PopupView.tsx / SettingsView.tsx（config export 路径，确认桌面端 `show_secret_option={web_mode}` 使 includeSecrets 开关只在 web 显示，preload 丢弃 options 与 IPC handler 不接受参数一致，非 bug）
- 追踪消费方：UsageRows.tsx（elapsed 对 cycleDurationMs=0 的 falsy 保护）、observation-store.ts（insert 抛错路径、stale 副本去重 delete_stale_dup_stmt）、net-client.ts（HTTP 15s 超时与 lock 5 分钟的关系）、runtime.ts（脚本超时）、connector-thresholds.ts（for_ratio 对 limit<=0 返回 unknown，无除零）
- 核对测试覆盖：tests/integration/scheduler/refresh-service.test.ts（stale 成功路径有覆盖、insert 失败路径无）、tests/integration/connector/minimax-connector.test.ts（负值 clamp 有覆盖、时间戳缺失无）、tests/unit/ipc/connector-ipc.test.ts（force 参数断言）、tests/unit/scheduler/connector-scheduler.test.ts（isRunning 仅无 jitter 路径）、tests/unit/main/core/main-panel/history-window-controller.test.ts
- git log 检查 refresh-service.ts / history-window-controller.ts 的变更历史（t172/t174/t195/t210/t212/t280）

# Contract Review — chunk 6

- perspective: contract
- chunk: 6（bundle index % 6 == 5）
- reviewed bundles: 18，files: 79
- HEAD SHA: `51ea3972efefea568cc2fba3e530ea5f69296182`

审查范围：connectors/exa、connectors/mimo、docs/archive/tasks/t302–t327 handoff（25）、src/main/cli、src/main/core/logging.ts、src/main/core/popup、src/main/core/token-stats（12）、src/main/window、src/preload/usageboard-api.ts、renderer 组件（Button/CpaConnectorSettings/ProviderAccountList/SecretInput/UpcomingResetRow/forms/token-stats 组件）、renderer/lib（token-stats/workspace/utils 等）、src/shared/schemas。已主动追踪上下游：host-io、connector runtime、net-client、refresh-service build_params、config-ipc/config-store、local-api server、preload/index.ts、shared/types/ipc、shared/types/token-stats、connector-thresholds、tests/integration/connector/{exa,mimo}-connector.test.ts、tests/unit/main/core/token-stats/\*、git log/blame。

## Findings

- [Medium][90] src/main/core/popup/popup-height-controller.ts:55 — 注释声明高度上限 75%，实现已改为 100%（对外契约文档失效） — commit 60fa5f06 "feat(t081): popup 高度上限 75% -> 100%" 把 `MAX_HEIGHT_RATIO` 改为 1.0 且 `compute_target_height` 用 `floor(workArea.height * 1.0)`，但文件头 JSDoc（"Clamped to `[collapsed_min, floor(workArea.height * 0.75)]`"、"never exceeds the 75% constraint"）与 66 行内联注释 "we must not exceed the 75% screen rule" 仍写 75%。可复现：读注释会得到与行为相反的约束承诺；依赖该约束的上层（主面板 fixed 高度、UI 设计）按注释误判。修复建议：把 55/58/66 行注释改为 100%（"full work area height"），与 `MAX_HEIGHT_RATIO = 1.0` 及 t081 意图一致。
- [Medium][90] src/shared/types/token-stats.ts:114 — daily `date` 字段 schema 注释声明 UTC，reader 实现按系统本地时区（契约文档与实现错位） — `tokenStatsDailyUpsertSchema.date` 注释 "UTC date YYYY-MM-DD of the usage (matches Claude Code /stats bucketing)"；而 `reader-utils.ts:7-11 calendar_date_of` 用 `new Date(ts).getFullYear/getMonth/getDate`（系统时区），claude/kimi/grok/opencode 四个 reader 全部经它归日；`tests/unit/main/core/token-stats/claude-reader.test.ts:349` 明确断言 "grouped by local date and model"。可复现：UTC+8 以外系统时区下 `token_stats_daily/buckets` 的日期归属与 schema 文档口径不一致，且与 Claude Code /stats 的 UTC 分桶不一致。修复建议：二选一——更新 schema 注释为"本地日期"（与实现/测试一致，改动最小），或统一改为 UTC 并同步实现与测试。
- [Medium][70] src/renderer/lib/token-stats/aggregate.ts:65 — renderer 图表 bucket 边界按系统时区计算，服务端按固定 UTC+8，非 UTC+8 用户图表错位 — 服务端 `token-stats-store.ts` 的 `dashboard_local_boundary`、`query_hour_buckets`（`:1244`）、heatmap SQL（`:1204`）全部用 `+28800000`（UTC+8，注释自称 "the panel's fixed timezone"）；renderer `bucketize`（aggregate.ts:65-75）用 `new Date(timestamp)` + `setMinutes(0,0,0)`（系统时区），`BarChart.tsx:216-236` hour 标签用 `new Date(bucket_start).getHours()`。可复现：系统时区设为 UTC-5 时，`/v1/hourBuckets`、`/v1/rollup`、`/v1/heatmap` 返回的 UTC+8 整点 `hour_start` 被 renderer 归到错误的本地小时桶（偏移 13 小时），标签显示错误小时；`query_hour_buckets` 注释声称 "matches the renderer's bucketize hour boundaries (s005)" 仅当时区恰为 UTC+8 成立。修复建议：renderer 侧对 bucket 边界/标签统一按 UTC+8 计算（与 `format.ts` 一致加偏移），或非 chartData 路径也走服务端下发的 axis。
- [Medium][65] src/main/cli/import-config.ts:80 — 数字型 secret 参数值不转存 vault、滞留 config.json 明文，后续 CONFIG_SAVE 剥除导致凭据丢失 — `appConfigurationSchema.parameterValues = z.record(z.string().or(z.number()))`（config/types.ts:45）放行数字值；import-config 仅对 `typeof value === "string" && value !== ""` 转存 vault，数字 secret 保留在 stripped 配置的 parameterValues 并落盘（`handleConfigImportData` config-ipc.ts:508 同样只转存字符串）。可复现：`--cli serve --config` 导入文件含 `"cpa_mgmt_key": 123456`（schema 合法）→ vault 无 key、config.json 明文滞留；此后用户在设置面板任意保存一次（`handleConfigSave` 的 `stripSecrets` 按 manifest secret key 剥离 parameterValues）→ 该数字 secret 从配置消失且从未入 vault，凭据丢失、`hasSecrets` 恒 false，界面显示为空。修复建议：导入时对 secret 参数的非字符串值显式拒绝（VALIDATION_ERROR）或统一 `String(value)` 转存 vault，并给出可读错误。
- [Low][80] src/main/cli/client.ts:62 — resolve_instance 只校验 port 不校验 url，旧/损坏 cli.json 缺 url 时 open 子命令报原始 "Invalid URL" — `resolve_instance` 校验 `typeof info.port !== "number" || info.port <= 0` 后 `return { port: info.port, url: info.url }`，未校验 `info.url` 类型；`run_control_command` "open" 分支（client.ts:245）调 `fetch_url(inst.url)`，url 为 undefined 时 `httpGet(undefined)` 抛 "Invalid URL"，被 catch 以英文原文输出而非「实例未运行」可读错误（AC6 语义）。可复现：手工编辑/截断 cli.json 保留 port 删掉 url，执行 `--cli open`。修复建议：在 resolve_instance 校验 `typeof info.url === "string" && /^https?:\/\//.test(info.url)`，否则抛"cli.json 缺少有效 url"。
- [Low][75] connectors/mimo/connector.ts:155 — 余额阈值判定用未取整的 LIMIT 原始值，observation 展示 limit 用取整后的 balance_limit（判定与展示基准不一致） — `balance_limit = Math.round(limit * 100) / 100`（connector.ts:80）写入 observation.limit，但 status 判定 `ctx.status.for_balance(balance, limit)` 传原始 `limit`（可含三位小数）。可复现：LIMIT="100.005" 时 balance=10.01 展示 limit=100.01，`for_balance` 按 100.005 计算 ratio=0.10005 → warning 边界（`<=0.1` critical / `<=0.2` warning）与按展示 limit 判定的结果可能不同；测试仅覆盖 LIMIT="100"（取整前后相等），未暴露。修复建议：`ctx.status.for_balance(balance, balance_limit)`。
- [Low][60] src/renderer/lib/workspace/workspace-storage.ts:84 — load_saved_slots 的 is_loc 不校验 env 枚举，旧 localStorage 中 env="win" 被接受并恢复成无效查询条件 — `is_loc` 对 env 仅 `typeof x.env === "string"`，未按 `tokenStatsEnvSchema`（"local"|"wsl"）过滤；同一文件 KNOWN_SOURCES 已从 schema 派生（:82），env 却手写宽松校验。可复现：t308 迁移（v7，store 内 `UPDATE env='win'→'local'`）之前写入 localStorage 的槽位含 env="win"，`load_saved_slots` 恢复后工作台按 env="win" 查询永远无结果（store 查询过滤 `env = @env`）。修复建议：`KNOWN_ENVS = new Set(tokenStatsEnvSchema.options)` 并校验 `KNOWN_ENVS.has(x.env)`，不合法返回 null 槽。
- [Info][55] connectors/exa/manifest.json:28 — manifest 声明 LIMIT type 为 number，renderer 表单与 connector 按字符串处理（类型契约宽松但一致容忍） — `ExaServiceKeyForm.tsx:48` 把用户输入直接放进 `parameterValues["LIMIT"]`（字符串，未做数字校验），`build_params` 统一 `String(value)`，connector `parse_limit` 用 `Number(raw)` 兜底（非数→0）。可复现：表单输入 "abc" 也能保存成功，随后 LIMIT 静默变 0（无预算，status unknown），无任何校验提示。修复建议：表单侧按数字校验或复用 manifest type 做输入约束，至少对非数字值给出错误提示。
- [Info][50] src/main/core/logging.ts:26-40 — getCurrentSegmentCount 对 `app-<date>.N.log` 段号解析与 cleanupOldLogs 的 7 天清理在段文件超龄时行为不一致（观察） — 段文件（app-2026-08-13.3.log）也参与 cleanupOldLogs 按 mtime 删除，但 `getCurrentSegmentCount` 会把任意数字段号计入当前段计数；当日日志跨天重写时（新日期前缀）段号不重置。此为观察项：仅影响段命名连续性，无行为错误，备查。

## Reviewed files

审查 bundle（18）内 79 个文件：

- connectors/exa/connector.ts、manifest.json
- connectors/mimo/connector.ts、manifest.json
- docs/archive/tasks/t302…t327（25 个 handoff.json：t302/t303/t305/t306/t307/t308/t309/t310/t311/t312/t313/t314/t315/t316/t317/t318/t319/t320/t321/t322/t323/t324/t325/t326/t327）
- src/main/cli/args.ts、cli-json.ts、client.ts、import-config.ts
- src/main/core/logging.ts
- src/main/core/popup/popup-height-controller.ts
- src/main/core/token-stats/claude-reader.ts、collector.ts、grok-reader.ts、kimi-reader.ts、manager.ts、opencode-reader.ts、paths.ts、query-dispatcher.ts、query-worker.ts、reader-utils.ts、scan-state.ts、token-stats-store.ts
- src/main/window/window-bounds.ts、window-manager.ts
- src/preload/usageboard-api.ts
- src/renderer/components/Button.tsx、CpaConnectorSettings.tsx、ProviderAccountList.tsx、SecretInput.tsx、UpcomingResetRow.tsx
- src/renderer/components/forms/CpaMgmtForm.tsx、ExaServiceKeyForm.tsx、OAuthDeviceForm.tsx、WebLoginForm.tsx
- src/renderer/components/token-stats/BarChart.tsx、Heatmap.tsx、MetricDonut.tsx（未出 finding 仍审）、RangePicker.tsx、SessionTable.tsx（未出 finding 仍审）
- src/renderer/lib/token-stats/format.ts、query-cache.ts、types.ts；usage-colors.ts；utils.ts；workspace/copy-format.ts、pane.ts、selection-store.ts、slots.ts、workspace-storage.ts
- src/shared/schemas/auth.ts、manifest.ts、observation.ts、plugin-metadata.ts、plugin-output.ts

## 执行过的只读检查

- `git rev-parse HEAD`（51ea3972）、`git status --short`（工作树无修改）
- bundle.json 读取：111 bundles 按 id 排序，chunk 6 取 index%6==5 共 18 个
- 上下游追踪阅读：src/main/core/connector/{host-io,runtime,net-client}.ts、src/main/core/scheduler/refresh-service.ts（build_params/execute_connector）、src/main/core/local-api/server.ts、src/main/ipc/config-ipc.ts、src/main/core/config/types.ts、src/main/ipc/token-stats-ipc.ts、src/preload/index.ts、src/shared/types/{ipc,token-stats}.ts、src/shared/lib/connector-thresholds.ts、src/renderer/lib/token-stats/{aggregate,chart-data}.ts、src/main/core/main-panel/main-panel-{config,controller}.ts、src/main/index.ts（cli serve 块）
- 测试核对：tests/integration/connector/{exa_connector,mimo-connector,manifest-contract}.test.ts、tests/unit/main/core/token-stats/{claude-reader,paths}.test.ts、tests/unit/shared/connector-thresholds.test.ts
- `git log`/`git blame`：popup-height-controller 75%→100%（60fa5f06）、token-stats daily date 语义（9d77aaea）

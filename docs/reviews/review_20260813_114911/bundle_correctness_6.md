# Review Bundle — correctness | chunk 6

- perspective: correctness
- chunk: 6
- reviewed bundles: 18 / 111（index % 6 == 5）
- reviewed files: 79
- HEAD: `51ea3972efefea568cc2fba3e530ea5f69296182`

## Findings

- [Medium][70] src/main/core/token-stats/collector.ts:503 — 超上限被截断的 sessions/daily 永久丢失，且与 records 的防丢守卫自相矛盾 — `collect()` 对 sessions（503-506）与 daily（507-510）只做 `if (len >= MAX_RECORDS) break`，未记录被跳过项；而 `read_source`（360-362、376-377）在 push 之前就已推进该源扫描状态（costs offset / jsonl mtimes）。下一轮只读增量，被截断的会话永不再发射、永不入库。同一函数对 records 明确写了「capacity check BEFORE marking emitted，否则命中上限的记录被标记但永不写入」（513-519 注释），sessions/daily 却缺同等守卫。测试 `tests/unit/main/core/token-stats/collector.test.ts:667` 固化「截断+告警」但未覆盖状态推进导致的丢失。修复：被截断的 sessions/daily 记入未发射集合（或上限命中时不推进扫描状态 / 下一轮重放），与 records 语义对齐 — 修复建议：把未发射的剩余项缓存到下一轮 update，或命中上限时让该源本轮不推进 offset/mtime。
- [Medium][65] src/renderer/components/token-stats/BarChart.tsx:231 — hour 轴标签用系统时区，而桶边界是固定 UTC+8，非 UTC+8 机器标签与数据错位 — SQL 侧 `query_hour_buckets`/`dashboard_local_boundary`/rollup 全用固定 UTC+8（token-stats-store.ts:418-427、1244），而渲染侧 hour 轴 `new Date(bucket_start).getHours()`（BarChart.tsx:219、231）与 `bucketize`（aggregate.ts:65-74 `date.setMinutes(0,0,0)`）按系统本地时区取整。数据按 UTC+8 时点归桶，标签却显示本地时，如 UTC-8 机器 13:00(UTC+8) 的计数标在「05:00」下方；`% 6 === 0` 的隔点跳标也随之时区漂移。`prepareBarDataFromHourBuckets`（chart-data.ts:380-397）把 SQL 的 UTC+8 hour_start 映射到本地时区的 bucketize 轴，同样错位。注释明示面板固定 UTC+8，应让渲染侧统一用「+8h 后取 UTC 分量」而不是系统 TZ — 修复建议：轴标签/interval 断言改用 `new Date(bucket_start + 8*3600000).getUTCHours()`，`bucketize` 同样用 UTC+8 取整。
- [Low][55] src/main/core/token-stats/claude-reader.ts:152 — costs.jsonl 行缺 timestamp 时按 1970-01-01 处理并可成为 latest — `new Date(row.timestamp ?? 0).getTime()`：缺 timestamp 得 0，非 NaN 不会被 155 行过滤，进入 timestamps；163-168 行 `ts >= latest_ts`（初始 0）使 0 时点行也可能被选为 `latest`，导致该会话 started_at/ended_at 被污染为 1970、token 值取自错行。修复建议：过滤 `ts === 0` 或缺失 timestamp 的行（与 `parse_session_file` 的 `if (typeof ts_raw === "string")` 一致）。
- [Low][50] src/main/core/token-stats/collector.ts:247 — WSL 多 home 目录时自动探测用户取 readdir 首项，顺序非确定 — `lister(...)[0] ?? ""`：`readdirSync` 返回顺序无排序保证（按目录项/inode），一台机器存在多个 `/home/<user>` 时探测结果不稳定，可能随机读到错误用户的路径，后续 `\\\\wsl.localhost\\<distro>\\home\\<user>` 全部指向错误目录。修复建议：对 lister 结果排序后取首个，或在多个候选时回退 "" 让用户显式配置。
- [Low][50] src/main/core/popup/popup-height-controller.ts:55 — MAX_HEIGHT_RATIO=1.0 与 0.75/75% 注释失配 — t081（commit 60fa5f06）把常量 0.75→1.0，但 compute_target_height 的 docstring 仍写「Clamped to [collapsed_min, floor(workArea.height * 0.75)]」「Max height is rounded down so the popup never exceeds the 75% constraint」（55-59），apply_locked_size 注释也写「must not exceed the 75% screen rule」（67）。实际行为是 100% workArea。修复建议：同步注释为 100%（或引用常量），避免后续维护误判。
- [Low][45] src/main/window/window-manager.ts:135 — file:// URL 用字符串拼接而非 pathToFileURL，路径含空格/#/? 时风险 — `return \`file://${opts.rendererIndexPath}?${query}#${route}\``：rendererIndexPath 来自 `join(\_\_dirname, "../renderer/index.html")`，Windows 默认安装路径含空格（如 `C:\Program Files\...`），路径含 `#`/`?`时更直接破坏 URL。同仓`src/main/ipc/helpers.ts:25`已用`pathToFileURL`做 sender 校验，此处拼接与其编码规则不一致。修复建议：用`pathToFileURL`+`fileURLToPath` 语义构建，至少对路径做 percent-encode。
- [Low][45] src/main/cli/import-config.ts:82 — vault 写 secret 与 config save 之间崩溃留下孤儿 vault key — 82-88 行逐 key `secretsStore.set`，117 行 `configStore.save(stripped)`；若进程在这两步之间退出（崩溃/断电），vault 已含新凭据而 config.json 未更新，回滚逻辑（118-129）只覆盖 save() 抛异常路径。修复建议：先落盘 config（含占位/引用）再写 vault，或把 vault 写入放在 config save 成功后（失败再回滚 config）。
- [Low][40] src/main/core/token-stats/manager.ts:81 — apply_batches 中途异常丢弃剩余批次且不回调 on_update — step() 中 `upsert_sessions` 成功后 `upsert_records` 抛错（87-91 catch 直接 return），offset 不再推进，剩余 chunk 与 `deps.on_update?.()`（95）全部丢失；此时 collector 扫描状态已推进，本轮其余数据不再送达。修复建议：catch 后记录失败批次并继续/重试剩余批次，最后仍回调 on_update（或带 error 标记）。
- [Info][30] src/renderer/lib/utils.ts:27 — format_reset_time 的 typeof 三目两分支相同（死代码） — `typeof timestamp === "number" ? new Date(timestamp) : new Date(timestamp)` 两分支恒等；若传非法字符串得到 Invalid Date 也不校验。修复建议：删除三目，直接 `new Date(timestamp)` 并对 Invalid Date 回退。
- [Info][25] connectors/mimo/connector.ts:155 — balance 状态用未取整 limit，与展示用 balance_limit 不一致 — `ctx.status.for_balance(balance, limit)` 传原始 `limit`（80 行才算出 `balance_limit = Math.round(limit*100)/100`），阈值判定与 `used` 取整口径相差 <0.01，仅在小数限额下可观测。修复建议：改传 `balance_limit` 保持口径一致。

## Reviewed files

- connectors/exa/connector.ts, connectors/exa/manifest.json
- connectors/mimo/connector.ts, connectors/mimo/manifest.json
- docs/archive/tasks/t302..t327（root_config_02 全部 25 个 handoff.json，均已 JSON 解析有效、status=done，历史文档无代码语义）
- src/main/cli/args.ts, cli-json.ts, client.ts, import-config.ts
- src/main/core/logging.ts
- src/main/core/popup/popup-height-controller.ts
- src/main/core/token-stats/{claude-reader,collector,grok-reader,kimi-reader,manager,opencode-reader,paths,query-dispatcher,query-worker,reader-utils,scan-state,token-stats-store}.ts
- src/main/window/window-bounds.ts, window-manager.ts
- src/preload/usageboard-api.ts
- src/renderer/components/Button.tsx, CpaConnectorSettings.tsx, ProviderAccountList.tsx, SecretInput.tsx, UpcomingResetRow.tsx
- src/renderer/components/forms/{CpaMgmtForm,ExaServiceKeyForm,OAuthDeviceForm,WebLoginForm}.tsx
- src/renderer/components/token-stats/{BarChart,Heatmap,MetricDonut,RangePicker,SessionTable}.tsx
- src/renderer/lib/token-stats/{format,query-cache,types}.ts, usage-colors.ts, utils.ts
- src/renderer/lib/workspace/{copy-format,pane,selection-store,slots,workspace-storage}.ts
- src/shared/schemas/{auth,manifest,observation,plugin-metadata,plugin-output}.ts

## 执行的只读检查

- `git rev-parse HEAD` / `git log`（HEAD、popup/collector/BarChart 历史、`git log -L` 定位 MAX_HEIGHT_RATIO 变更 commit 60fa5f06）
- 交叉阅读上下游：main-panel-controller.ts（popup 控制器生命周期/reset）、chart-data.ts/aggregate.ts（时区口径）、log-ipc.ts（exportCurrentLog 调用方）、helpers.ts（file:// sender 校验）
- 测试对照：collector.test.ts:667 上限截断测试、manager.test.ts:383「sessions exceed limit」
- 25 个 handoff.json 逐一 JSON 解析校验
- 仅只读；未修改任何代码/测试/配置/文档（本报告文件除外）

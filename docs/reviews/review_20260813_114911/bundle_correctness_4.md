# Correctness Review — bundle_correctness_4

- perspective: correctness
- chunk: 4
- 审过 bundles: 18 / 文件: 50
- HEAD SHA: `51ea3972efefea568cc2fba3e530ea5f69296182`
- 检查方式: 全文件逐行阅读；主动追踪下游（refresh-service、runtime-store、observation-store、observation schema、manifest schema、token-stats query_sessions、preload route 分发、SettingsView 接线）与 git log 确认语义；无 `// @review-ok` 豁免。

## Findings

- [Medium][65] connectors/cpa/connector.ts:305 — parse_antigravity 缺失 remainingFraction 时按 0 处理 → 误报 100% 用尽 — `let remaining = to_number(quota["remainingFraction"]); if (remaining <= 1) remaining *= 100;`：`to_number(undefined)` 返回 0，因此 quotaInfo 存在但无 remainingFraction 字段（或字段非法）的模型被当作「剩余 0」参与组内 min 计算，整组 used 变 100、status=critical，用户看到错误告警。`to_number` 无法区分「0」与「缺失」。修复：先判断 `quota["remainingFraction"] === undefined || typeof !== number` 时跳过该模型（`continue`），不要用 0 参与聚合。

- [Medium][70] connectors/cpa/connector.ts:204 — parse_codex reset_at 解析失败时静默丢弃且跳过 reset_after_seconds 兜底 — `if (raw_reset != null) { let ts = Number(raw_reset); if (ts < 1e12) ts *= 1000; if (Number.isFinite(ts)) reset_at = ts; } else { ...reset_after_seconds... }`：raw_reset 为非数值（如 ISO 日期字符串 "2026-08-20T00:00:00Z"）时 `Number()` 得 NaN，reset_at 保持 null，且因 `raw_reset != null` 走不进 else 分支，`reset_after_seconds` 兜底也被跳过——两个信息源全部丢失，仅表现为 reset_at=null。修复：`ts` 非 finite 时继续尝试 reset_after_seconds（把 else 改为独立判断或 fallthrough）。

- [Low][60] connectors/cpa/connector.ts:159 — resolve_codex_window 对字符串型 duration_seconds 不识别 — `duration_seconds === 18_000` 严格相等；若上游返回字符串 "18000"，已知窗口（5小时/一周/一月）全部不命中，且 generic 分支要求 `typeof === "number"`，最终退回 fallback_label + cycleDurationMs=null，丢窗口语义。修复：先 `Number(duration_seconds)` 归一化再比较（NaN 时走 fallback）。

- [Low][75] connectors/cpa/connector.ts:355 — parse_kimi 未钳制 used>total 的超 100% 百分比 — `const pct = Math.round((used / total) * 1000) / 10;` 无 `Math.min(...,100)` 与下限；used 超 total 时输出 120% 之类的值，status=critical、UI 显示超 100%。同文件 parse_claude（to_pct 上限 100）、parse_codex（min(...,100)）、parse_antigravity（clamp 0..100）均钳制，kimi 不一致。修复：`Math.min(Math.max(0, ...), 100)`。

- [Low][70] connectors/cpa/connector.ts:43 — to_pct 对负值无下限钳制 — `const pct = raw <= 1 ? raw * 100 : raw; return Math.round(Math.min(pct, 100) * 10) / 10;`：负 utilization（上游脏数据）→ 如 -5 → -500%，status_for_pct 返回 normal，UI 显示负百分比。修复：先 `Math.max(0, raw)`。

- [Medium][60] connectors/grok/connector.ts:119 — get_legacy_reset_at 返回 NaN 会整条 observation 被 schema 丢弃 — `return typeof config.billingPeriodEnd === "string" ? Date.parse(config.billingPeriodEnd) : null;`：Date.parse 对非法日期字符串返回 NaN（非 null），而 `script_observation_schema.reset_at = finite_number.nullable()` 拒绝 NaN → run_connector 直接跳过整条总用量观测（含 used%），用户丢失总用量指标并可能触发 "no usable usage fields" failed 上报。同文件 parse_rfc3339 有 `Number.isFinite` 守卫，此处缺失。修复：`const ts = Date.parse(...); return Number.isFinite(ts) ? ts : null;`。

- [Info][80] connectors/tikhub/connector.ts:27 — api_key 缺失时静默 return [] 不报 failed_account — `const api_key = (ctx.params["API_KEY"] ?? "").trim(); if (!api_key) return [];`：与 grok 的约定（空结果须 report_failed_account，见 refresh-service t039 注释）不一致。当前实际不可达——API_KEY 是 required secret，build_params 缺值先抛 "Missing required secret"；但若脚本被其它宿主直接调用（local-api 测试路径），空返回会被 refresh-service 当作「无数据」处理。建议与 grok 对齐：`ctx.report_failed_account("tikhub", ...)` 后再 return []。

- [Low][55] scripts/repo_template/repo_state.py:146 — cmd_added_lines 对引号转义路径解析错误，--exclude 失效 — `current_path = line[4:].removeprefix("b/")` 假设 `+++ b/<path>` 未加引号；含空格/非 ASCII 的文件名在 git 默认 core.quotePath 下输出 `+++ "b/a b.ts"`（带引号与 \xxx 转义），路径解析含引号导致 `_excluded` 匹配失败，清洁度计数把被排除文件的新增行算进来。修复：用 `git diff --name-only -z`（NUL 分隔）替代解析 `+++` 行，或先 `git config core.quotePath false`。

- [Low][60] scripts/repo*template/\_id_scan.py:121 — \_entry_number 只认小写 slug，手工建的大写文件名编号不可见 — `re.fullmatch(rf"{prefix}([0-9]{{3,}})*[a-z0-9_]+{suffix}", name)`：若有人手工创建 `p047*MyEntry.md`（未走 pending.py 的 SLUG_RE 校验），扫描不识别其编号，`allocate`可能把 p047 分配给新条目造成同号冲突。防御性缺口（受控入口已校验）。修复：slug 段放宽为`[A-Za-z0-9*]+` 或在扫描时对不匹配文件告警。

- [Medium][80] src/main/core/connector/runtime.ts:114 — race_with_timeout 超时后不取消脚本异步工作，脚本继续在后台运行 — setTimeout 只 reject 等待方；脚本 main() 里已发起的异步操作（HTTP、定时器、循环）不受控继续执行。连接器超时（15s）后 refresh 失败并 stale 标记，但旧脚本仍可能在跑，下一次刷新又启动新脚本 → 同一实例并发多个脚本实例反复打上游（资源泄漏 + 重复请求）。`vm.runInContext` 的 timeout 只覆盖同步段。修复：超时时向脚本暴露 AbortSignal（ctx.signal），脚本 HTTP 请求绑定 signal；至少对已超时实例的并发执行计数并拒绝重叠启动。

- [Info][85] src/main/core/connector/runtime.ts:172 — `raw_result instanceof Promise` 跨 realm 恒为 false，日志误导 — vm 上下文里的 Promise 是另一 realm 的构造器，`instanceof` 恒 false，debug 日志 `isPromise=false` 永远错。`await Promise.resolve(raw_result)` 本身跨 realm 正常，行为无影响。修复：改记 `typeof raw_result === "object" && raw_result !== null` 或删该日志。

- [Low][50] src/main/core/connector/net-client.ts:218 — 请求超时经 AbortController abort 产生的错误消息无 "timeout" 字样，下游分类失效 — `setTimeout(() => abort_controller.abort(), effective_timeout)` 与 undici 的 headersTimeout/bodyTimeout 同时生效；若 abort 先到，脚本 catch 到的是 "This operation was aborted"，refresh-service 的 `is_timeout_error`（匹配 "timed out|execution timeout"）与 `is_connection_error` 都不命中，连接错误计数归零、重试分类与用户文案失真（cpa 连接器会把 aborted 当普通错误上报）。修复：abort 前先置超时标志或 reject 时用明确的超时错误消息。

- [Low][80] src/main/core/connector/tier1-poll-executor.ts:113 — poll 路径 status 硬编码 "normal"，阈值永不计算 — `status: "normal"` 与 `display_style: "ratio"` 配合时，used/limit 达 0.9/0.95 也显示 normal。当前 16 个内置连接器全部走 script 路径（execute_poll 为死路径），仅用户自建 poll-only manifest 会命中。修复：用 `ctx.status.for_ratio(used, limit)` 派生 status（与 refresh 路径一致）。

- [Low][70] src/main/core/connector/probe-executor.ts:37 — detect_metric_type 把含 "quota"/"total" 的 used 头误分类为 limit — 顺序先查 "quota"/"total" 再查 "used"：头名 "x-quota-used" 命中 quota → 归类 limit；若 manifest 同时列了 "x-quota-used" 与 "x-quota-limit"，used 变 null、limit 取第一个 → 产出 used=null 的观测。当前无内置 probe manifest（死路径）。修复：把 "used" 检查提到 quota 之前，或对同时含 quota+used 的头按后缀精确匹配。

- [Medium][70] src/main/ipc/event-ipc.ts:44 — catch-log-rethrow 把广播失败转成刷新失败/主进程未捕获异常 — onStateChange 与 themeHandler 内 `win.webContents.send` 在窗口销毁竞态下抛 "Object has been destroyed"，catch 后 rethrow：(a) runtime-store.updateState 的监听器异常向上传播，refresh-service 的重试 catch 把它当连接器失败——重试 3 次后把该实例全部历史观测标 stale 并置 failed，且连接器-ipc 的 .catch 再补一条 failed 快照；(b) themeHandler 在 nativeTheme "updated" 事件监听器内 rethrow → 主进程未捕获异常。修复：广播失败仅 log.warn，不 rethrow。

- [Low][65] src/main/ipc/session-history-ipc.ts:87 — query_all_sessions 用非唯一排序键做 OFFSET 分页，可跳行/重行 — 循环 `while (page.length === CONTENT_SEARCH_PAGE_SIZE)` 按 `ORDER BY ended_at DESC, ended_at DESC`（query_sessions 内部）分页；大量会话共享同一 ended_at（如 ended_at=0 的未完成会话、批量写入）时 SQLite 对并列行的返回顺序不稳定，跨页边界可能重复或跳漏行。内容搜索的 candidates/metadata 两趟全表分页会得到不一致集合。修复：query_sessions 增加唯一 tie-breaker（id DESC）或在会话数少时一次取全。

- [Low][70] src/main/ipc/session-history-ipc.ts:207 — SESSION_HISTORY_RECENT 的 limit 被 provider 默认上限 100 静默截断 — handler 原样透传 `limit`，但 recent_sessions 经字符串形式 `sessions_provider(source, env)` 调用 `query_sessions({source, env})`，其 `limit ?? 100` 默认 100 → limit>100 的请求静默只返回 100 条，且排序后再 slice 属重复工作。修复：RECENT 直接传 `{source, env, limit, offset: 0}`。

- [Medium][60] src/main/ipc/config-ipc.ts:318 — handleConfigDuplicate / handleConfigCreateInstance 直接 save 全量配置，无冲突检测 — 与 handleConfigSave 的 `saveIfBaseMatches` + CONFLICT 防护不一致：两个窗口并发 duplicate/create 时各自基于旧 config 全量写盘，后写者覆盖先写者新增的实例（lost update）。create_instance_and_save 流程随后再 CONFIG_GET+SAVE 一次，进一步放大窗口。修复：这两个入口也走 base-match 校验，冲突时返回 CONFLICT 重试。

- [Low][55] src/main/ipc/config-ipc.ts:515 — handleConfigImportData 回滚 save(previous_config) 可能覆盖并发写入 — 先 `configStore.save(stripped)` 成功、secrets importAll 失败后回滚写 previous_config；若两步之间另一窗口保存了新配置，回滚把它整体覆盖丢失。修复：回滚也用 saveIfBaseMatches（base 取 stripped 保存后的当前值），失败则告警人工处理。

- [Low][60] src/main/ipc/auth-ipc.ts:180 — trySilentCookieRefresh 按 cookie 名匹配计数，过期/空值 cookie 也算成功 — `allCookies.filter((c) => targetNames.has(c.name))` 只比对名称，session 中残留的过期 cookie 也计入 `matched.length`，随后把 `name=`（空值）或过期值拼进 SESSION_COOKIE 保存，静默刷新「成功」但凭据无效。修复：校验 `c.expirationDate > now` 且 `c.value` 非空，不满足则视为未捕获。

- [Medium][75] src/renderer/components/AddAccountDialog.tsx:182 — handle_save 无 catch，apikey/session 添加失败完全静默 — `try { await on_save(params); on_close(); } finally { set_saving(false); }` 无 catch；`error_message` 在本文件只被 `set_error_message(null)`（L170/179/185），从不置非 null，L305-312 的错误渲染块死代码。on_save（create_instance_and_save → saveSecrets/save_config）reject 时（IPC 失败、CONFLICT 等）变成未处理 rejection，用户点击「添加账号」无任何反馈，对话框保持原样。cpa/web_login/oauth 表单路径有各自 catch 不受影响。修复：catch 后 `set_error_message(...)` 并保留对话框。

- [Low][70] src/renderer/components/TrendSparkline.tsx:60 — percent 越界时数据点落在 viewBox 外不可见 — `y_at(v) = pad_top + inner_height * (1 - v/100)`：percent>100（如 kimi 未钳制）时 y 为负，percent<0 时 y 超底，圆点/折线被裁掉，用户看不到该点（且折线穿过图外）。修复：y 值钳制在 [pad_top, pad_top+inner_height] 或对越界值画箭头标记。

- [Info][85] src/renderer/components/CpaAddDialog.tsx:66 — 死 UI：对话框不可达且按钮无 onClick — `showCpaAdd` 在 SettingsView.tsx 只在 L123 声明 false、L685 渲染，全仓无 `setShowCpaAdd(true)`；即使渲染，CpaAddDialog 的「测试连接」「保存并同步」按钮（L59/L66）均无 onClick，点击无任何行为。添加 CPA 实际走 AddAccountDialog + CpaMgmtForm（有完整保存逻辑）。修复：删除 CpaAddDialog 及其引用，避免维护两份入口。

## No findings（低于报告阈值，仅记录观察）

- src/preload/route_api.ts、src/shared/constants.ts、src/main/core/open-connectors-dir.ts、src/main/core/settings-close-action.ts、src/renderer/components/Icon.tsx、ProviderOverview.tsx、WebLoginSection.tsx、session-shell/SessionShell.tsx、renderer/index.tsx：未发现 correctness 问题。
- src/main/ipc/build-info-ipc/log-ipc/popup-ipc/session-ipc/grok_auth_ipc/kimi_auth_ipc/token-stats-ipc/trend-ipc/logged/helpers/size-validation：逐行核对无确定性逻辑 bug（theme 非法值静默 return 无害：preload 侧 `void invoke` 不检查结果）。
- scripts/repo_template 其余文件（task.py/pending.py/findings.py/spikes.py/check_review_status.py/render_review_prompts.py/track_worktree.py）：`git mv` 后 `git add` 顺序、锁内分配、front matter 解析均核对无误；三处 parse_front_matter 重复实现已在注释中声明同步义务，非本次正确性问题。

## Reviewed files

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

- `git rev-parse HEAD` / `git status --porcelain`（工作树干净，HEAD=51ea3972efefea568cc2fba3e530ea5f69296182）
- 逐文件 Read；git log（auth-ipc、connector 目录近期提交）
- 下游追踪：refresh-service.ts（retry/stale/t039 空结果语义、build_params 缺 secret 抛错）、runtime-store.ts（监听器同步调用）、observation-store.ts（insert 无唯一约束、query_trend_series 语义）、observation.ts schema（finite_number 校验）、manifest.ts schema、types.ts（SnapshotSuccess.updatedAt 为 string，DTO 转换一致）、observation-mapping.ts、token-stats-store.ts query_sessions（limit/offset 生效确认，分页可终止）、preload/index.ts route 分发（hash.slice(1) 与 route_api 一致）、SettingsView/AccountDialog/use_connector_catalog 接线（onAddAccount 错误链）、CpaMgmtForm（endpoint_overrides 显式配置流成立）
- 遍历 connectors/ 16 个 manifest 确认全部走 script 路径（poll/probe executor 为死路径）
- 统计：18 bundles / 50 files；finding 23 条（Medium 7 / Low 11 / Info 5）

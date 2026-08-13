# Contract Review — bundle_contract_5

- **perspective**: contract
- **chunk**: 5（`index % 6 == 4`）
- **HEAD SHA**: `51ea3972efefea568cc2fba3e530ea5f69296182`
- **审过 bundles**: 18 / 111（index 4,10,16,22,28,34,40,46,52,58,64,70,76,82,88,94,100,106）
- **审过 files**: 100（connectors_deepseek 2、connectors_kimi 2、root_config_01 25、scripts_repo_template_repo_task 20、src_main_core_local_api 1、src_main_core_paths 1、src_main_core_storage 1、src_main_security 1、src_preload_token_stats_events 1、renderer 组件 4、add_account 5、settings 4、renderer_lib_01 25、shared_lib 6）

## Findings

- [High][90] src/renderer/views/SettingsView.tsx:195 — 隐藏账号 override 写入键与消费键契约错配（写 `accountId`，读 `accountKey`），主面板隐藏永不生效 — `hide_account` 把 `item.accountId`（如 CPA 子账号 `auth-a` 或直连 `deepseek`）写入 `config.accountOverrides.hidden[provider]`；唯一消费方 `apply_account_overrides`（src/renderer/lib/provider-usage.ts:346）却按 `account.id`（=`accountKey`，provider-usage.ts:188-193 定义：gateway 为 `sourceInstanceId|label|accountLabel`，直连为 `sourceInstanceId|accountId`）过滤。两键永不相交，隐藏操作持久化成功但主面板（use_popup_derived.ts:56-58 经 `apply_account_overrides` 过滤）仍显示该账号。settings 侧 UI 却按裸 `accountId` 判定隐藏态（accounts_list.tsx:147-150），因此 UI 显示"已隐藏"、主面板照常显示，静默失效。两侧单测各锁各的语义（tests/unit/renderer/account-overrides.test.ts:21-33 写入裸 id；tests/unit/renderer/provider-usage.test.ts:796-801 用复合 key 过滤），无端到端用例覆盖真实隐藏流程。修复：`hide_account` 改为写 `accountKey(item)`（SettingsView 已 import accountKey），accounts_list.tsx 的 `is_hidden` 判定同步改为 `accountKey(item)`，或反向让 `apply_account_overrides` 按裸 accountId 匹配（会破坏多实例去重语义，不推荐）。

- [Medium][70] src/main/core/local-api/server.ts:1189 — /v1/records、/v1/heatmap、/v1/hourBuckets、/v1/rollup、/v1/sessions、/v1/buckets 未校验数值型 query 参数，非数字输入产生 NaN 直入 SQL — 这些端点用 `Number(params.get("start"))` / `Number(params.get("limit"))` 直接构造 filters（1189-1196、1199-1213、1214-1228、1229-1243、1255-1267、1274-1282），非数字值（如 `start=abc`）产生 NaN，无 isFinite 校验即传入 store 的 SQL 绑定（LIMIT/OFFSET/时间范围）；同族 `/v1/dashboard` 走 zod（tokenStatsDashboardQuerySchema，`.safe()` 拒绝 NaN）返回 400。同一组非法输入在不同端点行为不一致（静默空结果或 500 `Internal server error` vs 400），且 `handle_request` 顶层 catch 只兜 500，不区分客户端错误。修复：抽一个共享 `parse_int_param`（isFinite + 非负校验）或对这些端点统一加 zod query 校验，非法输入返回 400。

- [Medium][65] src/renderer/lib/token-stats/chart-data.ts:927 — kpiFromRollup 的 sessions 计数按裸 `session_id` 去重，与同文件 rollup 会话口径（`source|env|session_id`）不一致，违反 p052「跨 env 同 session_id 不合并」 — `kpiFromRollup` 用 `new Set(rows.map(r => r.session_id)).size`，而 `rollup_group_metric`（:816）与 `rollup_session_key`（:798-800）均按 `source|env|session_id` 去重；同一 session_id 同时出现在 local 与 wsl 时，KPI 面板 sessions 数小于 donut/会话轴聚合数，数字互相矛盾。修复：kpiFromRollup 改用 `new Set(rows.map(r => rollup_session_key(r))).size`（需将 rollup_session_key 提升为非私有导出）。

- [Low][60] src/renderer/components/RenameAccountDialog.tsx:32 — 允许保存空备注，清空输入会把账号标签写成空串而非恢复默认 — `changed = trimmed !== current_label.trim()`：清空后 trimmed="" 仍 changed=true，`on_save("")` → SettingsView.tsx:540-549 `set_account_label(..., "")` 写入 `accountLabels`；`apply_account_labels`（provider-usage.ts:369-371）`custom === ""` 不命中回退分支（`custom === account.accountLabel` 为 false），主面板账号标签显示为空串；accounts_list.tsx:160-162 的 `?? item.accountLabel` 同样因空串非 nullish 不回落。建议：空串时删除该 label override（走 remove_account_label）或禁用保存按钮。

- [Low][55] src/renderer/lib/config-debounce.ts:60 — flush() 的返回 Promise 永不 reject，等待方无法感知持久化失败 — `queue.then(...).catch(err => { opts.on_error?.(err) })` 吞掉错误后把 queue 返回给 `flush()`/`flush_pending()`，调用方 `await flush()` 永远 resolve，配置保存失败被静默（仅 on_error 回调可感知，且默认未提供）。契约上 flush 应返回「保存是否成功」或让失败可观测。修复：catch 后再 throw（保留 on_error 回调），或在类型注释中明确「不 reject、仅回调」。

- [Info][50] connectors/kimi/manifest.json:33 — manifest poll.request.path 带前导 `/`（`/coding/v1/usages`）而脚本实际路径不带（`coding/v1/usages`，connector.ts:69）— 二者经 `new URL(path, base)` 拼接结果一致（net-client.ts:199），功能等价，但 manifest 声明的请求与脚本请求形态不一致；若未来复用 manifest poll 路径（manifest-driven polling）或改 URL 拼接逻辑，两处可能分叉。建议统一为同一拼写。

- [Info][45] connectors/kimi/connector.ts:98 — 周用量 metric 的 `window: "day"` 与 `cycleDurationMs: 7 天` 语义错位 — `observation_window_schema`（src/shared/schemas/observation.ts:3）允许 `"week"`，7 天周期配 `"week"` 才一致；`"day"` 会被趋势/重置消费方按日窗口理解（当前无实际影响，因 reset 用 resetTime）。建议改 `window: "week"`。

- [Info][40] src/renderer/components/add_account/LocalScanForm.tsx:20 — local_cli 授权路径是 mock，保存空凭据账号 — 表单 800ms 后固定显示「未找到本地授权文件」，无任何采集逻辑（注释自认 mock）；`resolve_auth_method`（auth-flow-registry.ts:29）对 source="local" 返回 "local_cli"，AddAccountDialog.tsx:212-218 对 local_cli 不收集 secrets 即 on_save（空 secrets），保存出的账号无法通过任何认证。当前无 connector 声明 source="local"/auth local_cli（全仓 manifest 检索为空），路径不可达，属预留 stub；待首个 local 型 connector 落地时必须实现真实扫描，否则静默产出不可用账号。

## Reviewed files

connectors/deepseek/connector.ts、connectors/deepseek/manifest.json、connectors/kimi/connector.ts、connectors/kimi/manifest.json；root_config_01 全部 25 文件（sync_state.json、.claude/settings.json、ci.yml、nightly.yml、release.yml、tasks_list.json、\_fire_meta.json、\_wait_status.json、t281-t301 handoff.json 17 个）；scripts/repo_template/repo_task/ 20 文件（**init**/attempts/cli/context/control/documents/git_ops/goal/integration/ledger/lifecycle/monitoring/plan/scheduling/store/view_server/view_static/board.css/board.js/chain_plan.js/worktrees）；src/main/core/local-api/server.ts、src/main/core/paths.ts、src/main/core/storage/write-json.ts、src/main/security/csp.ts、src/preload/token-stats-events.ts；src/renderer/components/AliasEditor.tsx、CpaCard.tsx、LabelMapDialog.tsx、RenameAccountDialog.tsx、UpcomingResetCard.tsx；src/renderer/components/add_account/（ApiKeyForm/LocalScanForm/SessionForm/VendorPicker/add_account_params.ts）；src/renderer/components/settings/（BarSchemeField/Select/SetRow/Toggle）；src/renderer/lib/ 25 文件；src/shared/lib/ 6 文件（auth-error/config_redaction/connector-thresholds/cookie_parser/logger/trend）。

## 执行的只读检查

- `git rev-parse HEAD`（51ea3972e…）；git log/blame 验证隐藏 override 与 accountKey 演化（SettingsView d2a27488、provider-usage eb524249/06000469）
- JSON 有效性：root_config_01 全部 JSON（python json.tool）；handoff.json 18 个逐字段对照 `_HANDOFF_TYPES` 契约（monitoring.py:132-145），全部通过
- CI/脚本契约：package.json scripts（check/test/test:e2e:web/test:packaged 等）与 ci.yml/nightly.yml/release.yml 引用一致；track_worktree.py 支持 `--write --agent`（.claude/settings.json hook 引用）
- 跨模块符号：cli.py 引用的全部 cmd\_\* 存在于 control/goal/plan/integration；compute_schedule 返回键与 control.py 解包一致；board.js/chain_plan.js 消费的 chains/taskIds/name 与 plan.py 输出一致
- 契约核对：cookieLogin/cookieLoginStatus 字段（CookieLoginResult/CookieLoginStatus，shared/types/ipc.ts）与 cookie_login_poll 使用一致；ui/Select onChange 事件契约；handleConfigImportData options 签名；build_request_context 的 new URL 拼接语义（kimi manifest path 前导斜杠等价）；observation_window_schema 枚举；tokenStatsDashboardQuerySchema zod `.safe()` 拒绝 NaN

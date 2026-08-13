# Review bundle: tests_docs_spec / chunk 5

- perspective: tests_docs_spec
- chunk: 5（bundle index % 6 == 4）
- 审过 bundles: 18（connectors_deepseek / connectors_kimi / root_config_01 / scripts_repo_template_repo_task / src_main_core_local_api / src_main_core_paths_ts / src_main_core_storage / src_main_security / src_preload_token_stats_events_ts / src_renderer_components_AliasEditor_tsx / src_renderer_components_CpaCard_tsx / src_renderer_components_LabelMapDialog_tsx / src_renderer_components_RenameAccountDialog_tsx / src_renderer_components_UpcomingResetCard_tsx / src_renderer_components_add_account / src_renderer_components_settings / src_renderer_lib_01 / src_shared_lib）
- 审过 files: 99
- HEAD SHA: `51ea3972efefea568cc2fba3e530ea5f69296182`
- 验证：本 chunk 相关 8 个测试文件 62 用例全绿（vitest）；pytest 本机可跑（test_task_save.py 15 passed）

## Findings

- [Medium][85] src/renderer/lib/refresh-intervals.ts:14 — 下拉项「仅手动」映射 172800s，但调度层只认 manualRefreshOnly 标志，172800 仍会被按 48h 周期自动轮询 — 证据：REFRESH_INTERVAL_OPTIONS 末项 `{ label: "仅手动", seconds: 172800 }`；全仓唯一消费间隔处 `src/main/core/scheduler/scheduler-orchestrator.ts:58` 仅 `if (!connector.enabled || connector.manualRefreshOnly) continue`，`resolve_refresh_interval` 与 `connector-scheduler.ts:32` 均不识别 172800；`manualRefreshOnly` 只由 auto-seed（manifest.manualDefault）或克隆写入（auto-seed.ts:63 / config-ipc.ts:311,357），SettingsForm 提交路径（SettingsForm.tsx:280 `refresh_label_to_seconds(syncInterval)`）从不设置它；config-store.test.ts:290 甚至断言 172800 作为合法间隔被 clamp 保留。旧 spec（docs/archive/\_pre_opinit_20260705/TASKS.md:477）定义「仅手动」= 无自动刷新。用户在常规连接器下拉选「仅手动」后，调度器仍每 48h 调 API，与标签语义和旧 spec 矛盾；无任何测试覆盖「仅手动 → 不调度」。修复建议：保存路径把「仅手动」映射为 `manualRefreshOnly: true`（间隔落 0/忽略），或删除该下拉项；补一个调度层测试断言 172800 不排程。
- [Medium][75] connectors/kimi/connector.ts:113 — 「5 小时限额」取 `limits?.[0]` 但从不校验 `window.duration === 300`，注释声称的选择准则未实现也未测试 — 证据：代码 `const rate_limit = response?.limits?.[0]` 只读 detail；注释「5 小时限额（limits[0]，duration=300 分钟）」；测试 kimi-connector.test.ts:22-33 的 fixture 硬编码 `window: { duration: 300 }`，但 16 个用例没有任何一个断言实现读取 duration，也没有非 300 duration 窗口的用例——若实现删掉 duration 校验测试仍全绿。Kimi API 一旦新增/重排限额窗口，`kimi:five_hour` 会静默绑定错误窗口。修复建议：按 `rate_limit.window?.duration === 300`（或按 duration 动态映射窗口）选窗，并补一个 `duration: 60` 窗口不产出 five_hour 的用例。
- [Medium][90] tests/repo_template/ 下 18 个 pytest 测试文件（test_task_save / test_plan / test_goal / test_view_server / test_task_start_flow 等，git 已跟踪）未接入任何 CI/脚本，task.py 工具链回归全绿通过 — 证据：package.json 的 `test` 仅为 `vitest run`，`pnpm check`/`lint`/`typecheck`/`deadcode` 均不触 .py；.github/workflows/ci.yml / nightly.yml / release.yml 无 pytest 引用；仓库无 pyproject.toml/pytest.ini（仅 .pytest_cache/ 在 .gitignore，说明只有本机手跑过）。本机 `python3 -m pytest tests/repo_template/test_task_save.py -q` 15 passed，证明可跑但无人自动跑。repo_task 是 agent 日常使用的 task 工具链（8000+ 行 Python），其状态机/账本/调度损坏会直接破坏开发流程。修复建议：CI 加 pytest 步骤（或 `pnpm test` 串联 `python3 -m pytest tests/repo_template`），并固定依赖声明。
- [Low][85] tests/integration/connector/deepseek-connector.test.ts:9-34 — 测试内联复制 manifest 而非读真实 connectors/deepseek/manifest.json，manifest 漂移不触发红测 — 证据：create_ctx/manifest 均在测试内硬编码（LIMIT default "100"、endpoints、label 全部复制）；同目录 kimi-connector.test.ts:10,47-51 走 `readFile(manifest_path)` 并校验 schema；manifest-contract.test.ts 只校验 required secret 参数与 provider id，不覆盖 LIMIT default/label 变化。若真实 manifest 修改 LIMIT 默认值或标签，deepseek 行为测试依旧通过（假绿）。修复建议：与 kimi 测试一致从磁盘加载 manifest，并加 schema 校验用例。
- [Low][60] src/main/core/local-api/server.ts:555-571 — 同一 subscriber_id 重复 subscribe 时覆盖订阅表但未注销旧 watcher，旧 on_update 继续向新 client 推送旧会话消息；测试未覆盖该路径 — 证据：`ctx.subs.set(subscriber_id, {...loc, client})` 前无 `subs.get`/`service.unsubscribe`；旧订阅 on_update 闭包读 `ctx.subs.get(subscriber_id)` 拿到新 sub 的 client，用旧 loc 的 session 数据写 SSE。t279 测试覆盖了断连重连竞态（f005，server.test.ts:2131）与 unload 注销（f004），但没有「未断开即重订阅同一 id」用例。修复建议：subscribe 前若存在旧 sub 先 `service.unsubscribe` 旧 loc，或对重复 id 返回 409；补对应测试。
- [Low][85] src/renderer/lib/session_meta.ts:1-14 — login_url/cookie_names 映射已无任何 import（死代码），且 kimi 条目与现行 oauth_device 认证模型矛盾 — 证据：全仓 grep 无 `session_meta` 之外文件 import 该模块（web_login 元数据改由 manifest metadata.login_url/cookie_names 提供，AddAccountDialog.tsx:356-361）；kimi 条目 `login_url: https://www.kimi.com/login, cookie_names: [access_token, refresh_token]` 与 connectors/kimi/manifest.json:23-26 的 `auth.method=oauth_device` 冲突（t124 后即无人消费）。修复建议：删除该文件或改为 manifest 驱动；至少移除 kimi web-login 过期数据。
- [Low][70] connectors/kimi/manifest.json:16-21 — manifest 声明可选 API_KEY（exposeToScript: true）作为回退，但所有 UI 路径都设不了它，API_KEY-only 连接器路径不可达 — 证据：SettingsForm.tsx:319-325 `has_dedicated_auth_section && param.type === "secret"` 对 kimi（oauth_device）隐藏全部 secret 参数；AddAccountDialog.tsx:368-379 oauth_device 走 OAuthDeviceForm，只产出 OAUTH_TOKEN；kimi-connector.test.ts:142-147,180-190 覆盖的 API_KEY-only 成功路径在 UI 上无法触发（仅历史存量 vault 中的 API_KEY 有效）。修复建议：SettingsForm 对 oauth_device 供应商保留显式 API_KEY 输入，或从 manifest 移除该参数。
- [Low][75] src/renderer/components/add_account/VendorPicker.tsx:7-14 — `plugin_infos` prop 声明并透传但实现完全忽略，`can_add()` 恒 true，接口契约与行为不符 — 证据：props 接口含 `readonly plugin_infos: unknown[]`，函数体不引用；调用点 AddAccountDialog.tsx:339 仍传 `plugin_infos={plugin_infos}`；`can_add = () => true` 与注释「不因 plugin_infos 缺失而禁用」表明意图曾是插件感知可用性。修复建议：删除 prop 与死分支，或按插件状态实现禁用逻辑。
- [Info][70] src/renderer/components/add_account/LocalScanForm.tsx:20-30 — 「扫描本地授权文件」是 800ms 假扫描，永远只显示「未发现有效凭证」，「导入账号」仍可提交无凭据空实例；spec 将 local_cli 列为正式认证方式 — 证据：useEffect 只 setTimeout 翻转 phase，注释自认 "Mock scan — in production this would use IPC to read the filesystem"；docs/specs/connector-auth.md:15 将 `local_cli` 列入 `auth.method` 枚举，docs/archive/tasks/t107 spec 亦如此。行为已注释透明，但 spec/UI 语义（可导入本地授权）与实际（永远失败）错位，且无任何断言该流程行为的测试。修复建议：要么实现真实 IPC 扫描（或至少在校验前禁用「导入账号」），要么在 spec 中标注 local_cli 为占位。

## Reviewed files

- connectors/deepseek/connector.ts, connectors/deepseek/manifest.json, connectors/kimi/connector.ts, connectors/kimi/manifest.json
- tests/integration/connector/deepseek-connector.test.ts, kimi-connector.test.ts, manifest-contract.test.ts, \_ctx_status.ts
- .github/workflows/ci.yml, nightly.yml, release.yml, .claude/settings.json, .agents/skills/repo-template-sync/sync_state.json
- docs/archive/\_pre/omni_powers_sunset/op_execution/tasks_list.json, docs/archive/reviews/review_20260726_054747/\_meta/\_fire_meta.json + \_wait_status.json, docs/archive/tasks/t281…t337 24 个 handoff.json（t281–t337 全部 status=done，JSON 合法）
- scripts/repo_template/repo_task/\*.py（20 文件：**init**/attempts/cli/context/control/documents/git_ops/goal/integration/ledger/lifecycle/monitoring/plan/scheduling/store/view_server/worktrees + view_static/board.css/board.js/chain_plan.js）
- tests/repo_template/（18 个 pytest 文件抽查 test_task_save.py 可运行）
- src/main/core/local-api/server.ts（1632 行全读）, src/main/core/paths.ts, src/main/core/storage/write-json.ts, src/main/security/csp.ts
- src/preload/token-stats-events.ts
- src/renderer/components/AliasEditor.tsx, CpaCard.tsx, LabelMapDialog.tsx, RenameAccountDialog.tsx, UpcomingResetCard.tsx
- src/renderer/components/add_account/{ApiKeyForm,LocalScanForm,SessionForm,VendorPicker}.tsx, add_account_params.ts
- src/renderer/components/settings/{BarSchemeField,Select,SetRow,Toggle}.tsx
- src/renderer/lib/：account-overrides.ts, auth-flow-registry.ts, common-services.ts, config-debounce.ts, config-sync.ts, cookie_login_poll.ts, device-login-url.ts, display_label.ts, drag-reorder.ts, echarts_token_resolver.ts, is-web.ts, label-map-util.ts, logger-transport.ts, panel-navigation.ts, provider-usage.ts, refresh-intervals.ts, session-history/layout.ts, session-history/markdown.ts, session-library/filter.ts, session-resume.ts, session_meta.ts, theme.ts, token-stats/aggregate.ts, token-stats/chart-data.ts, token-stats/filter.ts
- src/shared/lib/{auth-error,config_redaction,connector-thresholds,cookie_parser,logger,trend}.ts
- 参考读取（chunk 外调用方/相关实现）：src/main/core/scheduler/scheduler-orchestrator.ts, connector-scheduler.ts, hydrate-runtime-store.ts, auto-seed.ts；src/main/core/config/types.ts；src/main/ipc/config-ipc.ts；src/renderer/components/SettingsForm.tsx, AddAccountDialog.tsx, AccountDialog.tsx；src/renderer/views/settings-view/sections/accounts_list.tsx；tests/unit/{paths,main/security/csp,preload/token_stats_events,shared/_}.test.ts, tests/unit/renderer/components/{cpa_card,alias_editor,label_map_dialog,upcoming_reset_card,add_account_dialog,settings_form}.test._, tests/integration/{local-api/server,config/config-store,connector/_}.test._, package.json

## 执行过的只读检查

- 按 id 排序 bundle.json 计算 chunk-5 命中（18 bundle / 99 file）
- `git rev-parse HEAD`（51ea3972efefea568cc2fba3e530ea5f69296182）；git log 核查 session-resume.ts / session_meta.ts 历史
- 全仓 grep：172800 / manualRefreshOnly / refreshIntervalSeconds / resume_command / pytest / session_meta / login_url / 仅手动 的消费链与测试覆盖
- 跑测试：vitest 8 个相关文件 62 passed；`python3 -m pytest tests/repo_template/test_task_save.py -q` 15 passed
- 校验 root_config_01 全部 handoff JSON 合法且 status=done；workflows 引用的 pnpm 脚本均存在于 package.json

# Review bundle: tests_docs_spec | chunk 1

- **Perspective**: tests_docs_spec
- **Chunk**: 1（index % 6 == 0，共 19 个 bundle）
- **Bundles reviewed**: 19（connectors_antigravity / connectors_firecrawl / connectors_minimax / root_config_03 / src_main_config_callbacks_ts / src_main_core_main_panel / src_main_core_scheduler / src_main_core_vault / src_preload_index_ts / src_renderer_App_tsx / src_renderer_components_Card_tsx / src_renderer_components_CpaLabelMapDialog_tsx / src_renderer_components_ProviderCard_tsx / src_renderer_components_SessionSection_tsx / src_renderer_components_UsageBarList_tsx / src_renderer_components_provider_card_content_tsx / src_renderer_components_ui / src_renderer_styles / src_shared_types）
- **Files reviewed**: 约 110（bundle files 全读 + 追踪的测试/spec/配置/下游）
- **HEAD**: `51ea3972efefea568cc2fba3e530ea5f69296182`

## Findings

- [Medium][90] connectors/firecrawl/connector.ts:60 — `tokens.reset_at`（token-usage 的 billing_period_end 解析结果）计算后从未使用，两条观测的 `reset_at` 全部复用 `credits.reset_at` — 证据：`fetch_usage` 对 `/v1/team/token-usage` 同样解析 `billing_period_end` 到 `tokens.reset_at`（connector.ts:35-40），但 `base.reset_at: credits.reset_at`（connector.ts:72）使 tokens 指标的 reset 展示绑定 credit 周期；`tokens.reset_at` 无任何读取方（grep 确认）。`tests/integration/connector/firecrawl_connector.test.ts:29-47` 的 CREDIT/TOKEN payload 使用**相同** `billing_period_end`，测试无法暴露该偏差。修复建议：`base` 拆分为 credits/tokens 两份或按对应 `reset_at` 组装；测试增加 token 与 credit 周期不同的 fixture 断言 `reset_at` 各自正确。

- [Medium][85] docs/specs/connector-direct.md:21 — spec 声明 antigravity「读 `~/.antigravity/session.json`」，实现为空 stub — 证据：`connectors/antigravity/connector.ts:8-10` 的 `main()` 直接 `return []`，不调用 `ctx.files.read`；manifest.json:7-9 的 `local.paths` 指向 session.json 但无消费方。`tests/integration/connector/antigravity-connector.test.ts:44-50` 明确标注「stub」并只断言空观测，spec 文档未同步实现状态。用户在面板添加 antigravity 账号得到恒空数据且无失败提示。修复建议：spec 标注该连接器为占位 stub（或列出实现缺口），或在实现完成前从内置清单降级说明。

- [Medium][85] src/renderer/components/Card.tsx:6 — 死代码组件，knip deadcode 检查盲区 — 证据：全仓 grep 确认 `components/Card` 无任何 import（ui 组件实际使用 `components/ui/Card.tsx`，经 `components/ui/index.ts:3` barrel）；`npx knip` 输出 53 个 unused exports 但**不含**此组件，CI `pnpm deadcode`（package.json:29）绿灯放行。修复建议：删除该文件（或挂入 barrel 并真实使用），并核查 knip 对未引用组件文件的漏报配置（`knip.json` project 覆盖 `src/**/*.ts(x)`，应能命中）。

- [Medium][80] src/main/core/main-panel/main-panel-controller.ts:21 — `MIN_PANEL_WIDTH=472` 与 `floating-bounds.ts` 的 `MIN_FLOATING_WIDTH=320` / `DEFAULT_FLOATING_WIDTH=460` 语义冲突，首次浮窗宽度被静默抬升 — 证据：`restore_floating_bounds` 无 saved 时产出默认 460 宽（floating-bounds.ts:24-36），`create_panel_window` 随即 `clamp(bounds.width, MIN_PANEL_WIDTH, ...)`（main-panel-controller.ts:147）把 460 抬到 472；saved 宽度落在 320-472 区间同样被抬升，`floating_bounds.test.ts` 与 `main_panel_controller.test.ts` 只覆盖 1200 宽恢复路径（第 185-196 行），未覆盖首次默认宽度与 320-472 区间，两常量分裂无测试暴露。修复建议：统一最小宽度常量来源，并补「首次打开默认宽度」「saved 宽度 320-472」两条测试。

- [Low][70] src/preload/index.ts:548 — route API 装配（`switch(current_route)` 四档对象）无直接单测 — 证据：`tests/unit/preload/route_api.test.ts` 只覆盖 `select_grok_api` / `select_trend_api` / `select_session_history_api` 三个 helper；index.ts 的 setting/tray/session/popup 四档完整装配（popup 档 `config.save: config_full.save` 真实现 vs tray/session 档 no-op stub、`plugin: connector_methods` 超集暴露等）无测试锁定，仅靠 e2e 间接覆盖。修复建议：抽出 `build_api_for_route(route, deps)` 纯函数并表驱动断言各档方法是否触达真实 IPC。

- [Low][70] src/preload/index.ts:355 — `config.export(options?: ConfigExportOptions)` 的 `includeSecrets` 全链路被忽略 — 证据：preload `void options` 后裸调 `invoke(CONFIG_EXPORT)`；主进程 `src/main/ipc/config-ipc.ts:712` handler `(e) => ...handleConfigExport(deps)` 不接收第二参。`UsageboardApi.config.export` 类型签名（ipc.ts:560）声称支持 includeSecrets，但任何调用方都无法生效（renderer 亦无调用点）。修复建议：实现 includeSecrets 透传或从公开类型移除该选项。

- [Low][65] connectors/minimax/connector.ts:110 — 关键分支无测试触达 — 证据：`tests/integration/connector/minimax-connector.test.ts` 未覆盖：`is_weekly_redundant` 返回 true（weekly 被抑制）的分支（connector.ts:199 条件第二侧）、`period_key` 边界 5.1h/24.1h/168.1h（只测 4h 与 24h）、`model_key` 的 `speech-hd` / `MiniMax-Hailuo-*-Fast` / `music-cover` / `lyrics_generation` 分支、weekly `reset_at` 的一年 sanity 分支（只测 interval 侧，第 149-172 行）。这些分支的回归风险集中在排序、周期判定与冗余抑制，属真实生产路径。修复建议：补表驱动用例覆盖上述分支。

- [Low][60] .github/workflows/release.yml:62 — 上传 `artifacts/*.rpm` 但生产构建不产出 rpm — 证据：`electron-builder.yml:58-61` linux target 仅 AppImage + deb（rpm 只存在于 `electron-builder.test.yml:64`），release.yml 的 `*.rpm` 上传项恒为空且 `if-no-files-found: warn` 静默跳过（第 65 行）。修复建议：生产 linux target 补 rpm 或从 release 上传清单删除 `*.rpm`。

- [Info][50] src/shared/types/ipc.ts:541 — `UsageboardApi.plugin` 标注 `@deprecated` 但仍由 preload 暴露（`plugin: connector_methods`）且 renderer 无调用者 — 证据：preload/index.ts:554 与 601 等档位均暴露 `plugin`；renderer 全仓 grep 无 `usageboard.plugin.*` 调用。类型面与注释（deprecated）及实际暴露形成中间态。修复建议：移除 plugin 面或移除 deprecated 标注并保留兼容。

- [Info][45] src/renderer/styles/globals.css:221 — `--color-chip-active` 仅在 `.dark` 块定义（`var(--color-chip-active-dark)`），亮色模式无值且全仓无使用（grep 确认仅 globals.css 自身出现）— 修复建议：删除该死 token，或补亮色值。

- [Info][40] src/renderer/App.tsx:16 — route 分发（setting/tray/agent/session/popup 五路 switch）无直接单测，仅靠 e2e 与 use-route 单测间接覆盖 — 修复建议：可选，为五路渲染补轻量 smoke 断言。

- [Info][40] src/renderer/components/CpaLabelMapDialog.tsx:15 — 无直接单测（`tests/unit/renderer/components/` 下无对应文件，仅 settings_form 间接覆盖）；透传逻辑含 `save_target` 分支与 watched metric 聚合循环 — 修复建议：低优先，补充 provider/account 两 save_target 分支断言。

## Reviewed files

- connectors/antigravity/connector.ts, manifest.json；connectors/firecrawl/connector.ts, manifest.json；connectors/minimax/connector.ts, manifest.json
- 对应集成测试：tests/integration/connector/antigravity-connector.test.ts, firecrawl_connector.test.ts, minimax-connector.test.ts
- src/main/core/connector/host-io.ts, src/shared/schemas/manifest.ts（契约对照）
- root_config_03：.github/workflows/{ci,nightly,release}.yml, package.json, electron-builder.yml, electron-builder.test.yml, electron.vite.config.ts, eslint.config.ts, knip.json, playwright.config.ts, docs/tasks_index.json, docs/archive/tasks_index.json, t328/t329/t330/t331/t332/t333/t334/t335/t336/t337 handoff.json, docs/spikes/s008/code/{compare_aggregation,compare_read_scale}.ts, docs/spikes/s009/code/wal_readonly_concurrency.ts（+s008 report.md 与 src/main/core/token-stats/token-stats-store.ts 逐项核对结论一致）
- src/main/config-callbacks.ts + tests/unit/main/config-callbacks.test.ts + src/main/index.ts:582 接线
- src/main/core/main-panel/\*（6 文件）+ tests/unit/main/{main_panel_controller,floating_bounds,main_panel_config,agent_window_controller}.test.ts
- src/main/core/scheduler/_（8 文件）+ tests/{unit,integration}/scheduler/_（7 测试文件,用例清单核对）
- src/main/core/vault/\*（2 文件）+ tests/integration/vault/file-vault-backend.test.ts
- src/preload/index.ts + tests/unit/preload/route_api.test.ts + src/main/ipc/config-ipc.ts:712、session-history-ipc.ts:313（契约交叉验证）
- src/renderer/App.tsx；components/Card.tsx（死代码验证含全仓 grep + knip）；CpaLabelMapDialog.tsx；ProviderCard.tsx；SessionSection.tsx；UsageBarList.tsx；provider_card_content.tsx；components/ui/\*（20 文件）+ tests/unit/renderer/components/ui/ui.test.tsx；styles/globals.css + globals_css.test.ts + lib/usage-colors.ts（阈值核对）
- src/shared/types/{config,ipc,oauth,observation,plugin,token-stats}.ts + tests/unit/shared/\*（抽查）

## Read-only checks performed

- `git rev-parse HEAD` → 51ea3972（HEAD 与归档状态核对）
- 全仓 grep 验证：components/Card 引用、usageboard.plugin 调用、--color-chip-active 使用、firecrawl tokens.reset_at 读取方
- `npx knip`（CI deadcode 命令本体）确认组件死代码漏报
- python 解析对比 docs/tasks_index.json 与 docs/archive/tasks_index.json 结构
- spike 报告 vs 生产 token_stats_hour_rollup 表结构/回填标志一致性核对
- renderer config.save 调用点（PopupView.tsx:211）核对 popup 档真保存的设计意图

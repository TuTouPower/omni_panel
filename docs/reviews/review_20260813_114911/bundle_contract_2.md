# Contract Review — bundle_contract_2

- perspective: contract
- chunk: 2（bundle index % 6 == 1）
- 审过 bundle：19（connectors_claude / connectors_getoneapi / connectors_opencode_go / root_config_04 / src_main_core_auth / src_main_core_network / src_main_core_session / src_main_e2e_headless_ts / src_preload_log_throttle_ts / src_renderer_components_AccountDialog_tsx / src_renderer_components_CollapsibleCard_tsx / src_renderer_components_DeviceLoginSection_tsx / src_renderer_components_ProviderCard_tsx / src_renderer_components_SettingsForm_tsx / src_renderer_components_UsageRows_tsx / src_renderer_components_provider_card_states_tsx / src_renderer_components_workspace / src_renderer_views / src_web_main_web_tsx）
- 审过文件：65
- HEAD SHA：`51ea3972efefea568cc2fba3e530ea5f69296182`

## Findings

- [Medium][90] schemas/plugin-output.schema.json:25-133 — 公开插件输出契约（schemas/ 为跨服务接口契约）与当前 zod 源严重脱节，生成产物未重新导出 — 用 `scripts/export-schemas.ts` 同逻辑对当前 `pluginResultSchema`/`pluginMetadataSchema` 重新生成并 diff（已生成的临时文件对比）：提交版 `plugin-output.schema.json` 的 items 缺少 `metric_id`、`cycleDurationMs`、`error` 字段，且 `additionalProperties:false`（L133）会拒绝携带这些字段的合法输出；`provider` 仍是 11 项固定 enum（claude/codex/antigravity/kimi/glm/minimax/deepseek/tavily/firecrawl/mimo/opencode*go），无法表达 zod 现 enum 中已有的 getoneapi/exa/tikhub/grok 与 t095 开放的 snake_case 任意 provider（src/shared/schemas/plugin-output.ts:6-22 已改 regex `^[a-z]a-z0-9*]\*$`）；`plugin-metadata.schema.json`同步缺`login_url`/`cookie_names`（zod 源 src/shared/schemas/plugin-metadata.ts:56-57 已有）。`git log` 显示两 JSON 文件最后修改在 1a3bc4f9（remove gemini），晚于其后的 t049/t050/t051/t095/t278 zod 变更；`package.json`仅`schema:export`脚本、CI（ci.yml/nightly.yml/release.yml）与`pnpm check`均不执行，漂移会持续累积 — 修复：跑`pnpm schema:export` 重新生成并入库；CI 增加 schema 新鲜度检查（生成后 diff）。
- [Medium][85] connectors/claude/connector.ts:49 — 脚本硬编码 credentials 路径，manifest 声明的 `data_dir` 参数契约失效 — `connectors/claude/manifest.json:7-12` 声明 `data_dir`（type=string、`exposeToScript:true`、default `~/.claude`），设置表单会渲染该字段、`refresh-service.ts:118-125` build_params 会把它放入 `ctx.params`，但脚本从不读取，恒读 `~/.claude/.credentials.json`。用户在设置里改 data_dir 静默无效，连接器仍读固定路径（自定义 Claude 数据目录/多配置场景读错文件或读不到）。修复：`const dir = (ctx.params["data_dir"] ?? "~/.claude").trim() || "~/.claude"; ctx.files.read(dir + "/.credentials.json")`，与 manifest 契约一致。
- [Low][95] src/renderer/views/settings-view/sections/about_section.tsx:47 — Linux 平台在「关于」页显示 "Windows · x64" — `window.usageboard.platform` 类型为 `RendererPlatform = "darwin" | "win32" | "linux"`（src/shared/types/ipc.ts:488），此处判定 `=== "darwin" ? "macOS" : "Windows"`，Linux 落入 Windows 分支；且 "x64" 硬编码，arm64 设备也错误。项目明确跨 Windows/macOS/Linux（AGENTS.md）。修复：按三平台映射（linux → "Linux"），arch 用 `process.arch` 或省略。
- [Low][70] src/renderer/components/provider_card_states.tsx:46 — 认证失败横幅的 re-login 目标 `connectorError.instanceIds[0] ?? ""`，instanceIds 为空数组时以空串调用 `onReLogin(provider, "")` 或 `window.usageboard.settings.open({ instanceId: "" })`，后者在 SettingsView `open_settings_account_dialog`（src/renderer/views/SettingsView.tsx:57-89）中 instanceId 与 provider 均匹配不到，点「重新登录」无任何反馈 — 修复：instanceIds 为空时隐藏 re-login 动作或回退到 `settings.open({ provider })`（SettingsView 已支持 provider 匹配分支）。
- [Low][55] src/renderer/components/workspace/use-workspace-columns.ts:314-339 — `refresh_all` 重拉最新页后只合并 messages、不更新 `next_cursor`，与 `load_older` 的 cursor 分页契约错位 — 若期间有新消息产生，后续 `load_older` 仍用旧 `before_cursor` 请求，按后端 cursor 语义可能跳过或重复消息；同时 `load_older` 的 `loading_older_locks` 在请求挂起期间与 `refresh_all` 并发写 `messages`（merge_tail 去重，顺序依赖后端）。修复：`refresh_all` 成功后按响应重置/保留 cursor 的策略与 `load_older` 对齐（例如刷新后清空 cursor 或把 cursor 一并更新），并确认后端 cursor 不依赖消息绝对位置。
- [Info][85] src/renderer/views/PopupView.tsx:502 — provider 刷新用 `connector.sourceInstanceId`，而刷新全部（L468）与 re-login（L619）用 `connector.instanceId` — 当前 `connector-ipc.ts:129` 中 `sourceInstanceId: plugin.instanceId` 恒等，无行为差异；但 ConnectorInfo 同时暴露两个字段且语义重叠，属契约别名冗余，未来任一实现偏离（如 source_instance_id 改为观察身份）会静默错配 — 建议统一用 `instanceId` 或删除冗余字段。
- [Info][75] src/renderer/components/SettingsForm.tsx:303-306 — oauth_device 专用登录段硬编码 `providerId === "grok" || providerId === "kimi"` 白名单，与 auth descriptor 驱动（`authMethod === "oauth_device"`）的设计意图冲突 — 未来新增 device-code 厂商（manifest 声明 auth.method=oauth_device）不会渲染设备登录段，静默回退到手动填 secret 字段；建议改为按 manifest auth 声明判断，白名单仅作展示兜底。

## Reviewed files

- connectors/claude/connector.ts、connectors/claude/manifest.json
- connectors/getoneapi/connector.ts、connectors/getoneapi/manifest.json
- connectors/opencode_go/connector.ts、connectors/opencode_go/manifest.json
- public/frontend_demo/app/src/components/library/sessionMeta.ts、public/frontend_demo/app/src/components/workspace/format.ts、public/frontend_demo/app/src/hooks/use-mobile.ts、public/frontend_demo/app/src/lib/store.ts、public/frontend_demo/app/src/lib/types.ts、public/frontend_demo/app/src/lib/utils.ts、public/frontend_demo/app/tsconfig.app.json、public/frontend_demo/app/tsconfig.json、public/frontend_demo/app/tsconfig.node.json、public/frontend_demo/app/vite.config.ts、schemas/plugin-metadata.schema.json、schemas/plugin-output.schema.json、tsconfig.json、vite.web.config.ts
- src/main/core/auth/grok_oauth_manager.ts、src/main/core/auth/kimi_oauth_manager.ts、src/main/core/auth/oauth_helpers.ts
- src/main/core/network/effective_proxy.ts、src/main/core/network/proxy-pool.ts
- src/main/core/session/session-manager.ts
- src/main/e2e-headless.ts
- src/preload/log-throttle.ts
- src/renderer/components/AccountDialog.tsx、CollapsibleCard.tsx、DeviceLoginSection.tsx、ProviderCard.tsx、SettingsForm.tsx、UsageRows.tsx、provider_card_states.tsx
- src/renderer/components/workspace/（12 文件：MarkdownMessage、PaneMessageRow、RecentSessionsModal、SelectionTray、SessionPane、SessionPickerModal、SessionRail、VirtualMessageList、WorkspaceToolbar、WorkspaceView、use-workspace-columns、workspace-view-helpers）
- src/renderer/views/PopupView.tsx、SettingsView.tsx、TokenStatsView.tsx、TrayMenu.tsx、popup-view/（EmptyState、NetBanner、SkeletonCard、TitleBar、UpcomingResetCardSlot、lib）、settings-view/lib.ts、settings-view/sections/（about_section、accounts_list、accounts_section、appearance_section、data_section、general_section）
- src/web/main-web.tsx

## 执行的只读检查

- `git rev-parse HEAD`、相关文件 `git log`（schemas 陈旧性时间线）
- 对 `scripts/export-schemas.ts` 的生成逻辑在 /tmp 重新执行并 diff 两份 schema JSON（487/357 行 diff，确认内容漂移而非仅缩进）
- 追读主机契约：`src/main/core/connector/host-io.ts`、`runtime.ts`、`net-client.ts`、`manifest-loader` 相关 schema（`src/shared/schemas/manifest.ts`、`observation.ts`、`plugin-output.ts`、`plugin-metadata.ts`、`auth.ts`）、`src/main/core/scheduler/refresh-service.ts`（build_params/exposeToScript 契约）
- 追读 IPC 契约：`src/shared/types/ipc.ts`（ConnectorInfo/Grok/Kimi/API/sessionHistory/CookieLogin）、`src/shared/types/oauth.ts`、`src/main/ipc/connector-ipc.ts`（sourceInstanceId=instanceId）、`config-ipc.ts`（handleConfigExport/handleConfigExportData 验证桌面导出含密钥与 UI 文案一致）
- 核对 `package.json` scripts 与 .github/workflows 无 schema 重新导出步骤
- 未运行任何写操作；未修改仓库内任何文件（临时验证文件仅写 /tmp）

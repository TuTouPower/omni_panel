# 当前生效 spec 清单

在表即生效。每个 task step 7 收尾累积更新（须已过黑盒）；废弃时整行删除，spec 移入 `docs/archive/specs/`。历史清单由 `docs/archive/specs/` 目录承载。

## 验证方式分类

|方式|含义|验证手段|
|---|---|---|
|**API**|后端数据层 / LocalAPI HTTP 端点 / 连接器脚本契约，程序化可验|`curl http://localhost:<port>/v1/*`、vitest 单元/集成（真实 better-sqlite3）、`pnpm test:contract:live`|
|**Web**|web SPA（`out/web`）可渲染验证，不需 Electron 桌面端|`pnpm test:e2e:web`（chromium + mock local-api）、浏览器访问 `http://localhost:<port>/`|
|**Desktop**|必须 Electron 桌面端（BrowserWindow/Tray/utilityProcess/webRequest/nativeTheme/powerMonitor）|`pnpm test:e2e:electron`（真实 Electron）、`pnpm test:packaged`（CDP 连 exe）|

分界标志：含 `BrowserWindow`/`Tray`/`utilityProcess.fork`/`webRequest`/`nativeTheme`/`persist:` 分区 = Desktop；其余 UI 渲染 = Web；数据/HTTP/脚本 = API。

## spec 清单

|slug|验证方式|task 清单|最后固化时间|
|---|---|---|---|
|add-account-auto-refresh|Web|t306|2026-08-11|
|add-account-catalog|API|t121|2026-07-26|
|ai-cli-token-stats-api|API|拆自 ai-cli-token-stats（t037），t114，t162，t163，t192，t193，t197，t201，t204，t308，t309|2026-08-11|
|ai-cli-token-stats-desktop|Desktop|拆自 ai-cli-token-stats（t037），t114，t165，t166，t167|2026-07-31|
|ai-cli-token-stats-ui|Web|拆自 ai-cli-token-stats（t037），t103，t164，t168，t170，t190，t198，t200，t204，t205，t229，t230，t320，t321|2026-08-12|
|tokenstats-performance-baseline|API|t189|2026-08-02|
|config-store|API|迁移自 omni_powers，t038/t041/t105/t111，t195，t293，t401|2026-08-16|
|resume_command_template|API / Web|t401, t402, t403|2026-08-16|
|config_fallback_p0_protection|API|t111|2026-07-25|
|connector-auth|API|t107, t112, t159|2026-07-28|
|connector-cpa-runtime|API|拆自 connector-cpa（t037）|2026-07-21|
|connector-cpa-ui|Web|拆自 connector-cpa（t037）|2026-07-21|
|connector-direct|API|迁移自 omni_powers，t039, t159, t160|2026-07-29|
|connector-runtime|API|迁移自 omni_powers，t294，t295|2026-08-11|
|connector-session|Desktop|迁移自 omni_powers，t098，t282，t331，t337|2026-08-13|
|connector-user-scripts-entry|Desktop|t094|2026-07-24|
|connector-user-scripts|Desktop|t095|2026-07-24|
|ipc-api|API|拆自 ipc（t037）|2026-07-21|
|ipc-electron|Desktop|拆自 ipc（t037）|2026-07-21|
|log_rotation|Desktop|t154|2026-07-27|
|observation-store|API|迁移自 omni_powers，t096，t174，t207，t214，t208|2026-08-05|
|opencode_go_html_scrape|API|t115|2026-07-26|
|platform-services-api|API|拆自 platform-services（t037）|2026-07-21|
|platform-services-electron|Desktop|拆自 platform-services（t037）|2026-07-21|
|scheduler|API|迁移自 omni_powers，t039，t155|2026-07-27|
|secret-vault|API|迁移自 omni_powers，t045，t195，t296|2026-08-11|
|settings_design_migration|Web+Desktop|设置窗口统一设计系统、组件与语义状态，t406|2026-08-16|
|agent_window_design_migration|Web+Desktop|Agent 统计窗口统一设计系统、组件与语义 token|2026-08-09|
|session_window_design_migration|Web+Desktop|会话历史窗口统一设计系统、组件与语义 token，t406，t409|2026-08-16|
|surface_token_unify|Web+Desktop|t406 全窗口背景两级（window/card），raised 仅交互态|2026-08-16|
|ui-views-web|Web|拆自 ui-views（t037），t040/t041/t046/t100/t101/t102/t104/t105/t106，t215，t330|2026-08-13|
|design-tokens-foundation|Desktop|t268|2026-08-09|
|ui-component-library|Desktop|t269，t301，t303|2026-08-11|
|ui-component-theme-contrast|Web|t283，t298，t302，t301|2026-08-11|
|legacy_css_cleanup|Web+Desktop|t274|2026-08-09|
|ui-views-desktop|Desktop|拆自 ui-views（t037），t153|2026-07-27|
|cli-mode|Desktop|t275, t285, t322, t335, t399, t400|2026-08-16|
|cli_help_unify|Desktop|t400|2026-08-16|
|cli-import-config|API|t285|2026-08-10|
|vendor-forms-oauth-weblogin|Web|t109|2026-07-25|
|fix_add_account_wiring|Desktop|t110|2026-07-25|
|web-panel|Web|迁移自 omni_powers，无，t325|2026-08-12|
|web_config_parity|API + Web + Desktop|t277|2026-08-10|
|window-management|Desktop|迁移自 omni_powers，t099，t194，t297|2026-08-11|
|device_login_full_url|Desktop|t156|2026-07-27|
|move_session_meta_to_lib|Web|t124|2026-07-26|
|extract_oauth_helpers|API|t127|2026-07-26|
|fix_grok_oauth_binding_billing_parse|API + Desktop|t159|2026-07-29|
|fix_grok_zero_percent_omission|API + Desktop|t160|2026-07-29|
|relogin-instance-routing|Web|t158|2026-07-27|
|classify_collect_failure|API|t172|2026-07-31|
|kimi_oauth_concurrency|API|t150|2026-07-26|
|unify_account_auth_forms|Web|t157|2026-07-27|
|session-history-window|Desktop|t211，t212，t213|2026-08-05|
|session_content_search_cold_perf|Web+Desktop|t404|2026-08-16|
|session-shell|Desktop|t223，t224，t245，t326，t327，t328，t334|2026-08-13|
|workspace|Desktop|t224，t225，t226，t227，t228，t248，t243，t246，t244，t247，t263，t297，t323，t324，t329，t405，t407，t409|2026-08-16|
|draggable_provider_tabs|Web|t242|2026-08-07|
|provider-tab-active-state|Web|t305|2026-08-11|
|renderer-bundle-code-split|Web+Desktop|t249|2026-08-07|
|session-path-index|Desktop|t254，t264，t310|2026-08-11|
|session-summary-head-read|Desktop|t255|2026-08-07|
|session-first-open-main-unblock|Desktop|t256|2026-08-08|
|usage-panel-selection-persist|Web+Desktop|t250|2026-08-08|
|panel-window-bounds-persist|Desktop|t251, t262|2026-08-08|
|session-pane-display-adjust|Web+Desktop|t257，t407，t408|2026-08-16|
|session_message_click_expand|Web+Desktop|t408|2026-08-16|
|e2e_synthetic_fixture|Web|t281|2026-08-10|
|web_cookie_login_anon_poll_parity|Web + Desktop|t282|2026-08-10|

替代旧需求可在备注 `supersedes: <old_slug>`。

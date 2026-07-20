# 任务总清单

- ID 在此分配，全局递增；取 `docs/tasks/` 与 `docs/archive/tasks/` 中最大 ID 加一，无历史时从 T001 开始。
- 状态只使用：`backlog`、`active`、`done`、`dropped`。
- `backlog` 不建目录；`active` 必须有 `TNNN_slug/` 目录。
- `done` 及曾 active 的 `dropped` 任务目录必须移入 `docs/archive/tasks/`。
- owner 和 branch 表示当前归属；工作分支推荐 `task_tnnn_slug`。

| ID   | 标题                                                            | 状态    | owner  | branch                               | 备注                                                                         |
| ---- | --------------------------------------------------------------- | ------- | ------ | ------------------------------------ | ---------------------------------------------------------------------------- |
| T001 | fix preload route 分权同步 usage/setting                        | done    | claude | main                                 | route 重构漏改 preload 层;代码已先实现                                       |
| T002 | docs specs route 值同步代码 + 补 TokenStatsView                 | done    | claude | main                                 | 依赖 T001 代码真相                                                           |
| T003 | route 字面量收口 + route 值回归断言                             | done    | claude | main                                 | T001/T002 遗留合并(T001_f001/T002_f003)                                      |
| T004 | 容器查询响应式（usage 窗横屏自适应）                            | done    | claude | task_t004_responsive_container_query | 完结；视觉快照遗留                                                           |
| T005 | 即将重置预警栏（rail + 横幅）                                   | done    | claude | task_t005_upcoming_reset_panel       | 完结;视觉/打包待人工签收                                                     |
| T006 | 近 7 天趋势 sparkline                                           | done    | claude | task_t006_trend_sparkline            | 完结;视觉/打包待人工签收                                                     |
| T007 | domain 趋势图政策修订（解锁 sparkline）                         | done    | claude | task_t007_domain_trend_policy        | 完结；纯文档；T006 前置                                                      |
| T008 | dev CSP 放开 unsafe-inline 修复 renderer 黑屏                   | done    | claude | task_t008_csp_dev_unsafe_inline      | 完结;plugin-react preamble 被拦;抽纯函数+单测                                |
| T009 | e2e 改名 user_e2e→e2e + 引用更新                                | done    | claude | task_t009_rename_user_e2e_to_e2e     | 完结;机械搬运;test:e2e 降级 T010 补                                          |
| T010 | web e2e 基建(mock local-api+本机 fixture+chromium 驱动)         | done    | claude | task_t010_web_e2e_infrastructure     | 完结;2 passed;CI/webServer 遗留 T013                                         |
| T011 | web spec 批量迁移(specs→web,~15 个)                             | done    | claude | task_t011_migrate_web_specs          | 完结;迁 5 个,21 passed;23 留 specs(T012)                                     |
| T012 | electron project 整理(specs→electron 专属)                      | done    | claude | task_t012_electron_project_reorg     | 完结;65 tests --list OK;CI test:e2e 引用已修                                 |
| T013 | e2e 文档收尾(testing.md/AGENTS.md/ADR)                          | done    | claude | task_t013_e2e_docs_finalize          | 完结;CI 策略+ADR 008+handoff;4 finding 全采纳                                |
| T014 | 修复 app 图标(render_icon 产 .ico + 重打包)                     | done    | claude | task_t014_fix_app_icon_ico           | 完结;icon.ico 重生成;vision 确认 OmniUsage logo                              |
| T015 | CI synthetic seed fixture(脱敏假账号入库供 CI web smoke)        | done    | claude | task_t015_ci_synthetic_seed_fixture  | 完结;synthetic.json 入库;CI web smoke 21 passed                              |
| T016 | seed_fake_plugin 类 9 spec 迁 web(改断言泛化)                   | done    | claude | task_t016_migrate_seed_fake_specs    | 完结;迁 7 spec 37 passed;account_operations/plugin_failure_modes 留 electron |
| T017 | settings_view + popup_token_panel 迁 web + 删重复               | done    | claude | task_t017_migrate_settings_token     | 完结;settings_view 拆迁;删 popup_theme 重复;drag flaky 修;41 passed          |
| T018 | trend gen_fixture 多录(provider×account×metric)                 | done    | claude | task_t018_trend_fixture_multi        | 完结;trend 全录+精确匹配;critical(双?)+days 修;38 passed                     |
| T019 | 废弃 account_operations spec(popup 账号菜单功能已移除)          | done    | claude | task_t019_drop_account_operations    | 完结;popup 重构后功能移 settings,spec 删除                                   |
| T020 | CSS selector 改 getByRole 转义安全(T016 code_f004)              | done    | claude | task_t020_css_selector_getbyrole     | 完结;7 处改 getByRole exact;0 finding;41 passed                              |
| T021 | mock_server 单测(create_mock_handler 自保护)                    | done    | claude | task_t021_mock_server_unit_test      | 完结;9 用例;1416 passed;T018 critical 可抓                                   |
| T022 | plugin_failure_modes 迁 web(手造 failed connector fixture)      | done    | claude | task_t022_plugin_failure_to_web      | 完结;synthetic 加 KIMI failed;43 passed;crash 单测遗留                       |
| T023 | settings_provider_accounts case 拆迁(单次 web/restart electron) | done    | claude | task_t023_settings_accounts_split    | 完结;about 迁 web;class 修复;restart 留 electron                             |
| T024 | integration crash connector 单测(T022 test_f003)                | done    | claude | task_t024_crash_connector_test       | 完结;process.exit vm=throw,1 case,13 passed                                  |
| T025 | electron restart case 真跑验证(T023 class 改未跑)               | done    | claude | task_t025_electron_restart_verify    | 完结;1 passed(2.8s);selector 适配 SettingsView 重构                          |
| T026 | MetricRecord 加 per-account error 字段+PopupView accountErrors  | done    | claude | task_t026_metric_error_field         | 完结;data model+透传+buildAccountErrors;1425 passed;T027/T028 后置           |
| T027 | ProviderAccountRow per-account error UI(indicator)              | done    | claude | task_t027_account_error_ui           | 完结;error badge UI+CSS;skip 因 T028 data;T028 后置待通                      |
| T028 | connector script per-account error 记录 pattern(后置)           | backlog | claude | task_t028_connector_error_pattern    | connector 脚本改进;分 connector 迁移                                         |

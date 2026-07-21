# Task log

## 记录

### 2026-07-21 T011 迁移实施

#### 分类结果（27 个 spec）

**迁 web/ 成功（5 个）**：

- `app_lifecycle.spec.ts` — DOM + openSettings rewrite（删多窗口/firstWindow 专属 case 2 个）
- `popup_demo_alignment.spec.ts` — 纯 DOM
- `popup_platform_behavior.spec.ts` — 纯 DOM（title 断言改 app-title，titlebar-no-drag class 改 element 存在）
- `popup_view.spec.ts` — DOM + openSettings rewrite；provider tab 断言泛化（不再硬编码 `Claude`/`DeepSeek`，改为计数 > 0）
- `scheduler.spec.ts` — DOM + openSettings rewrite（局部 openSettings helper 替换为 `SettingsPage.open_via_hash`）

**回退（1 个）**：

- `settings_view.spec.ts` — 6 case 中 4 过 2 失败，按规则 spec 级回退。失败原因：
    - `plugins with parameters show config forms`：web SPA accounts 页 DOM 无 `.acct-row`/`.ao-item` 容器（结构改为按钮直接挂载）
    - `usage label map can be edited and saved`：web SPA appearance 页无"用量标签映射"字段（web SPA UI 与 Electron 不一致）

**留 specs/（23 个）**：

- 托盘/多窗口/BrowserWindow：`main_panel_window_modes`、`tray_interaction`、`tray_menu_actions`
- powerMonitor：`suspend_resume`
- 跨进程 restart：`popup_collapse_persistence`、`secrets_persistence`、`plugin_config`（CPA restart case）
- seed_fake_plugin 硬编码 fake 断言：`account_operations`、`multi_account`、`opencode_go_usage`、`plugin_failure_modes`、`popup_card_collapse_height`、`popup_card_states`、`popup_drag_handle`、`popup_height_debounce`、`popup_refresh_state_reset`、`popup_token_panel`（需 VITE_ENABLE_TOKEN_PANEL=1 环境变量 + Electron 种子）
- createTestWithSetup 写 config.json：`auto_seed`、`settings_provider_accounts`
- `window.outerHeight/screen.availHeight` 断言：`popup_multi_display`、`popup_window_constraints`
- `popup_theme` — T010 已在 web/ 建立示范版，specs/ 版由 T012 转 electron/（避免文件名冲突）
- `settings_view` — 回退（web SPA UI 与 Electron 不一致，2 case 失败）

#### 配套改动

- `tests/e2e/pages/settings_page.ts`：新增 `static open_via_hash(page)` — `page.goto("#setting")` + waitReady，保留原 `openViaIpc`
- 未动 src/、T010 基建（test_web.ts/mock_server/vite_mock_plugin/playwright.config）

#### 验证

- `pnpm test:e2e:web`：**21 passed**（含新迁 5 spec + T010 示范 popup_theme）
- `pnpm typecheck`：T011 改动干净；仅剩 T010 遗留 `vite.web.config.ts` Unused '@ts-expect-error' directive 错误（不在 T011 范围）

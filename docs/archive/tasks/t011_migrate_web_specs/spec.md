# Task spec

## 背景

T010 web e2e 基建就位（mock local-api + chromium 驱动 + 示范 spec popup_theme 跑绿）。现把 `tests/e2e/specs/` 里**与网页端重合**的 spec 迁到 `tests/e2e/web/`，日常 `pnpm test:e2e:web` 覆盖网站端；Electron 专属 spec（托盘/多窗口/powerMonitor/跨进程持久化）留 `specs/`（T012 转 electron/）。

## 范围

迁移 `tests/e2e/specs/` 下与网页端重合的 spec 到 `tests/e2e/web/`：

- **纯 DOM 可平移**（~11 个）：popup_view、popup_card_states、popup_card_collapse_height、popup_drag_handle、popup_refresh_state_reset、popup_demo_alignment、popup_token_panel、multi_account、plugin_failure_modes、opencode_go_usage、popup_height_debounce（语义降级，测 DOM 不测窗口约束）
- **openSettings rewrite**（~4 个）：settings_view、scheduler、account_operations、auto_seed（`SettingsPage.openViaIpc(app, page)` → web 版 hash 路由）

每个 spec 改：

1. `import { test } from "../fixtures/test"` → `"../fixtures/test_web"`
2. fixture `omni` → `webPage`，`omni.app.firstWindow()` 删除（webPage 即 page）
3. `SettingsPage.openViaIpc(app, page)` → `SettingsPage.open_via_hash(page)`（web 版）
4. `omni.stop()/start()`（跨进程 restart）→ 无法平移，该 spec 留 specs/

## 非范围

- Electron 专属 spec 不迁（T012 转 electron/）
- 跨进程 restart 类（popup_collapse_persistence、secrets_persistence、plugin_config CPA restart）留 specs/
- 托盘/powerMonitor/多窗口/窗口约束类留 specs/
- 不改 mock 基建（T010 已就位）

## 验收标准

- [ ] 可平移 + openSettings rewrite 的 spec 迁到 `tests/e2e/web/`
- [ ] `pnpm test:e2e:web` 全绿（含新迁 spec）
- [ ] 迁移失败的 spec 留 `specs/`（T012 收 electron/），不强行迁
- [ ] `pnpm test`（vitest）不受影响

## 依赖与约束

- fixture 数据是本机真实快照（27 instances），spec 断言泛化（不硬编码账号邮箱/具体 provider）
- openSettings rewrite 需 `SettingsPage` 加 `open_via_hash`（web 版）或 spec 内联 `page.goto("#setting")`

# Task spec

## 背景

T011/T012 后，`tests/e2e/electron/` 仍有 9 个 spec 仅因用 `createTestWithSetup` + `seed_fake_plugin` 造假数据 + 硬编码 fake 断言而留 electron。这些 spec 测的是纯 DOM 行为（卡片状态、拖拽、刷新、多账号、失败态等），web SPA 同样有——只是断言写死 fake 数据（"Demo Plugin"、used=50%）。改 fixture（test.ts → test_web.ts，用本机真实/synthetic fixture）+ 断言泛化（非空/计数/状态枚举）后可迁 web/，提升 web 覆盖。

## 范围

迁移 `tests/e2e/electron/` 下 9 个 seed_fake_plugin 类 spec 到 `tests/e2e/web/`：

- `account_operations`、`multi_account`、`opencode_go_usage`、`plugin_failure_modes`、`popup_card_collapse_height`、`popup_card_states`、`popup_drag_handle`、`popup_height_debounce`、`popup_refresh_state_reset`

每个 spec：

1. `import { test } from "../fixtures/test"` → `"../fixtures/test_web"`（web/ 下）
2. fixture `omni` → `webPage`，`omni.app.firstWindow()` 删
3. 删 `createTestWithSetup`/`seed_fake_plugin` 调用（web 用 mock fixture 数据）
4. 断言泛化：硬编码 fake 数据（"Demo Plugin"、used=50%、account 邮箱）→ 非空/计数/状态枚举/结构校验
5. 凡依赖 seed_fake_plugin 造的特定状态（如"造一个 used=100% critical 卡片"）且 mock fixture 无对应数据的 case → 删该 case 或留 electron

## 非范围

- 真 Electron 专属 spec 不迁（托盘/多窗口/powerMonitor/restart/窗口约束/auto_seed）
- 不改 T010 基建、mock、synthetic
- settings_view/popup_token_panel（T017）

## 验收标准

- [ ] 可平移的 seed_fake_plugin 类 spec 迁到 `tests/e2e/web/`
- [ ] `pnpm test:e2e:web` 全绿（含新迁）
- [ ] 失败/强依赖 fake 的 case 删或留 electron，log 记原因
- [ ] `pnpm test`（vitest）不受影响

## 依赖与约束

- mock fixture（real/synthetic）数据是真实结构，断言不硬编码具体值
- 凡 case 需"造特定状态"（mock 无法复现）→ 留 electron

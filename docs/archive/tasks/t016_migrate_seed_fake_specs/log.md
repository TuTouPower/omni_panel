# Task log

## 2026-07-21 迁移执行

### 分类结果

| spec                       | 决策                 | 备注                                                                                                                                                                                                                                                                                    |
| -------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| account_operations         | **留 electron**      | 全 4 case 测旧 UI `[aria-label="账号操作"]` 账号菜单弹出 + "编辑"/"删除"。当前 popup 重构后该 selector 已不存在（替换为 ProviderAccountRow 的"折叠/展开"卡片 + l2seg "概览/账号明细" 切换）。不是 seed_fake_plugin 类问题，是 UI 重构后 selector 失效，需另起 task 重写。               |
| multi_account              | 迁 web/（2 case）    | case 1 泛化"无重复 card-name"替代"KIMI 合并"；case 2 "多 item provider bars" 改用 Antigravity tab（real/synthetic 都有）。                                                                                                                                                              |
| opencode_go_usage          | 迁 web/（1 case）    | real fixture 8 workspace × rolling/weekly/monthly；synthetic 无 opencode_go，case 内 `test.skip` 跳过。                                                                                                                                                                                 |
| plugin_failure_modes       | **留 electron**      | 3 case 全测"connector 行为 error/crash/slow → failed card with message"。real mock 无 enabled+failed+无 items 的 connector（KIMI failed connector 含 stale items，渲染 stale banner 而非 failed card）；synthetic 无任何 failed connector。强依赖 seed_fake_plugin 行为造模，无法平移。 |
| popup_card_collapse_height | 迁 web/（4 case）    | Codex 4 账号（real）/ 1 账号（synthetic），collapse 按钮 count 改 `>=1` 兼容；selector 改 `button[aria-label="折叠 ${label}"]` 避免 substring 匹配。                                                                                                                                    |
| popup_card_states          | 删 1 case，迁 1 case | 删 "auth failure shows settings link"（mock 无 is_auth_error 文本匹配的 connector.error）；迁 "error banner shows retry"（real KIMI 401 stale banner）+ "critical usage bar uses risk-red fill"（Codex critical item）。retry banner case 在 synthetic 下 `test.skip`。                 |
| popup_drag_handle          | 迁 web/（2 case）    | 通用 DOM；HTML5 native drag 需 `mouse.down` + `mouse.move({steps:8})` 触发 dragstart。                                                                                                                                                                                                  |
| popup_height_debounce      | 迁 web/（2 case）    | Codex tab；测 `.scroll-inner.scrollHeight`（web viewport 固定，原 `getBoundingClientRect().height` 无变化）；synthetic 下 collapse 按钮 ≥1 兼容。                                                                                                                                       |
| popup_refresh_state_reset  | 迁 web/（3 case）    | Codex tab；全局刷新按钮改 `getByTitle("刷新全部")`（aria-label 同）。                                                                                                                                                                                                                   |

### 统计

- 迁 web/ 成功：**7 spec**（multi_account, opencode_go_usage, popup_card_collapse_height, popup_card_states, popup_drag_handle, popup_height_debounce, popup_refresh_state_reset）
- 删 case：**1**（popup_card_states: "auth failure shows settings link" — mock 无 auth 错误 fixture）
- 留 electron：**2 spec**（account_operations UI selector 失效需另起 task；plugin_failure_modes 强依赖 fake error/crash/slow 行为）
- 总迁 case 数：**16**（含上述 7 spec 全部保留 case）

### 验证

- `pnpm test:e2e:web`（real fixture 默认）：37 passed
- `MOCK_FIXTURE=synthetic pnpm test:e2e:web`：35 passed, 2 skipped（opencode_go_usage + popup_card_states retry banner）
- `pnpm typecheck`：通过
- `pnpm test`（vitest）：1407 passed

### 关键改动点

1. fixture import：`../fixtures/test` → `../fixtures/test_web`；`omni`/`page` → `webPage`。
2. selector 泛化：原硬编码 "Demo Plugin"/"Height Account A"/"OpenCode A" → 动态读 `aria-label` 提取账号 label；CSS attribute selector `button[aria-label="折叠 ${label}"]` 替代 `getByRole` substring 匹配（避免"折叠 fe"误匹配"折叠 fen"）。
3. 高度测量：`popup_height_debounce` 由 `[data-popup="live"] getBoundingClientRect().height`（Electron 窗口跟随内容）改测 `.scroll-inner.scrollHeight`（web viewport 固定，外框不随内容变化）；`popup_card_collapse_height` 沿用原 `.scroll-inner.scrollHeight`，仅 selector 泛化（aria-label 动态提取）。
4. HTML5 drag：`mouse.down` 后需 `mouse.move({steps})` 才触发 `dragstart`。
5. synthetic 兼容：依赖 real 特性（opencode_go、failed connector）的 case 用 `test.skip` 当无数据时跳过，CI smoke 仍绿。

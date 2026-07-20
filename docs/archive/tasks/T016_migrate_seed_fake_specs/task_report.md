# Task report T016

本报告所在 commit 即 task commit，SHA 由 `git log --grep T016` 查，不在此记录。

## spec 验收标准勾选

- [x] 可平移的 seed_fake_plugin 类 spec 迁到 `tests/e2e/web/`。 - 7 spec：multi_account、opencode_go_usage、popup_card_collapse_height、popup_card_states、popup_drag_handle、popup_height_debounce、popup_refresh_state_reset。
- [x] `pnpm test:e2e:web` 全绿（含新迁）。 - real 37 passed（+16 case vs T011 21）；synthetic 34 passed + 3 skipped（KIMI dedup / opencode_go / retry banner 依赖 real 特性）。
- [x] 失败/强依赖 fake 的 case 删或留 electron，log 记原因。 - 删 1 case（popup_card_states auth failure：mock 无 is_auth_error 匹配）；留 electron 2 spec（account_operations 旧 UI selector 失效需另 task / plugin_failure_modes 强依赖 fake failed 行为）。
- [x] `pnpm test`（vitest）不受影响。 - 1407 passed。

## adoption 处置摘要

- 已修 3 项 / 遗留 1 项 / 无需修改 1 项
- T016_code_f001 - 采纳：skip 前 isVisible(timeout) 探测防 flake
- T016_code_f002 - 无需修改：drag 注释已足够
- T016_code_f003 - 采纳：log 高度测量描述区分两 spec
- T016_code_f004 - 遗留：CSS selector 未转义（fixture 无特殊字符稳定），改 getByRole 留后续
- T016_test_f001 - 采纳：multi_account dedup 加 KIMI toHaveCount(1) 强校验（synthetic 无 KIMI 时 skip）

## 遗留问题

- **CSS attribute selector 未转义**（code_f004）：`button[aria-label="...${label}"]` 当前稳定（label 无特殊字符），改 `getByRole({name, exact})` 涉及多 spec 多处，留 fixture 引入特殊字符时再做。
- **account_operations spec 旧 UI selector 失效**：非 T016 范围（UI 重构后 `[aria-label="账号操作"]` 已不存在），需另 task 重写（测 ProviderAccountRow 折叠卡片 + l2seg 切换）。
- **plugin_failure_modes 留 electron**：3 case 强依赖 seed_fake error/crash/slow 行为，mock 无法造 enabled+failed+无 items connector，留 electron 跑真实 fake。

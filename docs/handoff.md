# handoff

- 最后更新：2026-07-25
- branch：main
- head_commit：6eb524b
- 当前状态：t001-t105 全部 done（t047 dropped）；最新发布见 origin/main。
- 已知 bug：见 `docs/bugs.md`。仍存在的代码遗留：T029 per-account error（t084 跟进）、OpenCode Go 添加账号无弹窗、监控重置按钮仅 Tavily、t087 添加账号弹窗黑色横线（spike close 未实施）、task 索引序列化 CRLF/2 空格（`scripts/task.py` 未修，t102_code_f002）。t099 宽度上限、t100 L2 折叠重置已修（见 bugs.md 修复行）。
- 大重构：t076 refresh-service / t077 main index / t078 PopupView 三轮拆分均 done（t089/t090/t091 后续拆分完成）。
- 连接器迁移 ctx.status（原 t066 遗留）：t088 已完成（9 连接器删内联 helper）。

## 2026-07-24 t099 交接

- branch：`t099_popup_width_cap_remove`
- head_commit：`3aabba4084c8d16d025a14b063b9979e0effe3b4`
- task：`t099_popup_width_cap_remove`，状态 `active`。
- 已完成实现：移除 `MAX_PANEL_WIDTH=780`；floating 保存与恢复宽度改以上次窗口所在 display 的 `workArea.width` 为上限；移除 `WINDOW_CONFIGS.usage.maxWidth`；新增 1200px floating 宽度持久化单元测试。
- 已完成验证：专项 Vitest 15 passed；`pnpm typecheck`、改动文件 Prettier、定向 ESLint 通过；`pnpm test` 158 files / 1616 tests 通过；隔离 Electron 验证 floating 1200px 可保存、重启恢复，popup 可超过 780px，二者 `maximum_size=[0,0]`；`pnpm package && pnpm test:packaged` 3 passed。
- 当前停点：Step 5 双审。提示词已生成于 `.scratch/review_prompts/`；下一步仅并行启动两个 `general-purpose` subagent，分别完整读取 `code_review_prompt.md` 与 `test_review_prompt.md`，只写 `docs/tasks/t099_popup_width_cap_remove/review_code.md` / `review_test.md`。
- 双审 PASS 后：更新 `task.md` 收尾报告与 `docs/blueprint/architecture.md` 主面板宽度策略；运行 `scripts/task.py finish t099`；归档 task 目录；仅暂存 t099 文件，排除 `docs/tasks/t103_token_stats_natural_bucket/`；单 task 单 commit。

## 2026-07-24 t099 完成

- branch：`t099_popup_width_cap_remove`
- 状态：`done`；task 已归档至 `docs/archive/tasks/t099_popup_width_cap_remove/`。
- 验证：`pnpm test` 158 files / 1618 tests、`pnpm typecheck`、改动文件 Prettier 通过；`pnpm package && pnpm test:packaged` 3 passed，隔离 Electron 已验证 1200px floating 保存/恢复与 popup 宽度解除。
- 双审：Round 1 code PASS / test FAIL（`t099_test_f001` 已修）；Round 2 code/test PASS。
- 已知门禁：`pnpm check` 仍受未改动的 `src/renderer/components/UsageRows.tsx:92` 与 `tests/integration/connector/exa_connector.test.ts:187` lint 错误阻断。

## 2026-07-24 t100 完成

- branch：`t100_l2_state_reset_on_collapse`
- head_commit：提交前 `b5d2c47`；本条随 t100 task commit 更新。
- 状态：`done`；task 已归档至 `docs/archive/tasks/t100_l2_state_reset_on_collapse/`。
- 实现：`ProviderCard` 在 `expanded === false` 时重置 `l2open`，再次展开显示概览。
- 验证：红灯覆盖旧行为；绿灯后 `pnpm test` 158 files / 1619 tests、`pnpm typecheck`、改动文件 Prettier 通过。
- 运行时验证：`BLOCKED`。隔离 Electron 已启动，但当前 harness 无法驱动原生窗口；直接访问 Vite renderer 缺 preload API，未将其作为 GUI 证据。
- 双审：Round 1 test PASS；code FAIL，仅 `ProviderCard.tsx` 与 `provider_card.test.tsx` 文件膨胀 minor，均已记录为遗留。

## 2026-07-24 t101 完成

- branch：`t101_label_map_default_expanded`
- head_commit：提交前 `4a8be33`；本条随 t101 task commit 更新。
- 状态：`done`；task 已归档至 `docs/archive/tasks/t101_label_map_default_expanded/`。
- 实现：移除标签映射折叠 state 与 chevron button，静态标题下立即加载并渲染标签映射。
- 验证：`pnpm test` 158 files / 1621 tests、`pnpm typecheck`、改动文件 Prettier 通过。
- 运行时验证：`BLOCKED`。当前 harness 无法驱动原生 Electron 窗口；自动化渲染测试覆盖标签行、无按钮、加载态、空态。
- 双审：Round 1 code PASS / test FAIL（`t101_test_f001` 已修）；Round 2 code/test PASS。

## 2026-07-24 t102 完成

- branch：`t102_remove_stale_amber_border`
- 状态：`done`；task 已归档至 `docs/archive/tasks/t102_remove_stale_amber_border/`。
- 实现：删除 `.card.stale` amber border；清理 ProviderCard、ProviderAccountRow 无消费者 `stale` class；保留 stale 徽章、错误文字及 stale 判定。
- 验证：`pnpm test` 158 files / 1622 tests、`pnpm typecheck`、改动文件 Prettier 通过。
- 双审：Round 1 修复 `t102_code_f001`、`t102_test_f001`；Round 2/3 测试 PASS。代码 review 遗留 `t102_code_f002`：`scripts/task.py` 输出的 task 索引为 CRLF/2 空格，已记录 `docs/bugs.md`，需另立 task 修复。

## 2026-07-24 t103 完成

- branch：`t103_token_stats_natural_bucket`。
- 状态：`done`；task 已归档至 `docs/archive/tasks/t103_token_stats_natural_bucket/`。
- 实现：趋势图时间轴按本地自然日/整点切分；滑动窗口端点保持不变，首末可为 partial；小时刻度读取真实 bucket 起点。
- 验证：`pnpm typecheck`、相关 ESLint、`pnpm test` 158 files / 1628 tests 通过。未单独启动含可控 token records 的代理面板进行人工截图。
- 双审：Round 1 code PASS / test FAIL（`t103_test_f001` 已修）；Round 2 code/test PASS。

## 2026-07-25 t104 完成

- branch：`t104_cpa_account_reset_bell`。
- 状态：`done`；task 已归档至 `docs/archive/tasks/t104_cpa_account_reset_bell/`。
- 实现：CPA 厂商数据标签映射弹窗按 raw_label 显示即将重置 bell；同标签多个 gateway accountKey 全部已监控才 pressed，部分或全未监控时一并添加、全部已监控时一并移除。
- 验证：定向 renderer 74 passed；`pnpm typecheck`；`pnpm test` 158 files / 1635 tests；真实 Electron CPA 流程 1 passed。
- 双审：Round 1 code/test FAIL（`t104_code_f001`、`t104_test_f001`、`t104_test_f002` 已修）；Round 2 code PASS / test FAIL（`t104_test_f003`、`t104_test_f004`、`t104_test_f005` 已修）；Round 3 code/test PASS。
- 收尾 lint 修正后追加 Round 4 code/test PASS；无 finding。

## 2026-07-25 t105 完成

- branch：`t105_upcoming_reset_unified_card`。
- 状态：`done`（待 finish + 归档）；双审 Round 3 code/test PASS。
- 实现：将「即将重置」从 `UpcomingResetBanner`/`UpcomingResetRail` 改为 `UpcomingResetCard`，纳入 `.overview-grid`，复用 `CollapsibleCard`+`DragGrip`+`UpcomingResetRow`；保留键 `__upcoming_reset__` 同时承载 `providerOrder` 排序位与 `expandedProviders` 展开态，不新增 config 字段。
- 顺手修两个既有缺陷（挡 AC「持久化/重启后保持」）：`ProviderCard` 根补 `data-card-id`；`AppConfigStore.scheduleSave` 支持 thunk，`index.ts` 两处 bounds 保存改传 thunk，消除 debounce 窗口内 renderer 配置被陈旧快照回滚（数据丢失 bug，stack 追踪确认 `save_floating_bounds → save_config → scheduleSave`）。
- 验证：`pnpm test` 158 files / 1639 tests；E2E `upcoming_reset_card.spec.ts` 连跑 3 次全绿（Electron 下 Playwright 不触发 HTML5 DnD，改派发原生 `DragEvent`）；`pnpm typecheck`、ESLint、Prettier 通过。
- 双审：Round 1 code/test FAIL（10 条全修）；Round 2 code PASS / test FAIL（f006/f007，补 `config-save-wiring.test.ts` 与裁剪保留键测试，全修）；Round 3 code/test PASS。`max_review_round` 用户提至 5。
- 交出 head：`t105_upcoming_reset_unified_card` 分支当前 HEAD（commit 待提交）。

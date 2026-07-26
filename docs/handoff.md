# handoff

- 最后更新：2026-07-25
- branch：`t111_config_fallback_p0_protection`
- head_commit：`994139c7257b370cb6c0f0a7f91ab1012710586d`
- 当前状态：t001-t111 全部 done（t047 dropped）；t112-t114 仍为 backlog，t112 已按用户要求暂停、未开始实现。
- 已知 bug：见 `docs/bugs.md`，所有条目均已记录「修复：」行——T029 per-account error（t084 spike close 评估完结，commit `311ee3d`）、OpenCode Go 添加账号无弹窗（t098，commit `3aabba4`）、监控重置 bell 仅 Tavily（t086，commit `cf8a55d`）、添加账号弹窗黑色横线（t087 评估 + t106 实施，commit `89dec60`）、task 索引序列化 CRLF/2 空格（`scripts/task.py`，commit `5484704`）、t099 宽度上限、t100 L2 折叠重置。
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
- 双审：Round 1 修复 `t102_code_f001`、`t102_test_f001`；Round 2/3 测试 PASS。代码 review 遗留 `t102_code_f002`：`scripts/task.py` 输出的 task 索引为 CRLF/2 空格，已记录 `docs/bugs.md`，需另立 task 修复。后续已由 commit `5484704 fix(scripts): task.py save() 用 4 空格缩进 + LF` 修复（见 bugs.md 修复行）。

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

## 2026-07-25 t107-t111 完成（会话交出）

- branch：`t111_config_fallback_p0_protection`
- head_commit：`994139c7257b370cb6c0f0a7f91ab1012710586d`
- 完成任务：t107 manifest auth descriptor、t108 auth flow registry 替代 `VENDOR_AUTH_MAP`、t109 OAuthDeviceForm + WebLoginForm 厂商子表单、t110 修复添加账号接线匹配、t111 config-store ENOENT/空文件 fallback P0 保护。均已按工作流单 task 单 commit 提交到各自分支；t111 为当前分支最新 commit。
- t111 关键验证：`pnpm test` 165 files / 1691 tests 全绿；双审 Round 2 code/test PASS（`max_review_round=5`）。
- 已落地产物：
    - `src/main/core/config/config-store.ts`：ENOENT/空文件/仅空白字符统一走 P0 保护，目录不存在时才允许 auto_seed。
    - `src/main/core/storage/write-json.ts`：`writeFileAtomic` tmp → fsync → close → rename，句柄关闭放 `try/finally`。
    - `tests/integration/config/config-store.test.ts`、`tests/unit/core/storage/write-json.test.ts` 覆盖新行为。
    - `docs/specs/config_fallback_p0_protection.md`、`docs/specs_index.md`、`docs/blueprint/architecture.md` 已同步。
- 后续 backlog：t112 Kimi device code OAuth 登录、t113 Kimi connector 解析 boosterWallet/totalQuota/membership、t114 token-stats collector 扫描状态落盘。
- 用户指示完成 t111 后结束，t112 未启动实现。已创建空 task 目录 `docs/tasks/t112_kimi_oauth_device_code/` 与分支 `t112_kimi_oauth_device_code`（仅模板文件，未提交），接手时可直接从 `scripts/task.py show t112` 与 spec/plan 开始。

## 2026-07-26 t121+t122 完成

- branch：`t121_add_account_manifest_catalog` / `t122_split_settings_view`
- head_commit：`bacf5a32`（t121 merge）/ `3ba76c28`（t122 merge）
- 状态：`done`；task 已归档至 `docs/archive/tasks/t121_add_account_manifest_catalog/`、`docs/archive/tasks/t122_split_settings_view/`。
- t121 实现：`connector:catalog` IPC 从 manifest 出目录（不读 config/墓碑/密钥）；`config:createInstance` 按 manifest_id 直接建实例并清对应墓碑；`AddAccountDialog` 优先按 catalog 解析 auth，grok/exa/opencode_go/cpa 在无实例+墓碑场景下正确渲染对应表单。
- t122 实现：`SettingsView.tsx` 2352→724 行，按领域拆出 `src/renderer/views/settings-view/lib.ts` 与 `sections/{about,accounts,appearance,data,general}_section.tsx`，行为零变化。
- 验证：t121 `pnpm test` 1749/1749 绿；t122 `pnpm test` 1749/1750（config-store EPERM 为 Windows 已知 flaky）。
- 遗留 finding：
    - t121_code_f005：`SettingsView.tsx` 2345 行超 800 行 important 阈值，本 task 未拆，后续 task 抽出 `AccountDialogHost` / `useConnectorCatalog` / `useAccountDialogState`。
    - t121_test_f006：`OAuthDeviceForm` 表单层未断言 secret_name 绑定到内部 input；on_save secrets 断言已覆盖端到端 secret_name 流向，增益有限。
    - t122_code_f002：`AccountDialog`→`views/lib` 反向依赖由拆分暴露；待后续将 `session_meta` 迁至 `src/renderer/lib/`。
    - t122_code_f003：`accounts_section.tsx` 436 行略超 minor 阈值，未达 800 硬限；后续可拆 `AccountsList`。

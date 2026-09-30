# d064 electron e2e headless 全量存在 18 个与改动无关的预存失败基线

- 来源：t536（2026-09-30 黑盒阶段）
- 结论：`E2E=1 E2E_HEADLESS=1 playwright --project=electron` 全量在本机有 18 个预存失败（settings/plugin/secret 持久化/auto_seed/panel window controls 类），与被测改动无关；判定回归必须先跑基线对照，不能以「有失败」直接归因新改动。
- 证据：t536 worktree 全量 headless 跑出 18 failed / 39 passed / 12 skipped；随后 `git stash push -u` 回到基线 commit `289f1a8c` 重建 out/ 后重跑这 18 个失败涉及的 9 个 spec 文件，**同样 18 个失败**（settings_view ×2、add_account ×4、panel_window_controls ×1、auto_seed ×1、cpa_label_map_watch ×1、plugin_config ×3、popup_collapse_persistence ×2、secrets_persistence ×3、settings_provider_accounts ×1），随后 `git stash pop` 恢复。典型症状：settings 页 `[data-testid="account-row"]` 过滤 CPA 不可见、settings 窗口 `waitForEvent("window")` 超时。
- 影响：任何跑 electron e2e headless 的 task（含 `test:packaged` 前的对照）需先基线核对；`testing.md` 已挂引用。
- 现状：有效（失败根因未定位，本条只固化「基线同样失败」的事实）

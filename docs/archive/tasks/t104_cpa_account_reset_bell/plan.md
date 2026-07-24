# Task plan

## 步骤与验证

1. 启动 task：切到 `t104_cpa_account_reset_bell`，运行 `scripts/task.py start t104`，将 HEAD 写入 `task.md` 的 `diff_anchor`。→ 验证：task 为 active，分支与 front matter 一致。
2. 红灯：在 `label_map_dialog.test.tsx` 增加 CPA 多账号同 raw_label 的 bell 渲染、全部/部分 watched 的 `aria-pressed`、点击回调 accountKey 集合用例；在 `settings_view.test.tsx` 增加 CPA 数据标签映射弹窗点击 bell 后的 add/remove 持久化用例。→ 验证：新增用例在未实现 props 时失败。
3. 绿：`LabelMapDialog` 增加可选 `watched_metrics` / `on_toggle_watched` props，按 `LabelMapRow.account_keys` 渲染 bell 并回调；`SettingsView` 为 provider 级 CPA 弹窗接入现有 add/remove 与 `save_config`。→ 验证：定向 Vitest 通过。
4. 回归：确认 `LabelMapDialog` 未传回调时不出现 bell，直连 `SettingsForm` 既有入口不变。→ 验证：相关组件测试通过。
5. 运行 typecheck、Prettier、`pnpm test`。→ 验证：质量门通过。
6. 黑盒、双审、收尾。

## 风险与回退

- 风险：CPA 多账号的同 `raw_label` 需使用 gateway `accountKey()`，不得改用 `accountId`。
- 风险：`LabelMapDialog` 也可用于无监控入口的调用方；新增 props 必须可选。
- 回退：仅移除新增 props 与 SettingsView 回调，不影响既有标签映射保存。

## Finalization 时更新的文档

- `docs/specs/ui-views-web.md`：补充 CPA 数据标签映射弹窗按 raw_label 聚合监控重置入口的约定。

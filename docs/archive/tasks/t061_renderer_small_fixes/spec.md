# Task spec

## 背景

review_20260723_opus：I12（`src/renderer/components/AccountRow.tsx:29-40`）`get_account_status` 只识别 disabled/error/auth，`status="unknown"` 落入 `:39` 返回「正常」；配合 `SettingsView.tsx:1506-1515` `map_status`，pending/loading → unknown → AccountRow 显示「正常」，未连接账号被误标正常。I13（`src/renderer/components/SettingsForm.tsx:220-258`）`void onSave(...).then(...).finally(...)` 无 `.catch`，onSave 或 then 内 await 抛错变 unhandled rejection，finally 重置 saving 但用户看不到错误（对比 `CpaConnectorSettings.tsx:212-233` 有 `.catch(setError)`）。

## 范围

- AccountRow：`get_account_status` 对 `unknown` 单独返回「未连接」（灰），不落入「正常」。
- SettingsForm：onSave 链补 `.catch(setError)`，错误显示给用户。

## 非范围

- 不改 map_status 的 pending/loading 语义（仅 AccountRow 显示层区分 unknown）。
- 不重构 SettingsForm 保存逻辑（仅补 catch）。

## 验收标准

- [ ] pending/loading/unknown 状态 AccountRow 显示「未连接」（非「正常」）。
- [ ] SettingsForm 保存失败显示错误（非 unhandled rejection）。
- [ ] 单测覆盖 unknown 状态 + onSave throw 路径。
- [ ] 现有 SettingsView/AccountRow 测试适配。

## 依赖与约束

- 无外部依赖。

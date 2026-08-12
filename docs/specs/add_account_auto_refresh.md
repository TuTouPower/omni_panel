# 添加/复制账号后自动采集用量

## 行为（现在是什么）

添加或复制账号后自动触发新账号的用量采集，与编辑保存行为一致：

- 普通新建（`create_instance_and_save`，`use_connector_catalog.ts`）：保存插件配置时 `refresh_after_save=true`，保存后经 `trigger_background_refresh(instanceId)` 触发采集。
- 复制账号（`SettingsView` `onDuplicate`）：`duplicate` 返回新 instanceId 后触发该实例采集。

此前普通新建传 `refresh_after_save=false` 抑制刷新、复制路径落盘后不触发，均需手动点刷新（p133）。

## 验收标准

- 普通添加账号保存成功后自动触发该账号的用量采集（无需手动点刷新）。
- 复制账号成功后自动触发新实例的用量采集（无需手动点刷新）。

## 实现要点

- `use_connector_catalog.ts`：`create_instance_and_save` 调用 `savePluginSettings` 的第 7 参 `refresh_after_save` 为 `true`。
- `SettingsView.tsx`：`onDuplicate` 在 `duplicate(instanceId)` 返回 `{ instanceId }` 后调用 `trigger_background_refresh(result.instanceId)`，再关闭对话框。

## 测试覆盖

- `use_connector_catalog.test.ts`：断言 `savePluginSettings` 收到 `refresh_after_save=true`。
- `settings_view_accounts.test.tsx`：UI 级断言添加账号保存后 `connector.refresh(newInstanceId)` 被调用；复制账号后 `connector.refresh(duplicateInstanceId)` 被调用。

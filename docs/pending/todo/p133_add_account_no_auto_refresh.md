# p133 添加账号后不自动采集用量，需手动点刷新

- 现象：期望「添加账号保存后自动采集该账号用量」；实际新建账号后卡片无数据，须手动点刷新。kimi 添加第 3 个账号（instanceId bb748d84）后未自动采集。
- 影响：所有新建账号（任意 connector）首次用量需手动刷新；旧账号编辑保存则自动刷新，行为不一致。
- 根因：`src/renderer/hooks/use_connector_catalog.ts` `create_instance_and_save` 调 `savePluginSettings` 传 `refresh_after_save=false`；`savePluginSettings` 默认 `true`（SettingsView.tsx）。编辑路径刷新、新建不刷新，产品缺陷。已扫，唯一新建路径，无同类位点。
- 测试缺口：无测试覆盖「新建账号后触发刷新」；应补断言 create_instance_and_save 后调 trigger_background_refresh。
- 线索：.scratch/bug_t304_evidence.md
- 处理：未开

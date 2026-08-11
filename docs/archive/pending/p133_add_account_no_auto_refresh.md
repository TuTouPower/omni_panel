# p133 添加账号后不自动采集用量，需手动点刷新

- 现象：期望「添加账号保存后自动采集该账号用量」；实际新建账号后卡片无数据，须手动点刷新。kimi 添加第 3 个账号（instanceId bb748d84）后未自动采集。旧账号编辑保存则自动刷新，行为不一致。
- 影响：所有新建账号（任意 connector，含 web/local-api 传输）首次用量需手动刷新；duplicate 复制账号同现象（待确认同类）；编辑保存正常。
- 根因：`src/renderer/hooks/use_connector_catalog.ts` `create_instance_and_save` 调 `savePluginSettings` 传 `refresh_after_save=false`（第 7 参）；`savePluginSettings` 默认 `true`（SettingsView.tsx:345），编辑路径刷新、新建不刷新，产品缺陷。main 侧佐证：`handleConfigCreateInstance`（config-ipc.ts:337-382）仅落盘 + onConfigSaved → orchestrator.reconcile → rebuild 不立即刷新（scheduler-orchestrator.ts:103-113），新实例默认 1800s 周期才首采；新建/编辑差异点只在 renderer 参数。
    - 已确认同类位点：`create_instance_and_save` 传 false（主点，唯一）。
    - 待确认同类：duplicate 复制账号（use-config.ts:134-147 + main handleConfigDuplicate，落盘后无任何 trigger_background_refresh）——行为同现象、机制不同（不经过 refresh_after_save 参数位点）、修复策略分叉（需在 duplicate 后补刷新而非改参数），供 t306 决策是否并入。
    - 已扫排除：CPA 编辑路径（accounts_section.tsx onSave 传 false 但 onSaved(shouldRefresh) 独立触发）；import 导入（createOnConfigImported → refreshAll 立即全量，config-callbacks.ts:21-32）；auto_seed 启动种子（startAll immediate=true）；CpaAddDialog（占位 UI，按钮无 onClick 未接线）；web/local-api（同一 handler 的传输层，不新增位点）。
- 测试缺口：新建流程无刷新断言——`use_connector_catalog.test.ts:70-79` 反而断言第 7 参 `false`（固化现状，修复时须改 `true`）；`settings_view_accounts.test.tsx:241` 新建流程只断言落盘；编辑刷新已有集成断言（settings_view.test.tsx:158）。补测须挡：主点（unit 第 7 参 true + 集成新建流程断言 connector.refresh 被调）+ duplicate（若纳入，集成断言 duplicate 后 refresh(新 instanceId)）；仅按 t306 现策略（断言 create 后 refresh 一次）挡不住 duplicate 点。
- 线索：.scratch/bug_t304_evidence.md（原始 Bug3）、.scratch/p133/evidence.md（2026-08-11 复核扫描）
- 处理：t306

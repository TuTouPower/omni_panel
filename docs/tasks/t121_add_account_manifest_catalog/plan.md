# Task plan

## 步骤与验证

1. 新增 `CONNECTOR_CATALOG: "connector:catalog"` IPC 与 `handleConnectorCatalog`（`src/main/ipc/connector-ipc.ts`）：遍历 `deps.definitions`，每项返回 `{ manifest_id, provider, supported_providers, source, auth, parameters, endpoints }`，复用既有 `metadata_from_definition` / `source_from_definition` / `supported_providers`，不读 `config.plugins`、不读密钥 → 验证：单元测试断言墓碑内 id 与无实例的 manifest 均出现在返回中，且返回项不含任何 secret 值。

2. preload 暴露 `connector.catalog()`，`src/shared/types/ipc.ts` 增 `ConnectorCatalogEntry` 类型 → 验证：`tests/unit/preload` 现有契约测试 + 类型检查通过。

3. `auth-flow-registry.ts` 增按 catalog 解析的入口（接受 `ConnectorCatalogEntry | undefined`），保留现有 `ConnectorInfo` 重载所需行为，兜底仍为 `"apikey"` → 验证：单元测试覆盖 catalog 命中 / 未命中两条路径。

4. `AddAccountDialog` 改用 catalog 项解析 `auth_descriptor` / `auth_method`；`find_connector` 的匹配对象换为 catalog（按 manifest_id / provider 匹配）；`source_instance_id` 不再必需 → 验证：`tests/unit/renderer/components/add_account_dialog.test.tsx` 在 `plugin_infos: []` + catalog 齐全时，四个 vendor 分别渲染对应专用表单。

5. 新增 `CONFIG_CREATE_INSTANCE: "config:createInstance"` 与 `handleConfigCreateInstance`（`src/main/ipc/config-ipc.ts`）：按 manifest_id 找 definition，创建实例（`instanceId`/`stateId` 新 UUID、`executablePath` 取 definition、`parameterValues` 填 manifest 非 secret 默认值、`refreshIntervalSeconds: 0`），同时从 `removedConnectorIds` 移除该 manifest_id，一次 `configStore.save` 写入 → 验证：单元测试断言新实例字段正确、墓碑仅移除目标 id、其他 plugins 与配置字段不丢。

6. `SettingsView.tsx:2119` 的 `onAddAccount` 改为调用 `config.createInstance(manifest_id)` 取新 instanceId，再 `savePluginSettings` 写参数与密钥；移除"源实例不存在则静默 return"分支 → 验证：集成测试断言 `config.plugins` 为空时添加 cpa 也能落盘。

7. 回归既有墓碑行为 → 验证：`tests/unit/main/core/config/auto-seed.test.ts`、`tests/e2e/electron/auto_seed.spec.ts` 保持通过。

8. 跑 `pnpm test` → 验证：全绿。

## 风险与回退

- 风险：`find_connector` 换成 catalog 后，`cpa` 这类"一个 manifest 对应多个 monitor\_\* provider"的匹配语义与原 `supportedProviders.includes()` 不一致，可能匹配错误或匹配不到。
    - 缓解：catalog 项保留 `supported_providers`（复用 `supported_providers(definition)`，cpa 走 `monitor_*` 分支），匹配逻辑与原实现同源。
- 风险：`onAddAccount` 从 duplicate 改 createInstance 后，原先依赖"复制源实例 refreshInterval / manualRefreshOnly"的行为丢失。
    - 缓解：createInstance 直接读 manifest 的 `manualDefault`，与 `auto_seed_connectors` 同源；interval 用 follow-global sentinel `0`，与新 seed 实例一致。
- 风险：清墓碑与 `savePluginSettings` 是两次 config 保存，中间失败会留下"实例已建但密钥未写"的半成品。
    - 缓解：与现有 duplicate + savePluginSettings 两步流程风险等价，不新增；实例未配密钥时连接器 fail 可见，用户可删除重来。
- 回退：本 task 单 commit，`git revert` 即可。运行时 `config.json` 不做迁移写入，回退无数据残留。

## Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：新增 connector catalog 通道（manifest 驱动，与 `config.plugins` 解耦）及其与添加账号流程的关系。
- `docs/blueprint/decisions.md`：记录墓碑（`removedConnectorIds`）仅抑制自动 seed、不抑制用户主动添加的边界决策。

> 验证方式：API（IPC 契约 + 单元测试）。新增自 t121。

# add-account-catalog

添加账号流程按 manifest catalog 解析认证方式并直接创建实例，不再依赖 `config.plugins` 中存在同类实例，也不被 `removedConnectorIds` 墓碑阻断。

## 背景

t107 引入 manifest `auth` 描述符后，`AddAccountDialog` 通过 `connector:list` 返回的 `ConnectorInfo.metadata.auth` 选择认证表单。但 `connector:list` 只遍历 `config.plugins`，而删除账号时 manifest id 记入 `removedConnectorIds` 墓碑（t038），重启后 `auto_seed_connectors` 跳过墓碑内 id，这些连接器不进 `config.plugins`。结果：用户删除 grok/exa/opencode_go/cpa 全部实例后，再添加时 `find_connector` 找不到 → `resolve_auth_method` 回落 `apikey` → 渲染通用 `ApiKeyForm`（placeholder `sk-…`、接口地址提示「默认（官方接口）」），与 manifest 真实认证方式脱钩。

墓碑机制本身保留（防止删除后重启自动复活），但不应阻断用户主动添加。

## catalog 通道

`CONNECTOR_CATALOG: "connector:catalog"` IPC（`src/main/ipc/connector-ipc.ts` `handleConnectorCatalog`）：

- 遍历 `deps.definitions`（已发现的 manifest），返回 `ConnectorCatalogEntry[]`，每项含 `manifest_id` / `source` / `supported_providers` / `metadata`（与 `ConnectorInfo.metadata` 同构）。
- **不读 `configStore`**、不读 `removedConnectorIds`、不读密钥——与 `config.plugins` 及墓碑状态完全解耦。墓碑内 manifest id 仍出现在 catalog。
- `metadata_from_definition` 对 `type: "secret"` 参数不输出 `defaultValue`，避免 catalog 元数据泄漏 secret 默认值。

`ConnectorCatalogEntry` 定义见 `src/shared/types/ipc.ts`。

## createInstance 通道

`CONFIG_CREATE_INSTANCE: "config:createInstance"` IPC（`src/main/ipc/config-ipc.ts` `handleConfigCreateInstance`）：

- 入参 `manifest_id`，在 `deps.definitions` 找对应 manifest。
- 创建新 `ConnectorConfiguration`，实例形状与 `auto_seed_connectors` 一致：`refreshIntervalSeconds: 0`（follow-global sentinel）、`manualDefault` → `manualRefreshOnly`、`parameterValues` 填 manifest 非 secret 默认值、`endpointOverrides: {}`。
- 从 `config.removedConnectorIds` 移除该 manifest id（仅目标 id，其余保留），一次 `configStore.save` 写入。
- secret 参数不落 `parameterValues`，密钥由后续 `config:saveSecrets` 写入 vault。

## 渲染层消费

`AddAccountDialog`（`src/renderer/components/AddAccountDialog.tsx`）接收 `catalog` prop，`find_vendor` 两阶段匹配：

1. `catalog.find(c => c.manifest_id === vendor_id)` — 精确匹配，防止 vendor 等于 cpa 监控目标（如 "claude"）误命中 cpa entry。
2. `catalog.find(c => c.supported_providers.includes(vendor_id))` — provider 兜底。
3. 回落 `plugin_infos`（兼容 instance 已存在的场景）。

返回 `{ connector, manifest_id }`，`handle_save` / `handle_form_save` 用显式 `manifest_id`（不依赖 `metadata.name === manifest id` 隐式契约）。

`SettingsView.onAddAccount` 调 `window.usageboard.config.createInstance(manifest_id)` 取新 instanceId，再 `savePluginSettings` 写参数与密钥。`savePluginSettings` 合并而非替换 `parameterValues`（`{ ...plugin.parameterValues, ...nonSecrets }`），保留 createInstance 写入的 manifest 默认参数（如 cpa 的 `monitor_*`）。

## 墓碑边界（决策）

- `removedConnectorIds`（t038）**仅抑制自动 seed**，不抑制用户主动添加。
- 用户主动添加某 vendor 时清对应 manifest id；未经主动添加时，重启不复活墓碑内连接器。
- catalog 通道完全不读墓碑，是添加流程的权威数据源。

## 验证

- IPC 契约：`tests/unit/ipc/connector-ipc.test.ts`（catalog 不读 configStore + 墓碑内仍返回 + 不泄漏 secret）、`tests/unit/ipc/config-ipc.test.ts`（createInstance 实例字段 + 墓碑清理 + manualDefault + 未知 id 拒绝）。
- 渲染层：`tests/unit/renderer/components/add_account_dialog.test.tsx` catalog-driven 块（grok/exa/opencode_go/cpa 四表单 + 兜底）、`tests/unit/renderer/views/settings_view.test.tsx`（createInstance 落盘）。
- 墓碑回归：`tests/unit/main/core/config/auto-seed.test.ts`、`tests/e2e/electron/auto_seed.spec.ts` 保持通过。

## 相关

- auth 描述符与表单分派：`connector-auth`。
- 添加账号 instance 精确匹配基础：`fix_add_account_wiring`（t110）。

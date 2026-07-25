# Task spec

## 背景

t107-t109 完成 descriptor、registry、表单组件后，需要修复 `SettingsView.tsx` 的 source 查找与 `duplicate` 传参，并接线 exa/cpa 的独立表单。

现有 `SettingsView.tsx:2115` 的 source 查找用 `supportedProviders.includes(vendor_id) || vendor_id === "cpa"`，导致 cpa 匹配到 deepseek（因 CPA connector 被 `source !== "gateway"` 排除，OR fallback 命中第一个非 gateway 插件）。同时 `duplicate` 不传 `displayName`，新账号名称为空。

## 范围

- 改 `src/renderer/views/SettingsView.tsx`：
    - source 查找改为 `p.name === params.vendor_id`（按 manifest id 精确匹配），删除 `|| params.vendor_id === "cpa"` 与 `source !== "gateway"` 过滤。
    - `duplicate(source.instanceId)` 后调用 `savePluginSecrets(created.instanceId, params.secrets)`，再调用 `savePluginSettings(created.instanceId, { displayName: params.account_name })` 写入账号名。
- 新建 `src/renderer/components/forms/CpaMgmtForm.tsx`：
    - 字段：`cpa_mgmt_key`（secret）、`endpoint`（必填，默认 `http://127.0.0.1:17863`）。
    - 保存时 `secrets = { cpa_mgmt_key }`，`endpoint_overrides = { default: endpoint }`。
- 新建 `src/renderer/components/forms/ExaServiceKeyForm.tsx`：
    - 字段：`SERVICE_KEY`（secret）、`API_KEY_ID`（string）、`LIMIT`（number，可选）。
    - 保存时 `secrets = { SERVICE_KEY }`，`parameter_values = { API_KEY_ID, LIMIT }`。
- 改 `AddAccountDialog.tsx`：t108 的 `cpa_mgmt` 占位替换为 `CpaMgmtForm`；exa 的 `apikey` 分支因 descriptor 存在 `extra_fields`，渲染 `ExaServiceKeyForm` 而非通用 `ApiKeyForm`。
- E2E：`tests/e2e/electron/add_account.spec.ts` 补四个厂商添加流程（grok 设备码、opencode_go 网页登录、exa 双字段、cpa 独立表单）。

## 非范围

- 不改 `GrokLoginSection` 复用 `OAuthDeviceForm`（后续优化）。
- 不改其他 12 个 connector 的 manifest（无 auth 块，走 fallback）。

## 验收标准

- [ ] cpa 添加账号时显示 `CpaMgmtForm`，保存后新账号为 cpa 厂商，非 deepseek。
- [ ] exa 添加账号时显示 `SERVICE_KEY` + `API_KEY_ID` 双字段，保存后 connector 启动不抛错。
- [ ] 所有厂商添加账号后 `displayName` 为用户输入的备注，非空。
- [ ] E2E 四个厂商添加流程通过。
- [ ] `pnpm test` 全绿；`pnpm typecheck` 通过。

## 依赖与约束

- 依赖 t108 的 `resolve_auth_method` 与 t109 的表单组件。
- 无后续 task。

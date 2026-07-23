# Task spec

## 背景

CPA（CLIProxyAPI Manager）在添加账号弹窗中单独拎出为"高级方式"section（`AddAccountDialog.tsx:143-155`），样式与其他厂商不一致（大方块 + 独立 `on_cpa` 路径）。用户要求 CPA 改为与其他厂商一致的普通 pick-card 小方块。

## 范围

- `AddAccountDialog.tsx`：CPA 从"高级方式"section 移除，改为 `ADD_COMMON_SERVICES` 中的一个普通条目。
- `VENDOR_AUTH_MAP` 加 `cpa: "apikey"`（CPA 走标准 API Key 表单，管理密钥 + monitor 参数）。
- 删除 `has_cpa` / `on_cpa` props + 高级方式 JSX。
- `common-services.ts` 加 `{ id: "cpa", label: "CPA Manager" }`。
- CPA 参数（monitor_claude / monitor_codex 等）从 `CpaConnectorSettings` 迁移到标准 `ApiKeyForm` + 可选额外参数字段（或单独 CPA 参数子表单嵌入 auth step）。
- `SettingsView.tsx` 中 CPA 卡片样式保留（设置页不影响）。

## 非范围

- 不改 CPA connector 脚本逻辑（`connectors/cpa/connector.ts`）。
- 不改 CPA 的 manifest provider 值（仍为 "cpa"）。
- 不动设置页 CpaCard 组件。

## 验收标准

- [ ] 添加账号弹窗中 CPA 显示在"常用服务"网格内，与其他厂商同尺寸 pick-card。
- [ ] 点击 CPA 后进入标准 auth 表单（管理密钥输入 + monitor 参数）。
- [ ] 删除"高级方式"section。
- [ ] `pnpm test` / `pnpm typecheck` / `pnpm lint` 全绿。

## 依赖与约束

- CPA 参数比普通 API Key 多（monitor_* 系列），需在 ApiKeyForm 扩展或加专用子表单。
- 与 t093（logo）协同。

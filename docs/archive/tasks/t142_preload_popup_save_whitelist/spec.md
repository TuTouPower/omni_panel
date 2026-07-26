# Task spec

## 背景

review_20260726_054747 采纳项 31：popup 路由 `config.save` 持全量非密钥配置写权限超出所需；preload 在 contextIsolation 下本身是信任边界，做字段白名单即可，无需新增 IPC。

## 范围

- preload popup 分支将 `save` 包装为白名单版：仅放行 `providerOrder`、`accountOrders`、`collapsedAccounts`、`expandedProviders`、`accountOverrides` 五个 UI 状态字段，其余字段以当前持久化值覆盖后再调 `config_full.save`。
- `#tray` 保持现有 no-op。
- 补 preload 单测：popup 路由无法修改白名单外字段。

## 非范围

- 不新增 `config.patchUiState` IPC；不改 PopupView 调用。

## 验收标准

- [ ] popup `save` 仅能改白名单五个字段。
- [ ] 白名单外字段修改被忽略，测试通过。
- [ ] `pnpm test` 通过。

## 依赖与约束

- 不改 `#tray` 行为。

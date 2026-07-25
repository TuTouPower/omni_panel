# Task spec

## 背景

t107 在 manifest 中引入 `auth` 块后，渲染层需要从 descriptor 驱动表单，而不是继续用硬编码的 `VENDOR_AUTH_MAP`。本 task 建立 `auth-flow-registry.ts` 作为 descriptor → 表单组件的映射，并删除 `VENDOR_AUTH_MAP`。

现有 `AddAccountDialog.tsx:13` 的 `VENDOR_AUTH_MAP` 把 grok/cpa/exa 全标成 `"apikey"`，与 manifest 真实能力脱钩。本 task 让表单选择逻辑从「渲染层猜」改为「manifest 声明」。

## 范围

- 新建 `src/renderer/lib/auth-flow-registry.ts`：
    - 导出 `resolve_auth_method(connector: ConnectorInfo): AuthMethod`，优先读 `connector.metadata.auth.method`，未声明时按 `capabilities` 推导（`session` / `local` / 默认 `apikey`）。
    - 导出 `AuthMethod` 联合类型：`"apikey" | "oauth_device" | "web_login" | "cpa_mgmt" | "local_cli"`。
- 改 `src/renderer/components/AddAccountDialog.tsx`：
    - 删除 `VENDOR_AUTH_MAP`、`AUTH_APIKEY_META`、`AUTH_SESSION_META`、`OPENCODE_GO_COOKIE_SCRIPT`。
    - `handle_select_vendor` 后从 `plugin_infos` 拿对应 connector 的 `auth` descriptor，dispatch 到子表单。
    - 无 descriptor 时 fallback 到现有 `ApiKeyForm`，secret 名按 manifest `parameters` 第一个 `type: "secret"` 的 name 存。
    - `cpa_mgmt` / `oauth_device` / `web_login` 三种 method 在本 task 先渲染占位组件（`div` 显示「该厂商添加流程将在 t109/t110 实现」），具体表单在后续 task 实现。
- 单测：`tests/unit/renderer/lib/auth-flow-registry.test.ts` 覆盖 descriptor 优先级、fallback 推导、缺失 descriptor 场景；`tests/unit/renderer/components/add_account_dialog.test.tsx` 改为按 descriptor 断言渲染。

## 非范围

- 不实现 `OAuthDeviceForm` / `WebLoginForm` / `CpaMgmtForm` 的具体 UI（t109/t110 处理）。
- 不改 `SettingsView.tsx` 的 source 查找与 `duplicate` 传参（t110 处理）。

## 验收标准

- [ ] `auth-flow-registry.ts` 单测覆盖所有 method 分支与 fallback。
- [ ] `AddAccountDialog.tsx` 删除 `VENDOR_AUTH_MAP`，按 descriptor 渲染子表单。
- [ ] `pnpm test` 全绿；`pnpm typecheck` 通过。

## 依赖与约束

- 依赖 t107 的 `AuthDescriptor` 类型与 IPC 字段。
- 后续 t109 依赖本 task 的 `resolve_auth_method` 与表单骨架。

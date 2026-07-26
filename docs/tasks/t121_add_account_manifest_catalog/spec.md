# Task spec

## 背景

用户反馈添加 grok / exa / opencode / cpa 账号时，四个厂商的认证表单全部错误地显示为通用 API 密钥表单（placeholder `sk-…`、接口地址提示"默认（官方接口）"）。

根因不在四个连接器本身：manifest 声明与专用表单都已正确存在（grok `oauth_device`、exa `apikey`+`extra_fields:["API_KEY_ID"]`、opencode_go `web_login`、cpa `cpa_mgmt`）。真实链路是：

1. 用户曾删除这些账号 → manifest id 记入 `config.removedConnectorIds` 墓碑（`src/renderer/views/SettingsView.tsx:820`）。
2. 重启后 `auto_seed_connectors` 跳过墓碑内 id（`src/main/core/config/auto-seed.ts:47`），这些连接器不进 `config.plugins`。
3. `connector:list` 只遍历 `config.plugins`（`src/main/ipc/connector-ipc.ts:102`），返回列表中没有它们。
4. `AddAccountDialog` 的 `find_connector` 在该列表中查不到（`src/renderer/components/AddAccountDialog.tsx:41-51`），`resolve_auth_method` 落到 default 分支返回 `"apikey"`（`src/renderer/lib/auth-flow-registry.ts:38`）。
5. 渲染通用 `ApiKeyForm`，其硬编码 placeholder 即用户看到的错误文案（`src/renderer/components/add_account/ApiKeyForm.tsx:54,85`）。

同时，添加账号依赖 `config.duplicate(source.instanceId)` 复制既有实例（`src/renderer/views/SettingsView.tsx:2132`），源实例不存在时直接 `return` 静默失败（`:2126-2131`）——即使表单渲染对了也存不下账号。

墓碑机制本身要保留（t038 引入，防止删除后重启自动复活），但它不应影响"用户主动添加"这条路径。

## 范围

- 新增 connector catalog 读取通道：从已发现的 manifest 定义（`ConnectorDefinition[]`）导出可添加的连接器目录，与 `config.plugins` 解耦，不受墓碑与实例存在与否影响。
- `AddAccountDialog` 改为按 catalog 解析 auth descriptor / auth method，取代当前对 `plugin_infos` 的依赖。
- 添加账号落盘路径改为可从 manifest 直接创建新实例（不再要求先存在同类实例可供 duplicate）。
- 用户主动添加某 vendor 时，从 `config.removedConnectorIds` 中清除对应 manifest id。
- 覆盖以上行为的单元测试与集成测试。

## 非范围

- 不验证四个连接器能否真实取到数据（live 契约测试不在本 task）。
- 不清理运行时 `config.json` 中已有的重复 TAVILY / FIRECRAWL 实例。
- 不移除或弱化墓碑机制的自动 seed 抑制行为。
- 不改动四个连接器的 manifest、connector.ts 及各专用表单组件内部实现。
- 不改 `ApiKeyForm` 的 placeholder 文案（它作为通用 apikey 表单的文案本身合理，问题在于不该被错误命中）。

## 验收标准

- [ ] 存在一条不依赖 `config.plugins` 的 catalog 通道，能列出全部已发现连接器的 manifest id、auth descriptor 与 provider，且 manifest id 在 `removedConnectorIds` 中时仍然返回。
- [ ] `resolve_auth_method` 对 catalog 中存在 auth descriptor 的连接器返回 manifest 声明值；对 catalog 中不存在的 vendor 仍返回 `"apikey"` 兜底。
- [ ] 在 `config.plugins` 为空且 `removedConnectorIds` 含全部四个 id 的前提下，添加对话框对 grok 渲染 `OAuthDeviceForm`、exa 渲染 `ExaServiceKeyForm`（两个必填密钥输入框）、opencode_go 渲染 `WebLoginForm`、cpa 渲染 `CpaMgmtForm`（含必填接口地址）。
- [ ] 上述前提下完成任一 vendor 的添加流程后，`config.plugins` 中出现该 manifest 对应的新实例，且 `executablePath` 指向该 manifest 目录、参数与密钥正确落盘。
- [ ] 添加某 vendor 后，`config.removedConnectorIds` 不再包含该 manifest id；其他 id 保持不变。
- [ ] 墓碑对自动 seed 的抑制行为不变：未经用户主动添加时，重启不复活墓碑内连接器（既有 `tests/unit/main/core/config/auto-seed.test.ts` 与 `tests/e2e/electron/auto_seed.spec.ts` 保持通过）。
- [ ] `pnpm test` 全绿。

## 依赖与约束

- 墓碑机制（t038）保留，仅在用户主动添加路径清除对应 id。
- `config.plugins` 与 `removedConnectorIds` 属用户数据，改动需保证并发保存不丢其他字段（复用既有 `configStore.save` 全量写入语义）。
- 新增 IPC 通道须走 `assert_valid_sender` 与 `createLoggedIpcHandler`，与现有 connector IPC 一致。
- 密钥不得在 catalog 通道中传输；catalog 只含 manifest 元数据。

# 密钥库（SecretsVault）

自管加密密钥存储。配置字段含义见 `config-store.md`；运行时 secret 注入见 `connector-runtime.md`。

## 设计决策

**不使用**系统密钥管理器，也不用 Electron safeStorage（底层即 Keychain/DPAPI/libsecret）。自管 AES-256-GCM 文件加密。

## 存储（`{userData}/`）

- `secrets.vault` — 密文。每条 secret 独立 AES-256-GCM（随机 IV + GCM tag 校验完整性）。
- `vault.key` — 32 字节随机主密钥，首次启动生成，文件权限 `0600`（Windows 仅当前用户 ACL）。
- 主密钥常驻主进程内存，**不写日志、不进 IPC、不进崩溃转储**。

## key 命名（`src/main/core/config/secrets-store.ts`）

`keyFor(instanceId, paramName)` 统一命名契约：`${instanceId}:${paramName}`。所有调用方经 `keyFor`，不直接拼字符串。

## 接口（`VaultBackend`）

```ts
get(key): Promise<string | null>
set(key, value): Promise<void>
delete(key): Promise<void>
has(key): Promise<boolean>
listKeys(prefix?): Promise<string[]>
```

文件后端是首个实现；日后切 safeStorage / 系统钥匙串，换实现不动调用方。

## 内存镜像（t195）

`file-vault-backend` 维护整份 vault 的内存镜像：首次 `get`/`has`/`list_keys` 读盘一次后缓存，后续读取不再重读整份文件（AC-003）。`set`/`delete` 构造新镜像并**写盘成功后才提交**——写失败（磁盘满/权限/IO）时镜像仍是磁盘一致状态，调用方不会读到未持久化的值（AC-002 一致性语义）。

## 备份文件权限（t296）

`secrets.vault.bak` 写入后与主文件一致执行 `chmod 0600` / Windows `icacls` 当前用户 ACL 硬化（`set_file_permissions`），不随 umask 放宽为 group/other 可读。

## 最小暴露规则

- `config.get` 仍只返回 `hasSecrets: Record<instanceId, Record<param, boolean>>`（布尔），配置本体脱敏。
- **设置窗按需明文**：`config:getSecrets({ instanceId })` 从 vault 解密该实例 secret 参数明文，供编辑表单回填与眼睛开关显示。仅 settings preload 暴露；popup/tray stub 返回 `{}`。用量面板/托盘不拉密钥。
- 连接器刷新时主进程 just-in-time 解密，按 manifest auth 模板注入宿主请求；明文默认不进沙箱，更不进 stdin/argv/env。
- 仅 `exposeToScript: true` 的 secret 从 vault 取明文进 `ctx.params`，否则走 `ctx.http` 宿主侧 `apply_request_auth`。
- **威胁扩展**：设置窗打开期间明文在渲染进程内存（截图/DevTools 可及）；日志 scrubber 仍强制脱敏。

## 日志脱敏

每个解密出的 secret 值注册进 Logger scrubber，任何日志输出前做值替换。**开发期同样生效**（删除了旧"开发期 raw debug 记录完整原值"的漏洞）。

## 导入/导出（`CONFIG_EXPORT` / `CONFIG_IMPORT`）

- 导出默认不含密钥；仅用户显式选择时才写入——设置窗「包含明文密钥」勾选（`config:export` 透传 `includeSecrets`）、`omni_panel export --include-secrets`、`GET /v1/config/export?includeSecrets=true`。写入时 `ConfigExportData.secrets: Record<string, string>` 即为 vault 解密后的**真实明文密钥，不脱敏、不加密**，导出文件的安全由用户自行负责。
- **导出范围仅含配置与 vault 密钥**，不含历史用量数据库 `observations.sqlite`、snapshot-cache、日志文件、runtime states 等。导入后新实例会重新采集用量；如需迁移历史观测，须单独拷贝 `{userData}/observations.sqlite`。
- 导入时 `secretsStore.importAll` 走 delete-all + replace 语义（原子化 + 快照回滚，commit `d053992`），导入文件中的 secrets 字段直接写入 vault。
- 导入成功后触发一次全局刷新：`CONFIG_IMPORT` 成功路径先经 `onConfigSaved`（rebuild scheduler、注册新 connector runtime），再触发 `onConfigImported -> refreshService.refreshAll()`（t045，fire-and-forget + `.catch(log.error)`），使新增连接器立即采集一次，无需等 scheduler 周期或手动刷新。导入取消 / 格式无效 / secrets 回滚 throw 等非成功路径不触达。
- **安全提示**：含明文密钥的导出文件应避免放入云盘同步、版本控制或公共位置。

## 威胁模型（诚实记录）

- **防**：配置目录被整体拷走 / 同步进云盘备份 —— 拿到 `secrets.vault` 无 `vault.key` 读不出。
- **不防**：同一用户身份下的恶意进程 —— key 与密文同目录，本机恶意代码两者皆可读。这是"不用系统密钥管理器"的固有代价。
- 加固优先级：可选主口令（用户口令经 KDF 参与主密钥派生）> 切系统钥匙串后端。

## 已知限制（`../archive/_pre_opinit_20260705/PLAN.md`）

导入配置可重定向连接器端点到公网攻击者主机，`apply_request_auth` 会把现存 vault secret 发过去。`assert_safe_connector_host` 只拦云元数据主机，不拦公网。缓解：桌面导入路径在写入前对含 `endpointOverrides` 的配置弹确认对话框（`config-ipc.handleConfigImport`）；Web `POST /v1/config/import` 直连 `handleConfigImportData`，无等效确认。待办：端点变更要求重录 secret。

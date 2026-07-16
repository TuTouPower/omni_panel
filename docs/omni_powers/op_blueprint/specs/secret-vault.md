<!-- omni_powers: blueprint/specs/secret-vault -->

# 密钥库（SecretsVault）

自管加密密钥存储。配置字段含义见 `config-store.md`；运行时 secret 注入见 `connector-runtime.md`。

## 设计决策

**不使用**系统密钥管理器，也不用 Electron safeStorage（底层即 Keychain/DPAPI/libsecret）。自管 AES-256-GCM 文件加密。

## 存储（`{userData}/`）

- `secrets.vault` — 密文。每条 secret 独立 AES-256-GCM（随机 IV + GCM tag 校验完整性）。
- `vault.key` — 32 字节随机主密钥，首次启动生成，文件权限 `0600`（Windows 仅当前用户 ACL）。
- 主密钥常驻主进程内存，**不写日志、不进 IPC、不进崩溃转储**。

## key 命名（`src/main/core/vault`，commit `5b05ead`）

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

## 最小暴露规则

- `config.get` 仍只返回 `hasSecrets: Record<instanceId, Record<param, boolean>>`（布尔），配置本体脱敏。
- **设置窗按需明文**：`config:getSecrets({ instanceId })` 从 vault 解密该实例 secret 参数明文，供编辑表单回填与眼睛开关显示。仅 settings preload 暴露；popup/tray stub 返回 `{}`。主面板/托盘不拉密钥。
- 连接器刷新时主进程 just-in-time 解密，按 manifest auth 模板注入宿主请求；明文默认不进沙箱，更不进 stdin/argv/env。
- 仅 `exposeToScript: true` 的 secret 从 vault 取明文进 `ctx.params`，否则走 `ctx.http` 宿主侧 `apply_auth`。
- **威胁扩展**：设置窗打开期间明文在渲染进程内存（截图/DevTools 可及）；日志 scrubber 仍强制脱敏。

## 日志脱敏

每个解密出的 secret 值注册进 Logger scrubber，任何日志输出前做值替换。**开发期同样生效**（删除了旧"开发期 raw debug 记录完整原值"的漏洞）。

## 导入/导出（`CONFIG_EXPORT` / `CONFIG_IMPORT`）

- 配置可明文导出，**密钥明文导出**——`ConfigExportData.secrets: Record<string, string>` 在文件中即为 vault 解密后的真实密钥。用户决策（待澄清-1）：权限完全开放给用户，不脱敏、不加密，用户自己负责导出文件的安全。
- 导入时 `secretsStore.importAll` 走 delete-all + replace 语义（原子化 + 快照回滚，commit `d053992`），导入文件中的 secrets 字段直接写入 vault。
- **安全提示**：导出文件含明文密钥，应避免放入云盘同步、版本控制或公共位置。

## 威胁模型（诚实记录）

- **防**：配置目录被整体拷走 / 同步进云盘备份 —— 拿到 `secrets.vault` 无 `vault.key` 读不出。
- **不防**：同一用户身份下的恶意进程 —— key 与密文同目录，本机恶意代码两者皆可读。这是"不用系统密钥管理器"的固有代价。
- 加固优先级：可选主口令（用户口令经 KDF 参与主密钥派生）> 切系统钥匙串后端。

## 已知限制（`PLAN.md`）

导入配置可重定向连接器端点到公网攻击者主机，`apply_auth` 会把现存 vault secret 发过去。`assert_safe_connector_host` 只拦云元数据主机，不拦公网。待办：端点变更要求重录 secret 或导入时显式确认。

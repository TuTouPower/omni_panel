<!-- omni_powers: blueprint/specs/config-store -->

# 配置管理（config store）

密钥见 `secret-vault.md`；字段的业务含义见 `domain.md`。

## 数据模型

### AppConfiguration（`src/shared/types/config.ts` + `appConfigurationSchema`，Zod）

`schemaVersion`、`language`（zh-Hans|en）、`plugins: ConnectorConfiguration[]`、`launchAtLogin`，及可选：`proxy{url,noProxy?}`、`accentColor`、`theme`、`logLevel`、`pinToTop`、`minimizeToTray`、`globalRefreshIntervalSeconds`、`pauseAutoRefresh`、`providerOrder`、`accountOrders`、`cacheMaxMb`、`mainPanelMode`、`floatingHeightMode`、`usageBarColorScheme`、`usageBarStyle`、`providerLabelMaps`、`accountLabelMaps`、`labelMapSync`、`settingsBounds`、`floatingBounds`、`collapsedAccounts`、`expandedProviders`、`convergentTimeMinutes`。

> `accountOverrides` 在 TS 接口里有，但**不在 Zod schema** —— load 时会被静默剥掉（已知不一致）。

### ConnectorConfiguration

`instanceId`、`stateId`、`name`、`enabled`、`executablePath`、`refreshIntervalSeconds`、`manualRefreshOnly?`、`parameterValues`（record<string, string|number>，非 secret）、`endpointOverrides`（record<string,string>，默认 `{}`）。

## 接口

- `load()` / `scheduleSave(config, delayMs=500)` / `flushPendingSave` / `hasPendingSave`。
- `refreshIntervalSecondsSchema`：`0` = 跟随全局哨兵；非零 clamp `[60, 172800]`。

## 行为（现在是什么）

- 文件 `{userData}/config.json`（`getConfigPath()`）。
- **保存**：`scheduleSave` 防抖 500ms；所有写经串行 `saveTail` promise 链（并发写不交错，失败不毒化链）；`writeJsonAtomic` + `sortKeys` 稳定 diff。
- **载入加固**：schema 不匹配先试 `.bak` 恢复，否则把损坏文件备份为 `.bak` 并返回 `DEFAULT_CONFIGURATION`。
- **零散迁移（非版本引擎）**：`instanceId ?? stateId` 回填；`stripRemovedConfigFields` 删已移除的 `overviewDisplayMode`；`prune_invalid_plugins` 删 manifest 缺失或 provider 不在白名单的插件并回写。
- **auto-seed（`auto_seed_connectors`）**：把发现的连接器定义并入 config。新连接器 `randomUUID` 的 instanceId/stateId、`name = manifest.id.toUpperCase()`、`enabled:true`、`refreshIntervalSeconds:0`（跟随全局）、`manualRefreshOnly` 若 `manifest.manualDefault`、种非 secret 参数默认、`endpointOverrides:{}`。已存在项按 id 匹配，仅更新 executablePath。

## 边界

- `schemaVersion` 字段存在但**无版本分支迁移引擎**（`architecture.md` §6）。
- 导入导出见 `ipc.md`（`CONFIG_EXPORT`/`CONFIG_IMPORT`，**密钥明文导出**，权限完全开放给用户）与 `secret-vault.md`。

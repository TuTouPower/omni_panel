# 配置管理（config store）

密钥见 `secret-vault.md`；字段的业务含义见 `domain.md`。

## 数据模型

### AppConfiguration（`src/shared/types/config.ts` + `appConfigurationSchema`，Zod）

`schemaVersion`、`language`（zh-Hans|en）、`plugins: ConnectorConfiguration[]`、`launchAtLogin`，及可选：`proxy{url,noProxy?}`、`accentColor`、`theme`、`logLevel`、`pinToTop`、`minimizeToTray`、`globalRefreshIntervalSeconds`、`pauseAutoRefresh`、`providerOrder`、`accountOrders`、`cacheMaxMb`、`mainPanelMode`（`system|popup|floating`，见 `window-management.md`）、`floatingHeightMode`、`usageBarColorScheme`、`usageBarStyle`、`providerLabelMaps`、`accountLabelMaps`、`labelMapSync`、`uiDesensitizeRemarks`、`providerForcePercent`、`settingsBounds`、`floatingBounds`、`collapsedAccounts`、`expandedProviders`、`convergentTimeMinutes`、`accountLabels`、`dirAliases`、`modelAliases`。

- `uiDesensitizeRemarks`：为 true 时用量面板与设置账号列表隐藏备注/displayName。
- `providerForcePercent`：`Partial<Record<string, boolean>>`，厂商级强制用量数字显示为百分比。

> `accountOverrides` 已纳入 Zod schema（`accountOverridesSchema`，结构 `{ hidden?: Record<provider, string[]> }`）；`accountLabels`、`dirAliases`（default `[]`）、`modelAliases`（default `[]`）同样在 schema 内。

### ConnectorConfiguration

`instanceId`、`stateId`、`name`、`displayName?`、`enabled`、`executablePath`、`refreshIntervalSeconds`、`manualRefreshOnly?`、`parameterValues`（record<string, string|number>，非 secret）、`endpointOverrides`（record<string,string>，默认 `{}`）。

## 接口

- `load()` / `scheduleSave(config | () => config, delayMs=500)` / `flushPendingSave` / `hasPendingSave`。
- `refreshIntervalSecondsSchema`：`0` = 跟随全局哨兵；非零 clamp `[60, 172800]`。

## 行为（现在是什么）

- 文件 `{userData}/config.json`（`getConfigPath()`）。
- **保存**：`scheduleSave` 防抖 500ms；所有写经串行 `saveTail` promise 链（并发写不交错，失败不毒化链）；`writeJsonAtomic` + `sortKeys` 稳定 diff。
- **防抖 payload 用 thunk（t105）**：`scheduleSave` 接受 `AppConfiguration` 或返回它的 thunk，thunk 在防抖触发（及 `flushPendingSave`）时才求值。只改单个字段的调用方（`src/main/index.ts` 的 `save_settings_bounds`、main-panel `save_config` 窗口 bounds）必须传 thunk：窗口 resize/move 在事件发生时抓 `currentConfigSnapshot`，500ms 后落盘会把这期间 renderer 已保存的 `providerOrder` / `expandedProviders` 回滚（既有数据丢失 bug，t105 修）。
- **载入加固（t111）**：schema 不匹配、空文件/仅空白字符、IO 错误等非 ENOENT 情况均不返回 `DEFAULT_CONFIGURATION`（防止 auto_seed 覆盖用户数据）；schema 不匹配时先试 `.bak` 恢复，否则把损坏文件备份为 `.bak` 并抛错。ENOENT 时仅当配置目录不存在才返回 defaults 并允许 auto_seed；目录存在但 `config.json` 缺失视为异常抛错。
- **零散迁移（非版本引擎）**：`instanceId ?? stateId` 回填；`stripRemovedConfigFields` 删已移除的 `overviewDisplayMode`；`prune_invalid_plugins` 删 manifest 缺失或 provider 不在白名单的插件并回写。
- **auto-seed（`auto_seed_connectors`）**：把发现的连接器定义并入 config。新连接器 `randomUUID` 的 instanceId/stateId、`name = manifest.id.toUpperCase()`、`enabled:true`、`refreshIntervalSeconds:0`（跟随全局）、`manualRefreshOnly` 若 `manifest.manualDefault`、种非 secret 参数默认、`endpointOverrides:{}`。已存在项按 id 匹配，仅更新 executablePath。**tombstone（t038）**：第 3 参 `removed_ids: ReadonlySet<string>`（来自 `config.removedConnectorIds`），manifest id 命中则跳过 seed，删除的内置连接器重启不复活。
- **`removedConnectorIds`（t038）**：`AppConfiguration` 可选字段，manifest id 数组。删除/移除连接器时（SettingsView `with_removed_connector`）把 manifest id（`info.metadata.name`）去重写入。旧 config 无此字段 = 空集合，向后兼容。
- **`upcomingResetThresholdPercent`（t041）**：`AppConfiguration` 可选字段，`number | null`（zod `int().min(0).max(100).nullable().optional()`）。剩余时间占周期百分比 ≤ 此值时账号进「即将重置」面板；null/undefined = 不展示面板。设置页常规段阈值 input 控制（留空存 null）。
- **`accountOverrides.upcomingResetWatched`（t043/t104）**：`Partial<Record<UsageProvider, Partial<Record<string, readonly string[]>>>>`（provider → accountKey → `raw_label[]`）。显式开启「即将重置」监控的数据标签；缺省/空 = 全关。用量面板 period 行与 CPA 标签映射弹窗的 bell 均写入此字段（t043 取代 t041 account 级 `upcomingResetOff`，旧字段 zod 默认 strip 迁移）。

## 边界

- `schemaVersion` 字段存在但**无版本分支迁移引擎**（`architecture.md` §6）。
- 导入导出见 `ipc-api.md`/`ipc-electron.md`（`CONFIG_EXPORT`/`CONFIG_IMPORT`，**密钥明文导出**，权限完全开放给用户）与 `secret-vault.md`。

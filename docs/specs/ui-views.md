# UI 视图（renderer）

`src/renderer/views/`。IPC 见 `ipc.md`；窗口承载见 `window-management.md`；术语见 `domain.md`。

## 视图

### PopupView（用量面板，route=usage）

托盘弹窗用量面板，默认视图。组合：

- `ProviderNav` — 顶部 provider 导航 tab（总览 + 各 provider）
- `ProviderOverview` — 概览聚合卡片
- `ProviderAccountList` — 单 provider 下账号列表
- `TokenPanel` — 用量条展示
- `CollapsibleCard` — 可折叠卡片

数据管线（`lib/provider-usage`）：

- `build_provider_usage_groups` — 按 provider 聚合观测
- `visible_providers_from_groups` — 计算可见 provider
- `apply_account_overrides` — 应用账号隐藏/标签/排序
- `PROVIDER_ORDER` — provider 排序

特性：

- `use_popup_height_report` + `useResizeObserver` — 上报内容高度驱动窗口自适应
- `useNowTick` — 周期 tick 刷新相对时间显示
- 用量条样式：`UsageBarStyle`（细线 / 粗胶囊）/ `UsageBarColorScheme`
- **用量面板无账号编辑入口**（T8）：账号设置仅在 Settings；用量面板 provider 卡片无更多操作菜单，关闭/管理操作在设置页进行
- **界面脱敏** `uiDesensitizeRemarks`：隐藏备注/displayName（用量面板 + 设置列表）
- **厂商强制百分比** `providerForcePercent`：该厂商用量数字统一为 %

### SettingsView（设置窗，route=setting）

`SettingsForm` + `SecretInput`（密钥睁/闭）+ `VendorCard`（直连 provider 卡，内嵌 `AccountRow`）+ `CpaCard`（CPA 卡，父行自渲染 + `AccountRow mode="cpa-child"`）+ `CpaConnectorSettings`（CPA 数据源详情）+ `LabelMapDialog`（数据标签映射）+ `RenameAccountDialog`（账号备注）+ `ConfirmDelete`（删除确认）+ `AddAccountDialog`（新增账号）。

编辑已存密钥时 `config:getSecrets` 回填明文；输入框 `spellCheck={false}`。

**数据标签映射 key 不变量**（`lib/label-map-util` `build_label_map_rows`）：

- 映射配置 **key 永远是 `item.raw_label`**（与用量面板 `format_usage_period_label` 查找键一致）。禁止用 `normalized_label` 或显示名作 key。
- `LabelMapRow`：`raw`（key）/ `default`（无用户覆盖时的显示回退）/ `display`（`existing_map[raw]` 或 `default`）。
- 直连（`SettingsForm`）与 CPA（`LabelMapDialog`）共用此 util；CPA 可用 `normalize_for_display` 剥账号名做默认显示，**不改 key**。
- 按 `raw_label` 去重（first wins）。旧映射若误用 `normalized_label` 作 key 不迁移，用户重设。

**账号行布局**（`AccountRow` + `CpaCard`）：

- 身份区（`.ar-id`）：`VendorMark` + 厂商名 + `· 备注`（仅 `displayName`/`account_label` 非空时显示）。备注灰 `--text-3`，长文本截断。
- 状态区（`.ar-status`，固定 `72px`）：状态灯 + 状态文字。直连行始终显示；CPA 父行显示整体连接状态；CPA 子行不渲染。
- 状态映射：`ok` → 绿"正常"；`error` → 红"采集失败"；`auth` → 红"凭证失效"；`disabled`/`!enabled` → 灰"已关闭"。CPA 父行 `partial`/`error` → 红"采集失败"。
- CPA 父行：`CPA · displayName`（无备注时仅 `CPA`），不显示账号/服务商计数。子行去重 `provider:account_id`，保留隐藏开关/改备注/来源已移除清除。
- 术语统一："备注名"/"账号名称"/"别名" → "备注"。底层 `displayName` 字段与 schema 不变。

- `REFRESH_INTERVAL_OPTIONS` + `refresh_seconds_to_label` / `refresh_label_to_seconds` — 刷新间隔选项
- `account_overrides`（add/remove）— 账号隐藏/标签
- `ADD_COMMON_SERVICES` — 添加账号的服务清单
- `redact_config_raw` — config 日志脱敏
- 导航：设置内编辑账号；用量面板不再跳转编辑
- **实时同步**：订阅 `onStateChange` 保持 `pluginInfos` 与 connector snapshot 同步（CPA 连接器状态就绪后子行即时出现）
- **CPA 保存导航**：配置和 secret 持久化成功后立即退出 `CpaConnectorSettings`，返回账号列表；保存失败则保留详情页和输入并显示错误。
- **CPA 保存刷新**：管理密钥、CPA-Manager URL、monitor 实际变化时，仅 fire-and-forget 调用当前 CPA `connector.refresh(instanceId)`；备注、刷新间隔及无变化提交不立即采集，且从不调用 `refreshAll()`。

### TrayMenu（托盘菜单，route=tray）

自定义 frameless 托盘菜单（非系统原生菜单）。`TrayMenuItem`：icon / label_zh / label_en / danger / checked / action。

- `is_paused` — 暂停状态（`tray:pauseState`）
- autostart 状态（`tray:autostartState`）
- `tray:reportMenuSize` 上报菜单尺寸驱动窗口大小
- 版本号从 URL hash `?v=` 解析

### TokenStatsView（token 统计，route=agent）

独立窗（900×700，frame:true）。Claude Code / OpenCode / Kimi Code 本地 token 与 session 统计。组合：

- `MetricDonut` — 指标环形图
- `BarChart` — 柱状图
- `Heatmap` — 热力图
- `SessionTable` — 会话列表
- `Segmented` / `RangePicker` — 分段与时间范围筛选

数据管线（`lib/token-stats`）：`filtered` / `aggregate` / `chart-data`（agentSegments / compositionSegments / modelSegments / projectSegments）。过滤维度：agent / platform（win/wsl）/ range（24h/7d/30d）/ metric / xAxis。详见 `specs/ai-cli-token-stats.md`。

## 共性

- 全部 `useTheme()` 适配 dark/light
- 经 `window.usageboard`（preload `UsageboardApi`）调主进程，不直接 Node
- 日志经 `log:renderer` 转发主进程统一 scrubber 脱敏

## 国际化

`language: zh-Hans | en`。label 双语字段 `label` / `label@zh-Hans`。

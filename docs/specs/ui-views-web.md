> 验证方式：Web（out/web SPA 可渲染）。拆自 ui-views（t037）。

# ui-views-web

`src/renderer/views/`。IPC 见 `ipc.md`；窗口承载见 `window-management.md`；术语见 `domain.md`。

## 视图

### PopupView（用量面板，route=usage）

托盘弹窗用量面板，默认视图。组合：

- `ProviderNav` — 顶部 provider 导航 tab（总览 + 各 provider）
- `ProviderOverview` — 概览聚合卡片
- `UpcomingResetBanner` / `UpcomingResetRail` — 即将重置横幅 + 右侧轨道（t005，`<1024px` 仅 banner，`≥1024px` 出现右侧 sticky rail）；t041 起 threshold（`upcomingResetThresholdPercent`）为 null 时整体不渲染，非 null 时 `collect_upcoming_resets` 按剩余%（`(resetAt-now)/cycleDurationMs*100 ≤ threshold`）+ metric 级显式开启（`accountOverrides.upcomingResetWatched`，默认全关；period 仅当 (provider,accountKey,raw_label) 在 watched 集合才进面板）过滤。主面板 period 行 bell toggle 控监控开关（t043，取代 t041 account 级开关）。
- `ProviderAccountList` → `ProviderAccountRow` — 单 provider 账号列表 / 账号行
- `TrendSparkline` — 账号展开时趋势迷你图（t006，懒加载 `trend:get`，缓存 key `${provider}||${accountId}||${metricId}`）
- `DragGrip` — 账号行拖拽手柄（仅提供 `onDragStart` 时渲染）
- `TokenPanel` — 用量条展示
- `CollapsibleCard` — 可折叠卡片

数据管线（`lib/provider-usage`）：

- `build_provider_usage_groups` — 按 provider 聚合观测
- `visible_providers_from_groups` — 计算可见 provider
- `apply_account_overrides` — 应用账号隐藏/排序
- `apply_account_labels` — 应用账号备注（`displayName`/`accountLabel`）
- `collect_upcoming_resets` — 收集即将到来的重置项（驱动 Banner/Rail）
- `buildAccountErrors` — per-account 错误消息（驱动 `ProviderAccountRow` error-badge）
- `PROVIDER_ORDER` — provider 排序

特性：

- `use_popup_height_report` + `useResizeObserver` — 上报内容高度驱动窗口自适应
- `useNowTick` — 周期 tick 刷新相对时间显示
- 用量条样式：`UsageBarStyle`（细线 / 粗胶囊）/ `UsageBarColorScheme`
- **容器查询响应式**（t004，`.scroll-inner` 设 `container-type: inline-size`）：`overview-grid` 单列默认；`@container (min-width: 1024px)` 切 `repeat(auto-fill, minmax(320px, 1fr))`；`@container (max-width: 1023px) and (min-width: 640px)` 切两列。`.overview-row` 在 `≥1024px` 切 `minmax(0, 1fr) 264px` 主轨 + sticky rail。offscreen `.popup-mirror .scroll-inner` 关闭 container-type 以免 mirror 高度被压缩。
- **per-account error badge**（t026/t027/t028）：`buildAccountErrors` 生成 `Map<accountId, error>`，传入 `ProviderAccountList` → `ProviderAccountRow.error`；账号行 `.rel-time` 内渲染 `<span className="error-badge" title={error}>采集失败</span>`。`providerErrors`（connector `failed` 时映射 `UsageProvider`）驱动 `ProviderOverview` 刷新按钮状态。
- **失败账号占位（t040）**：`build_provider_usage_groups` 对 enabled 直连（非 gateway）`snapshot.status==="failed"` 且 `items` 空的 connector 合成失败账号占位（`ProviderUsageAccount`：`periods:[]`、`status:"unknown"`、`error=snapshot.error`、`accountLabel=displayName||name`、`accountId="__failed__"`），使首次采集失败（无 observation）的账号仍显示失败行而非"暂无账号"。CPA（gateway）failed 不合成（多账号无法确定具体行）；有 items 的 failed 走真实 item 聚合不占位。`buildAccountErrors` 先看 `account.error` 再看 `periods[].error`。
- **用量面板无账号编辑入口**（T8）：账号设置仅在 Settings；用量面板 provider 卡片无更多操作菜单，关闭/管理操作在设置页进行
- **界面脱敏** `uiDesensitizeRemarks`：隐藏备注/displayName（用量面板 + 设置列表）
- **厂商强制百分比** `providerForcePercent`：该厂商用量数字统一为 %

### SettingsView（设置窗，route=setting）

`SettingsForm` + `SecretInput`（密钥睁/闭）+ `VendorCard`（直连 provider 卡，内嵌 `AccountRow`）+ `CpaCard`（CPA 卡，父行自渲染 + `AccountRow mode="cpa-child"`）+ `CpaConnectorSettings`（CPA 数据源详情）+ `LabelMapDialog`（数据标签映射）+ `RenameAccountDialog`（账号备注）+ `ConfirmDelete`（删除确认）+ `AddAccountDialog`（新增账号）。

**导航分区**（t017/t023/t027/t028，`NAV_ITEMS`）：`general`（常规）/ `accounts`（账号）/ `appearance`（外观）/ `data`（数据与隐私）/ `about`（关于），各项带 `icon`（gear/inbox/palette/shield/info）。

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

### TokenStatsView（token 统计，route=agent）

独立窗（900×700，frame:true）。Claude Code / OpenCode / Kimi Code 本地 token 与 session 统计。组合：

- `MetricDonut` — 指标环形图
- `BarChart` — 柱状图
- `Heatmap` — 热力图
- `SessionTable` — 会话列表
- `Segmented` / `RangePicker` — 分段与时间范围筛选

数据管线（`lib/token-stats`）：`filtered` / `aggregate` / `chart-data`（agentSegments / compositionSegments / modelSegments / projectSegments）。过滤维度：agent / platform（win/wsl）/ range（24h/7d/30d）/ metric / xAxis。详见 `specs/ai-cli-token-stats-ui.md`。

## 共性

- 全部 `useTheme()` 适配 dark/light
- 经 `window.usageboard`（preload `UsageboardApi`）调主进程，不直接 Node
- 日志经 `log:renderer` 转发主进程统一 scrubber 脱敏
- **图标系统**（t014，`components/Icon.tsx`）：`Icon`（内置 `UI_ICONS` path 表，按 `name` 取）+ `VendorMark`（厂商标识，按 `VendorId` 优先查 `VENDOR_THEME_LOGOS` 主题切换 → `VENDOR_LOGOS` 单态 → `VENDOR_MARKS` 内联 SVG，兜底 `overview`）+ `VendorId`（`UsageProvider | "overview" | "cpa"`）。被 SettingsView/TrayMenu/ProviderAccountRow/ProviderNav 等共用。

## 国际化

`language: zh-Hans | en`。label 双语字段 `label` / `label@zh-Hans`。

# 代码审阅报告

**日期**: 2026-06-05
**分支**: master (ab2708c)
**范围**: `src/` 全量

---

## 一、死代码

### 1.1 整文件未使用（knip 确认）

| 文件                                              | 行数 | 说明          |
| ------------------------------------------------- | ---- | ------------- |
| `src/renderer/components/ConnectorStatusCard.tsx` | 17   | 从未被 import |
| `src/renderer/components/UsageBarRow.tsx`         | 35   | 从未被 import |

### 1.2 导出但从未被 import 的符号

| 符号                       | 文件                                    | 行号 |
| -------------------------- | --------------------------------------- | ---- |
| `MetadataParseError`       | `src/shared/errors/plugin-errors.ts`    | 21   |
| `parsePluginSuccessOutput` | `src/main/core/plugin/output-parser.ts` | 25   |
| `SystemEventBus`           | `src/main/core/scheduler/types.ts`      | 24   |

### 1.3 导出但仅文件内使用的符号（不需要 export）

| 符号                  | 文件                                                | 行号 |
| --------------------- | --------------------------------------------------- | ---- |
| `PluginSchedulerDeps` | `src/main/core/scheduler/plugin-scheduler.ts`       | 4    |
| `PluginListConfig`    | `src/main/core/scheduler/scheduler-orchestrator.ts` | 7    |
| `USAGE_COLORS`        | `src/renderer/lib/usage-colors.ts`                  | 1    |
| `PROVIDER_ORDER`      | `src/renderer/lib/provider-usage.ts`                | 43   |

### 1.4 功能性死代码

| 位置                                                  | 说明                                                                                                                                         |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main/index.ts:534-594`                           | 重复的 `tray.on("click")` 处理器。第一个被第二个完全覆盖（两个都注册在同一 tray 对象上，第二个更完整），第一个 61 行代码虽执行但效果被覆盖。 |
| `src/renderer/components/ProviderCard.tsx:233,330`    | `menu_wrap_ref` 赋值给 DOM 但 `.current` 从未读取，点击检测用的是 `menu_ref`。                                                               |
| `src/renderer/views/SettingsView.tsx:597-599`         | "测试连接"按钮无 `onClick`，纯装饰。                                                                                                         |
| `src/renderer/views/SettingsView.tsx:1544-1550`       | "清除缓存"按钮无 `onClick`。                                                                                                                 |
| `src/renderer/views/SettingsView.tsx:1596-1606`       | "重置应用"按钮无 `onClick`。                                                                                                                 |
| `src/renderer/views/SettingsView.tsx:1625-1628`       | "检查更新"按钮无 `onClick`。                                                                                                                 |
| `src/renderer/views/SettingsView.tsx:1631-1646`       | "更新日志""开源许可""反馈问题""访问官网" 行无点击行为。                                                                                      |
| `src/renderer/views/SettingsView.tsx:507-510,605-610` | `CpaAddDialog` 中 `url`/`key`/`scope` 状态收集了输入但"保存并同步"按钮无 `onClick`，整个保存流程缺失。                                       |

---

## 二、超大文件（> 500 行）

| 文件                                       | 行数     | 建议拆分方式       |
| ------------------------------------------ | -------- | ------------------ |
| `src/renderer/views/SettingsView.tsx`      | **1701** | 见下方详细拆分方案 |
| `src/main/index.ts`                        | **852**  | 见下方详细拆分方案 |
| `src/renderer/views/PopupView.tsx`         | **653**  | 见下方详细拆分方案 |
| `src/renderer/components/ProviderCard.tsx` | **524**  | 见下方详细拆分方案 |

### 2.1 SettingsView.tsx 拆分方案（1701 → ~300 行主文件）

| 新文件                                  | 来源行    | 内容                       |
| --------------------------------------- | --------- | -------------------------- |
| `components/settings-ui/Toggle.tsx`     | 35-55     | 通用开关组件               |
| `components/settings-ui/SetRow.tsx`     | 57-75     | 通用设置行                 |
| `components/settings-ui/Select.tsx`     | 77-101    | 通用下拉                   |
| `components/AccountDialog.tsx`          | 103-233   | 账户编辑弹窗               |
| `components/AddAccountPicker.tsx`       | 244-302   | 添加账户选择器             |
| `components/DataSourceList.tsx`         | 304-420   | 数据源列表                 |
| `components/CpaDetailPage.tsx`          | 422-501   | CPA 详情页                 |
| `components/CpaAddDialog.tsx`           | 505-617   | CPA 添加弹窗               |
| `components/TitleBar.tsx`               | 619-676   | 窗口标题栏                 |
| `views/settings/GeneralSection.tsx`     | 919-1011  | 通用设置                   |
| `views/settings/AccountsSection.tsx`    | 1014-1362 | 账户管理（最大的 section） |
| `views/settings/DataSourceSection.tsx`  | 1364-1402 | 数据源                     |
| `views/settings/AppearanceSection.tsx`  | 1404-1472 | 外观                       |
| `views/settings/NotifySection.tsx`      | 1474-1516 | 通知                       |
| `views/settings/DataPrivacySection.tsx` | 1518-1608 | 数据与隐私                 |
| `views/settings/AboutSection.tsx`       | 1611-1659 | 关于                       |

额外问题：`AccountsSection` 内单账户行（1064-1175）与多账户行（1234-1354）逻辑几乎相同（masked key、toggle、edit、delete），应提取为 `AccountRow` 组件复用。

### 2.2 main/index.ts 拆分方案（852 → ~150 行）

| 新文件                           | 来源行           | 内容                                                           |
| -------------------------------- | ---------------- | -------------------------------------------------------------- |
| `main/window-config.ts`          | 72-175           | `SECURE_WEB_PREFS`、`WindowConfig`、`WINDOW_CONFIGS`、工厂函数 |
| `main/tray/tray-manager.ts`      | 515-801          | 托盘创建、左右键处理、托盘 IPC                                 |
| `main/popup/popup-positioner.ts` | 548-571, 711-734 | 弹窗定位逻辑（当前复制了 3 次）                                |
| `main/core/plugin/auto-seed.ts`  | 258-322          | 插件自动播种逻辑                                               |
| `main/bootstrap.ts`              | 209-400          | store/服务接线、IPC 注册                                       |

### 2.3 PopupView.tsx 拆分方案（653 → ~200 行）

| 新文件                    | 来源行         | 内容                                     |
| ------------------------- | -------------- | ---------------------------------------- |
| `hooks/useDragReorder.ts` | 296-369        | 拖拽重排逻辑                             |
| `lib/status-bar.ts`       | 41-77, 379-398 | 状态栏计算（纯函数）                     |
| `lib/auth-detection.ts`   | 19-28          | 认证错误检测（当前与 ProviderCard 重复） |

### 2.4 ProviderCard.tsx 拆分方案（524 → ~150 行）

| 新文件                              | 来源行  | 内容                          |
| ----------------------------------- | ------- | ----------------------------- |
| `components/UsageBar.tsx`           | 39-104  | 用量条渲染（65 行自包含函数） |
| `hooks/useDropdownMenu.ts`          | 231-261 | 菜单打开/关闭逻辑             |
| `components/ProviderCardHeader.tsx` | 275-313 | 头部                          |
| `components/ProviderCardTools.tsx`  | 315-394 | 工具栏                        |

---

## 三、重复代码

| 重复项                              | 位置 1                                   | 位置 2                                                | 建议                                                            |
| ----------------------------------- | ---------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------- |
| `toDTO` 函数                        | `src/main/ipc/event-ipc.ts:8`            | `src/main/ipc/plugin-ipc.ts:19`                       | 提取到共享工具                                                  |
| `relativeTime` 函数                 | `src/renderer/lib/utils.ts:8`            | `src/renderer/components/CpaConnectorSettings.tsx:67` | 删除后者，import 前者                                           |
| `PROVIDER_LABELS` 常量              | `src/renderer/lib/provider-usage.ts:55`  | `src/renderer/components/CpaConnectorSettings.tsx:15` | 删除后者，import 前者                                           |
| `format_rel_time` vs `relativeTime` | `src/renderer/lib/rel-time.ts` (整文件)  | `src/renderer/lib/utils.ts:8`                         | `rel-time.ts` 功能与 `utils.ts` 重复，删除并在调用处统一 import |
| `IpcResult<T>` 类型                 | `src/main/ipc/helpers.ts:3`              | `src/shared/types/ipc.ts:119`                         | 两个形状略有不同（`readonly` 差异），统一为一个                 |
| 认证错误检测                        | `src/renderer/views/PopupView.tsx:20-28` | `src/renderer/components/ProviderCard.tsx:106-117`    | 提取到 `lib/auth-detection.ts`                                  |
| 弹窗定位逻辑                        | `src/main/index.ts:548-571`              | `src/main/index.ts:711-734`                           | 同一文件内复制 3 次，提取为函数                                 |

---

## 四、潜在 Bug

### 4.1 硬编码版本号

`src/renderer/views/SettingsView.tsx:681` — `const version = "1.0.0"` 硬编码。应从 `package.json` 或 Electron API 读取。

### 4.2 Icon 组件 XSS 风险

`src/renderer/components/Icon.tsx:64,129` — 使用 `dangerouslySetInnerHTML` 渲染 SVG。当前 `UI_ICONS` 和 `VENDOR_MARKS` 都是静态字符串字面量，不构成实际风险，但 `name` 参数无校验——如果 `UI_ICONS[name]` 返回 `undefined`，回退为空串（安全），无问题。**低风险，记录即可。**

### 4.3 ProviderCard 中 reset_at 参数部分丢弃

`src/renderer/components/ProviderCard.tsx:46-104` — `render_bar_row` 函数接受 `reset_at` 参数，但在 null-value 分支（62 行）和 ratio 分支（83 行）中该参数被渲染为空 span，仅在 percent 分支（101 行）实际使用。不是 bug 但可能导致用户看不到重置时间。

---

## 五、命名规范违规（CLAUDE.md 要求 snake_case）

以下列出不合规的 camelCase 函数名（仅列 renderer 层，main 层基本合规）：

| 文件                         | 行号 | 当前命名                   | 应改为                        |
| ---------------------------- | ---- | -------------------------- | ----------------------------- |
| `CpaConnectorSettings.tsx`   | 44   | `getDefaultValue`          | `get_default_value`           |
| `CpaConnectorSettings.tsx`   | 48   | `isEnabledValue`           | `is_enabled_value`            |
| `CpaConnectorSettings.tsx`   | 52   | `getSnapshotItems`         | `get_snapshot_items`          |
| `CpaConnectorSettings.tsx`   | 58   | `getStatus`                | `get_status`                  |
| `CpaConnectorSettings.tsx`   | 80   | `groupAccounts`            | `group_accounts`              |
| `CpaConnectorSettings.tsx`   | 146  | `handleSubmit`             | `handle_submit`               |
| `CpaConnectorSettings.tsx`   | 193  | `handleRemove`             | `handle_remove`               |
| `SettingsForm.tsx`           | 38   | `handleSubmit`             | `handle_submit`               |
| `provider-usage.ts`          | 111  | `buildProviderUsageGroups` | `build_provider_usage_groups` |
| `provider-usage.ts`          | 170  | `getVisibleProviders`      | `get_visible_providers`       |
| `provider-usage.ts`          | 190  | `resolveConvergentTime`    | `resolve_convergent_time`     |
| `provider-usage.ts`          | 228  | `buildOverviewForGroup`    | `build_overview_for_group`    |
| `utils.ts`                   | 8    | `relativeTime`             | `relative_time`               |
| `utils.ts`                   | 23   | `formatResetTime`          | `format_reset_time`           |
| `use-config.ts`              | 16   | `useConfig`                | `use_config`                  |
| `use-plugins.ts`             | 14   | `usePlugins`               | `use_plugins`                 |
| `use-popup-height-report.ts` | 21   | `usePopupHeightReport`     | `use_popup_height_report`     |
| `use-route.ts`               | 5    | `useRoute`                 | `use_route`                   |

> **注**: React 组件名（`ProviderCard`、`SettingsView` 等）和 React 自带属性名（`onClick`、`onChange`）属于 React 惯例，不在违规范围内。但自定义函数、变量、hooks 均应遵循 snake_case。PopupView.tsx 内部混用严重（`handleRefreshAll` vs `toggle_account`），需统一。

---

## 六、其他问题

### 6.1 缺失的交互实现

SettingsView 中至少 **7 个按钮/操作** 无实际功能（见 1.4 节），用户点击无响应。其中 "清除缓存"、"重置应用"、"检查更新" 是用户可感知的功能缺失。

### 6.2 CpaAddDialog 完整流程缺失

`src/renderer/views/SettingsView.tsx:505-617` — 整个 CPA 添加弹窗的表单数据收集了但没有任何保存/同步逻辑。用户填写后点"保存并同步"无反应。这是一个不完整的功能。

### 6.3 ProviderAccountGroup 接口定义在组件函数体内

`src/renderer/views/SettingsView.tsx:698` — 接口定义在函数内部，每次渲染都会重新声明。虽不影响功能，但不符合惯例，应提到模块级别。

---

## 七、总结

| 类别                                    | 数量   |
| --------------------------------------- | ------ |
| 死文件（整文件未使用）                  | 2      |
| 死导出符号                              | 7      |
| 功能性死代码（无 onClick / 重复处理器） | 8 处   |
| 超大文件（> 500 行）                    | 4      |
| 重复代码                                | 7 组   |
| 命名规范违规                            | 18+ 处 |
| 潜在 Bug / 功能缺失                     | 4      |

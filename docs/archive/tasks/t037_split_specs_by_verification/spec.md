# Task spec

## 背景

specs_index.md 无法看出每个 spec 用什么方式验证（API / Web / Desktop）。5 个 spec 内容混杂多种验证路径，需拆分让每个 spec 有单一验证方式，便于测试选型与回归。

## 范围

### 拆分 5 个混杂 spec

旧 spec 移入 `docs/archive/specs/`（保留历史），新建子 spec：

| 旧                 | 拆分后                                                                                        | 验证方式 |
| ------------------ | --------------------------------------------------------------------------------------------- | -------- |
| ai-cli-token-stats | ai-cli-token-stats-api（数据模型/reader/store + LocalAPI 端点）                               | API      |
|                    | ai-cli-token-stats-desktop（utilityProcess 子进程 + tokenStats:\* IPC + 窗口配置 + 托盘入口） | Desktop  |
|                    | ai-cli-token-stats-ui（TokenStatsView React 组件）                                            | Web      |
| connector-cpa      | connector-cpa-runtime（三层 ID/去重/错误归属/聚合算法）                                       | API      |
|                    | connector-cpa-ui（用量面板聚合卡片 + 设置页 CPA 行交互）                                      | Web      |
| ipc                | ipc-api（有 LocalAPI 对应的 channel + IpcResult/DTO 数据形状）                                | API      |
|                    | ipc-electron（popup/settings/mainPanel/tray/auth/session/grok/theme/test + sender allowlist） | Desktop  |
| platform-services  | platform-services-api（LocalAPI server + NetClient + Logger + paths）                         | API      |
|                    | platform-services-electron（SessionManager 受控窗 + webRequest + persist 分区）               | Desktop  |
| ui-views           | ui-views-web（PopupView + SettingsView + TokenStatsView + provider-usage）                    | Web      |
|                    | ui-views-desktop（TrayMenu frameless 窗 + 托盘图标系统）                                      | Desktop  |

### specs_index.md 改造

- 表头加「验证方式」列（API / Web / Desktop）
- 每行填验证方式
- 顶部加验证方式分类说明段（API = LocalAPI 端点/程序化接口；Web = 浏览器访问 web SPA；Desktop = 必须 Electron 桌面端）
- 旧混杂 spec 行删除，加拆分后子 spec 行（task 清单列注明拆自哪个 + 拆分日期）

## 非范围

- 不改 spec 技术内容（只按验证方式分割到不同文件）
- 不改代码
- 9 个纯类 spec（config-store/connector-direct/connector-runtime/observation-store/scheduler/secret-vault=API，web-panel=Web，connector-session/window-management=Desktop）不拆，仅 specs_index 填验证方式

## 验收标准

- [ ] 5 个混杂 spec 各拆成 2-3 个子 spec，旧文件移 archive
- [ ] specs_index.md 含验证方式列，每行标注
- [ ] specs_index.md 顶部含分类说明段
- [ ] 拆分后 spec 总数 = 9（纯）+ 12（拆分）= 21
- [ ] 拆分子 spec 内无内容混杂（单一验证方式）

## 依赖与约束

- 纯文档重构，无红/绿测试
- 黑盒 = grep 核对 specs_index 一致性

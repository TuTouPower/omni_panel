<!-- omni_powers: blueprint/spec_index -->

# spec 索引

OmniUsage 已实现功能清单。每项指向 `specs/{feature}.md`。技术栈/架构见 `architecture.md`，术语/业务不变量见 `domain.md`，安全限制不在本页（见各 spec 边界段 + `architecture.md` §6）。

## 采集层

| spec                                            | 功能                                                                                                                                         |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| [connector-runtime](specs/connector-runtime.md) | 连接器执行共享机制：manifest schema、ConnectorContext、stdout 协议、vm 沙箱、能力分发、NetClient                                             |
| [connector-direct](specs/connector-direct.md)   | 11 个直连连接器（claude/codex/deepseek/glm/minimax/tavily/firecrawl/mimo/kimi/opencode_go/antigravity），poll/local/observe/session 能力映射 |
| [connector-cpa](specs/connector-cpa.md)         | CPA 聚合数据源：三层 ID 解耦、跨源去重、account 级错误归属、聚合计算、隐藏 vs 删除所有权                                                     |
| [connector-session](specs/connector-session.md) | session 型受控网页登录：webRequest 捕获 cookie、后台续期、触发再登录                                                                         |

## 存储层

| spec                                            | 功能                                                                                      |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [observation-store](specs/observation-store.md) | SQLite 观测表、observedAt 最新胜出、历史保留与 prune、WAL 配置                            |
| [config-store](specs/config-store.md)           | AppConfiguration/ConnectorConfiguration schema、防抖原子写、载入加固、零散迁移、auto-seed |
| [secret-vault](specs/secret-vault.md)           | AES-256-GCM 自管密钥、vault.key、keyFor 命名、最小暴露、日志脱敏、明文导入导出、威胁模型  |

## 宿主平台

| spec                                            | 功能                                                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [scheduler](specs/scheduler.md)                 | connector-scheduler + orchestrator + refresh-service + runtime-store + snapshot-cache 四模块协作       |
| [platform-services](specs/platform-services.md) | LocalAPI（127.0.0.1 ingest/网关/health）、NetClient（undici 出口/SSRF）、SessionManager、Logger、paths |

## 消费层

| spec                                            | 功能                                                                                          |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [ipc](specs/ipc.md)                             | IPC_CHANNELS 全量、UsageboardApi、安全 prefs、数据形状（SnapshotDTO/ConnectorInfo/IpcResult） |
| [window-management](specs/window-management.md) | popup/settings/tray_menu 三窗、mainPanelMode、动态高度、主题、close-action                    |
| [ui-views](specs/ui-views.md)                   | PopupView/SettingsView/TrayMenu 三视图、provider-usage 数据管线、国际化                       |

## 跨切面

- 安全边界与已知限制：`architecture.md` §3 / §6
- 业务不变量（账号≠用量条、采集维度≠展示维度等）：`domain.md` §4
- 编码约定与新增连接器步骤：`conventions.md` §5
- 测试分层与打包 smoke：`test.md`

## 未实现（不在此，留 /opintake）

新增功能 / 已规划未落地项（如 isolated-vm 真隔离、可选主口令、observe 自适应探测完整版）走 `/opintake` 拆分。已知技术债见 GitHub Issues（`tech-debt` 标签）+ `PLAN.md`（已归档至 `docs/archive/_pre_opinit_20260705/`）。

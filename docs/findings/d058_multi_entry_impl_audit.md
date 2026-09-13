# d058 同一功能多入口实现审计（桌面 IPC / LocalAPI+Web / CLI）

- 来源：日常审计（2026-09-14，用户报告桌面导入 web 导出配置失败后全仓排查）
- 结论：配置、密钥、控制、查询等能力在桌面 IPC、LocalAPI/Web、CLI 三条入口各有一份独立实现，输入形状、校验强度、默认值、持久化语义已多处漂移；不存在统一 service 层。
- 证据（均为核实过的 file:line）：
    - 配置导出/导入：`src/main/ipc/config-ipc.ts:547`（桌面，wrapper `formatVersion:1`，强制含明文密钥）vs `config-ipc.ts:435`（LocalAPI/Web，裸 config + `includeSecrets`）vs `src/main/cli/import-config.ts:39`（CLI，只接受裸 config）。三态输入；vault 写入 Web/桌面 `importAll`→replace-all，CLI 逐 key `set`→merge。实测桌面导入 web 导出文件报「不支持的导入文件版本」（`undefined !== 1`）。
    - 连接器身份：`ConnectorConfiguration.executablePath`（`src/shared/types/config.ts:118`）是平台绝对路径，同时当身份键：`hydrate-runtime-store.ts:25`、`auth-ipc.ts:53`、`refresh-service.ts:249`、`secret_param_keys.ts:13`、`config-store.ts:194`、`config-ipc.ts:488`。跨平台/移动安装即失配；`auto-seed.ts:47-51` 每次启动按 id 回填路径当补丁。Linux→macOS 导入必报「未知连接器路径」。
    - 密钥接口鉴权：`/v1/secrets`、`/v1/config` 在 `src/main/core/local-api/server.ts:1629` 位于 `check_auth` 之前，免认证；桌面同操作要求 `#setting` 路由（`config-ipc.ts:680`）。
    - `launchAtLogin`：设置页只写 config（`general_section.tsx:100`），主进程无消费者；真实生效为 tray（`index.ts:1162`）与 CLI（`client.ts:230`）各自的 `setLoginItemSettings`。
    - 暂停态：tray 本地 `is_paused`（`index.ts:1077/1149`）vs control 直调 orchestrator（`index.ts:716`），无双向广播。
    - 会话历史 query/searchContent/summaries：`src/main/ipc/session-history-ipc.ts:100-410` 与 `server.ts:245-572` 各一份，校验与常量漂移。
    - trend：`trend-ipc.ts:18` vs `server.ts:1547`；token-stats limit 校验 `token-stats-ipc.ts:36` vs `server.ts:1510`；dashboard `sources_status` `token-stats-ipc.ts:185` vs `server.ts:1304` 缺失。
    - cookie 登录：阻塞版 `auth-ipc.ts:45` vs 启动版 `auth-ipc.ts:92`（经 `server.ts:942`），返回形状/错误码不同。
    - 配置写入并发：`saveIfBaseMatches`（`config-ipc.ts:195`）vs 直接 `save`（`config-ipc.ts:516`、`import-config.ts:117`）。
    - 主题：`src/renderer/lib/theme.ts:4`、`src/web/usageboard-web.ts:124`、主进程 `event-ipc.ts:78` 三处各自应用；`config.save({theme})`（含导入）不更新主进程 `nativeTheme`。
- 影响：跨平台/跨入口行为不一致、配置无法迁移、安全边界两侧不等价、多处 UI 开关是死代码。后续新增入口须复用统一 service，禁止再写第二条实现。
- 现状：有效

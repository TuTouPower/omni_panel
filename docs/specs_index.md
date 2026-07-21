# 当前生效 spec 清单

在表即生效。每个 task step 7 收尾累积更新（须已过黑盒）；废弃时整行删除，spec 移入 `docs/archive/specs/`。历史清单由 `docs/archive/specs/` 目录承载。

## 验证方式分类

| 方式        | 含义                                                                                          | 验证手段                                                                                                |
| ----------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **API**     | 后端数据层 / LocalAPI HTTP 端点 / 连接器脚本契约，程序化可验                                  | `curl http://localhost:<port>/v1/*`、vitest 单元/集成（真实 better-sqlite3）、`pnpm test:contract:live` |
| **Web**     | web SPA（`out/web`）可渲染验证，不需 Electron 桌面端                                          | `pnpm test:e2e:web`（chromium + mock local-api）、浏览器访问 `http://localhost:<port>/`                 |
| **Desktop** | 必须 Electron 桌面端（BrowserWindow/Tray/utilityProcess/webRequest/nativeTheme/powerMonitor） | `pnpm test:e2e:electron`（真实 Electron）、`pnpm test:packaged`（CDP 连 exe）                           |

分界标志：含 `BrowserWindow`/`Tray`/`utilityProcess.fork`/`webRequest`/`nativeTheme`/`persist:` 分区 = Desktop；其余 UI 渲染 = Web；数据/HTTP/脚本 = API。

## spec 清单

| slug                       | 验证方式 | task 清单                       | 最后固化时间 |
| -------------------------- | -------- | ------------------------------- | ------------ |
| ai-cli-token-stats-api     | API      | 拆自 ai-cli-token-stats（t037） | 2026-07-21   |
| ai-cli-token-stats-desktop | Desktop  | 拆自 ai-cli-token-stats（t037） | 2026-07-21   |
| ai-cli-token-stats-ui      | Web      | 拆自 ai-cli-token-stats（t037） | 2026-07-21   |
| config-store               | API      | 迁移自 omni_powers，t038        | 2026-07-22   |
| connector-cpa-runtime      | API      | 拆自 connector-cpa（t037）      | 2026-07-21   |
| connector-cpa-ui           | Web      | 拆自 connector-cpa（t037）      | 2026-07-21   |
| connector-direct           | API      | 迁移自 omni_powers，t039        | 2026-07-22   |
| connector-runtime          | API      | 迁移自 omni_powers，无          | 2026-07-05   |
| connector-session          | Desktop  | 迁移自 omni_powers，无          | 2026-07-05   |
| ipc-api                    | API      | 拆自 ipc（t037）                | 2026-07-21   |
| ipc-electron               | Desktop  | 拆自 ipc（t037）                | 2026-07-21   |
| observation-store          | API      | 迁移自 omni_powers，无          | 2026-07-05   |
| platform-services-api      | API      | 拆自 platform-services（t037）  | 2026-07-21   |
| platform-services-electron | Desktop  | 拆自 platform-services（t037）  | 2026-07-21   |
| scheduler                  | API      | 迁移自 omni_powers，t039        | 2026-07-22   |
| secret-vault               | API      | 迁移自 omni_powers，无          | 2026-07-05   |
| ui-views-web               | Web      | 拆自 ui-views（t037），t040     | 2026-07-22   |
| ui-views-desktop           | Desktop  | 拆自 ui-views（t037）           | 2026-07-21   |
| web-panel                  | Web      | 迁移自 omni_powers，无          | 2026-07-05   |
| window-management          | Desktop  | 迁移自 omni_powers，无          | 2026-07-05   |

替代旧需求可在备注 `supersedes: <old_slug>`。

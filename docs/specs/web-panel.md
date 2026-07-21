# Web 面板（浏览器访问）

> 范围：让用户在局域网浏览器里查看并操作用量面板、设置面板、代理面板。桌面 app 启动时开启本地 HTTP server。

## 1. 定位

- 桌面 app（Electron）启动时拉起 `local-api` HTTP server，绑 `0.0.0.0:17863`。
- 同一份 React UI 编译为浏览器可加载的 SPA（`pnpm build:web` → `out/web/`），由 local-api 静态托管。
- 浏览器里的 `window.usageboard` 由 `src/web/usageboard-web.ts` 提供，fetch local-api REST 端点。
- 托盘菜单「网页访问」项用系统浏览器打开 `http://localhost:<port>/`，走 `tray:openWeb` 通道（`src/shared/types/ipc.ts` `TRAY_OPEN_WEB`）。

## 2. 安全决策（已确认）

- **局域网使用，不考虑安全**：server 绑 `0.0.0.0`，web 路由免 Bearer 认证。
- **secrets 明文返回**：`GET /v1/secrets` 返回 API key/cookie 明文。局域网任意设备可读。
- **ingest 保留 token**：`POST /v1/ingest` 仍需 Bearer（不破坏现有采集客户端）。
- **native 操作隐藏**：Electron-only 控件（隐藏到托盘、窗口 min/max/close、重启、开机自启、托盘菜单）在 web 隐藏或 no-op。判定依据 `src/renderer/lib/is-web.ts`（`<html data-web>` 由 `install_web_usageboard` 设置）。

## 3. 端点

| 方法     | 路径                                                    | 说明                                                       | 认证   |
| -------- | ------------------------------------------------------- | ---------------------------------------------------------- | ------ |
| GET      | 所有非 `/v1/` 的 GET                                    | web SPA 静态资源（未命中文件走 index.html）                | 无     |
| GET      | `/v1/health`                                            | 存活检查                                                   | 无     |
| GET      | `/v1/records` `/v1/sessions` `/v1/buckets` `/v1/status` | 代理面板数据（query: agent/env/start/end）                 | 无     |
| GET      | `/v1/trend`                                             | 用量趋势序列（query: provider/accountId/metricId/days?=7） | 无     |
| GET      | `/v1/connectors`                                        | 连接器列表                                                 | 无     |
| POST     | `/v1/connectors`                                        | 触发全部连接器刷新                                         | 无     |
| GET      | `/v1/connectors/:id/state`                              | 单连接器状态                                               | 无     |
| POST     | `/v1/connectors/:id/refresh`                            | 触发单连接器刷新                                           | 无     |
| GET/POST | `/v1/config`                                            | 设置面板配置读/写                                          | 无     |
| GET/POST | `/v1/secrets`                                           | 密钥明文读/写（query/field: instanceId）                   | 无     |
| POST     | `/v1/ingest`                                            | observation 注入                                           | Bearer |

## 4. 构建

- `pnpm build:web`：`vite build --config vite.web.config.ts`，产物 `out/web/`，复用 renderer `App`，入口 `src/web/main-web.tsx` 先 `install_web_usageboard()`。
- main 在 app ready 时按 `out/web`（dev）/ `resources/web`（packaged）注入 `web_root`；不存在则不托管静态资源。

## 5. 数据新鲜度

- web 端无 IPC 推送；`tokenStats.onUpdated` 由 `usageboard-web` 内部 10s 轮询触发。

## 6. 面板间导航

- 代理面板顶栏「用量面板」「设置」按钮：web 模式 hash 导航（`#usage`/`#setting`），Electron 模式调 `tray.open_panel`/`settings.open` 开窗口。
- 用量面板 web 模式顶栏有「代理面板」入口（Electron 从托盘进）。

## 7. 别名（目录/模型归并）

`config.dirAliases` / `config.modelAliases` 让多个目录/模型归为同一标签：

- `{ alias, dirs[] }`：目录归并（柱状图 project 横轴 + 项目维度 series）
- `{ alias, models[] }`：模型归并（柱状图 model 维度 series）

设置面板「其他」section 的 `AliasEditor` 增删改；`prepareBarData` 通过 `build_resolver` 应用。TokenStatsView 启动时 `config.get()` 拉取并透传给 BarChart。

## 8. 未做 / 后续

- connector/session 写端点（账号增删、登录、刷新触发）：T7。
- SettingsView 窗口控制按钮的 `is_web` 精细化隐藏（当前 native 按钮在 web 点击为 no-op，不崩）。
- HTTPS / 跨网段访问 / 认证增强：按当前「局域网不考虑安全」决策不做。
